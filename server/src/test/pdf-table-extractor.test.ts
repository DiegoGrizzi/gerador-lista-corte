import { describe, expect, it, vi } from 'vitest';

import { extractPdfTableText, type PdfTableExtractorDeps } from '../services/pdf/pdf-table-extractor.js';
import type { OcrWord } from '../services/pdf/table-reconstruct.js';

/** Monta um conjunto de deps falsas — nunca toca PDF/Tesseract/imagem de verdade, só o sistema de arquivo temporário (writeTempImage/cleanupTempFile, os mesmos usados por ../ocr/tesseract-provider.ts). */
function fakeDeps(overrides: Partial<PdfTableExtractorDeps> = {}): PdfTableExtractorDeps {
  return {
    // Sem palavra nativa por padrão - cai direto pro caminho OCR (mesmo
    // comportamento de antes desta dependência existir), a menos que um
    // teste específico sobrescreva isso pra testar o caminho nativo.
    extractNativePdfWords: vi.fn().mockResolvedValue([]),
    reconstructNativeTableRows: vi.fn().mockReturnValue(null),
    nativeTableRowsToText: vi.fn().mockReturnValue(''),
    renderPdfPages: vi.fn().mockResolvedValue([{ pageNumber: 1, imageBuffer: Buffer.from('fake-page') }]),
    detectRotation: vi.fn().mockResolvedValue(0),
    recognizeWords: vi.fn().mockResolvedValue([] as OcrWord[]),
    reconstructTableText: vi.fn().mockReturnValue(null),
    rotateImage: vi.fn().mockImplementation((path: string) => Promise.resolve(path.replace('.png', '-rotated.png'))),
    tesseractPath: 'tesseract',
    lang: 'por',
    ...overrides,
  };
}

describe('extractPdfTableText', () => {
  it('devolve o texto reconstruído de uma página com tabela reconhecida', async () => {
    const deps = fakeDeps({
      reconstructTableText: vi.fn().mockReturnValue('Item\tDescrição\nA\tPeça 1'),
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1');
  });

  it('ignora em silêncio páginas sem tabela reconhecível (ex: só o desenho do plano de corte)', async () => {
    const deps = fakeDeps({
      renderPdfPages: vi.fn().mockResolvedValue([
        { pageNumber: 1, imageBuffer: Buffer.from('pagina-desenho') },
        { pageNumber: 2, imageBuffer: Buffer.from('pagina-lista') },
      ]),
      reconstructTableText: vi
        .fn()
        .mockReturnValueOnce(null) // página 1, tentativa psm 3: só desenho, sem tabela
        .mockReturnValueOnce(null) // página 1, tentativa psm 6: idem — página é mesmo ignorada
        .mockReturnValueOnce('Item\tDescrição\nA\tPeça 1'), // página 2, tentativa psm 3: lista de verdade
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1');
  });

  it('junta as tabelas de várias páginas, separadas por linha em branco', async () => {
    const deps = fakeDeps({
      renderPdfPages: vi.fn().mockResolvedValue([
        { pageNumber: 1, imageBuffer: Buffer.from('pagina-1') },
        { pageNumber: 2, imageBuffer: Buffer.from('pagina-2') },
      ]),
      reconstructTableText: vi
        .fn()
        .mockReturnValueOnce('Item\tDescrição\nA\tPeça 1')
        .mockReturnValueOnce('Item\tDescrição\nB\tPeça 2'),
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1\n\nItem\tDescrição\nB\tPeça 2');
  });

  it('devolve string vazia quando nenhuma página tem tabela reconhecível', async () => {
    const deps = fakeDeps(); // reconstructTableText sempre devolve null

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('');
  });

  it('rotaciona a imagem antes do OCR quando a rotação é detectada', async () => {
    const rotateImage = vi.fn().mockResolvedValue('/tmp/pagina-rotated.png');
    const recognizeWords = vi.fn().mockResolvedValue([]);
    const deps = fakeDeps({
      detectRotation: vi.fn().mockResolvedValue(270),
      rotateImage,
      recognizeWords,
    });

    await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(rotateImage).toHaveBeenCalledWith(expect.any(String), 270);
    // o OCR deve rodar na imagem JÁ rotacionada, não na original
    expect(recognizeWords).toHaveBeenCalledWith('tesseract', 'por', '/tmp/pagina-rotated.png', 3);
  });

  it('não rotaciona quando a rotação detectada é 0', async () => {
    const rotateImage = vi.fn();
    const deps = fakeDeps({ detectRotation: vi.fn().mockResolvedValue(0), rotateImage });

    await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(rotateImage).not.toHaveBeenCalled();
  });

  it('tenta psm 3 primeiro; só chama psm 6 se a primeira tentativa não reconhecer uma tabela', async () => {
    const recognizeWords = vi.fn().mockResolvedValue([]);
    const reconstructTableText = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce('Item\tDescrição\nA\tPeça 1');
    const deps = fakeDeps({ recognizeWords, reconstructTableText });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1');
    expect(recognizeWords).toHaveBeenNthCalledWith(1, 'tesseract', 'por', expect.any(String), 3);
    expect(recognizeWords).toHaveBeenNthCalledWith(2, 'tesseract', 'por', expect.any(String), 6);
  });

  it('não tenta psm 6 quando psm 3 já reconhece a tabela', async () => {
    const recognizeWords = vi.fn().mockResolvedValue([]);
    const reconstructTableText = vi.fn().mockReturnValue('Item\tDescrição\nA\tPeça 1');
    const deps = fakeDeps({ recognizeWords, reconstructTableText });

    await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(recognizeWords).toHaveBeenCalledTimes(1);
    expect(recognizeWords).toHaveBeenCalledWith('tesseract', 'por', expect.any(String), 3);
  });
});

describe('extractPdfTableText — texto nativo do PDF (sem OCR) quando disponível', () => {
  it('usa o texto nativo reconstruído e nem chama OCR nessa página, quando a página tem palavra nativa e bate com uma tabela conhecida', async () => {
    const recognizeWords = vi.fn();
    const nativeWords: OcrWord[] = [{ text: 'Peça', left: 0, top: 0, width: 10, height: 10 }];
    const deps = fakeDeps({
      extractNativePdfWords: vi.fn().mockResolvedValue([{ pageNumber: 1, pageWidth: 100, pageHeight: 100, words: nativeWords }]),
      reconstructNativeTableRows: vi.fn().mockReturnValue([{ funcao: 'Lateral' }] as never),
      nativeTableRowsToText: vi.fn().mockReturnValue('Peça\nLateral'),
      recognizeWords,
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Peça\nLateral');
    expect(recognizeWords).not.toHaveBeenCalled();
  });

  it('cai pro OCR quando a página tem palavra nativa mas não bate com nenhuma tabela conhecida (ex: página só com desenho, mas com algum texto solto)', async () => {
    const nativeWords: OcrWord[] = [{ text: 'algum texto solto', left: 0, top: 0, width: 10, height: 10 }];
    const deps = fakeDeps({
      extractNativePdfWords: vi.fn().mockResolvedValue([{ pageNumber: 1, pageWidth: 100, pageHeight: 100, words: nativeWords }]),
      reconstructNativeTableRows: vi.fn().mockReturnValue(null),
      reconstructTableText: vi.fn().mockReturnValue('Item\tDescrição\nA\tPeça 1'),
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1');
  });

  it('cai pro OCR quando a página não tem NENHUMA palavra nativa (PDF sem camada de texto, ex: "Imprimir para PDF" a partir de uma tela)', async () => {
    const reconstructNativeTableRows = vi.fn();
    const deps = fakeDeps({
      extractNativePdfWords: vi.fn().mockResolvedValue([{ pageNumber: 1, pageWidth: 100, pageHeight: 100, words: [] }]),
      reconstructNativeTableRows,
      reconstructTableText: vi.fn().mockReturnValue('Item\tDescrição\nA\tPeça 1'),
    });

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe('Item\tDescrição\nA\tPeça 1');
    expect(reconstructNativeTableRows).not.toHaveBeenCalled();
  });
});
