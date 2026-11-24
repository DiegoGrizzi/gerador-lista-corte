import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { cleanModelarTable, isModelarTableHeader } from '../services/pdf/modelar-table.js';
import {
  extractPdfTableText,
  type PdfTableExtractorDeps,
} from '../services/pdf/pdf-table-extractor.js';
import type { OcrWord } from '../services/pdf/table-reconstruct.js';

const HEADER =
  'Descrição\tQuantidad\tDimensão\tBorda\tDescrição\tda\tfita\tde\tborda\tVeio\tMatéria-prima\tObs.';

/** Trecho de uma saída real de OCR do PDF "Lista de Corte Simplificada" (Modelar) — ver fixtures/modelar-ocr-raw.txt. */
const SAMPLE = [
  HEADER,
  '\te\t\t\t\t\t\t\t\t\t\t',
  '5070-Lateral 15 (Dir)\t2\t2262 x 525 x 15\t\t19-1-Branco\t\t\t\t\t\tCores.Branco\tMDF 15\t',
  '\t\tTeo\t\t\t\t\t\t\t\t\t',
  '5111-Prateleira Linear de Madeira 15\t1 483.\tx504x15\t\t19-1-Branco\t\t\t\t\t\tCores.Branco\tMDF 15\t',
  '\t\tÍ\t\t\t\t\t\t\t\t\t',
  '(Móvel)\t\t\t\t\t\t\t\t\t\t\t',
  '15 (Fixa)\t1 400\tx 605 x 15\t\t19-1-Branco\t\t\t\t\t\tCores.Branco\tMDF 15\t4937-Divisória',
  '\t\tDm\t\t\t\t\t\t\t\t\t',
  '15\t1\t2330 x 605 x 15\t\t19-1-Branco\t\t\t\t\t\tCores.Branco\tMDF 15\t4930-Base',
  '5078-Fundo 6\t2\t2272 x 600 x 6\t\t\t\t\t\t\t\t\tCores.Branco\tMDF 6\t',
  '5151-Tamponamento Inferior 15\t1\t1646 x 550 x 15\t\t19-0.4-Cumaru\t\tRaiz\t\t\tPam\tDuratex.Essencial Wood.Cumaru MDF 15\t',
  '18\t1\t1660 x 350 x 18 Ff\t\t22-1-Cumaru\t\tRaiz\t\t\tPam\tDuratex.Essencial Wood.Cumaru Raiz MDF\t4919-Base',
  '\t\t\t\t\t\t\t\t\t\t\t18\t',
  '5530-Tamponamento Inferior 15\t1\t1800 x 450 x 15\t\t19-0.4-Grafite\t\t\t\t\t\tDuratex.Trama.Grafite MDF 15\t',
].join('\n');

function rowsOf(text: string): string[][] {
  return text
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'));
}

describe('isModelarTableHeader', () => {
  it('reconhece o cabeçalho com Matéria-prima e Dimensão', () => {
    expect(isModelarTableHeader(HEADER)).toBe(true);
  });

  it('não confunde com o cabeçalho de outras tabelas', () => {
    expect(isModelarTableHeader('Item\tDescrição\tQtde\tComprimento\tLargura\tMaterial')).toBe(
      false,
    );
  });
});

describe('cleanModelarTable', () => {
  it('devolve null quando o texto não é a tabela do Modelar', () => {
    expect(cleanModelarTable('Item\tDescrição\nA\tPeça 1')).toBeNull();
  });

  const cleaned = cleanModelarTable(SAMPLE)!;

  it('vira uma tabela limpa de 4 colunas, sem as linhas de lixo do desenho da borda', () => {
    expect(cleaned.split('\n')[0]).toBe('Descrição\tQuantidade\tDimensão\tMaterial');
    expect(rowsOf(cleaned)).toHaveLength(8);
  });

  it('lê quantidade e medidas, também quando o OCR gruda a quantidade na medida ("1 483." + "x504x15")', () => {
    const rows = rowsOf(cleaned);
    expect(rows[0]!.slice(1, 3)).toEqual(['2', '2262 x 525 x 15']);
    expect(rows[1]!.slice(1, 3)).toEqual(['1', '483 x 504 x 15']);
    expect(rows[2]!.slice(1, 3)).toEqual(['1', '400 x 605 x 15']);
  });

  it('monta a descrição: tira o código da frente e junta o começo que caiu na coluna Obs', () => {
    const descriptions = rowsOf(cleaned).map((r) => r[0]);
    expect(descriptions[0]).toBe('Lateral 15 (Dir)');
    expect(descriptions[2]).toBe('Divisória 15 (Fixa)'); // "15 (Fixa)" + "4937-Divisória"
    expect(descriptions[3]).toBe('Base 15'); // "15" + "4930-Base"
  });

  it('acrescenta o "(Móvel)" que ficou sozinho na linha de baixo', () => {
    expect(rowsOf(cleaned)[1]![0]).toBe('Prateleira Linear de Madeira 15 (Móvel)');
  });

  it('o material vem da coluna Matéria-prima, com a espessura da medida', () => {
    const materials = rowsOf(cleaned).map((r) => r[3]);
    expect(materials).toEqual([
      'MDF Branco 15mm',
      'MDF Branco 15mm',
      'MDF Branco 15mm',
      'MDF Branco 15mm',
      'MDF Branco 6mm',
      'MDF Duratex Essencial Wood Cumaru 15mm',
      'MDF Duratex Essencial Wood Cumaru Raiz 18mm',
      'MDF Duratex Trama Grafite 15mm',
    ]);
  });

  it('linha com medida mas sem quantidade legível vira quantidade 0, para ir à conferência em vez de entrar adivinhada', () => {
    const text = cleanModelarTable(
      [
        HEADER,
        '15mm (Frontal)\tÉ 80\tx 200 x 15\t\t19-1-Titânio\t\tDuratex.Trama.Titânio MDF 15\t4761-Sarrafo',
      ].join('\n'),
    )!;
    const [description, quantity, dimension] = rowsOf(text)[0]!;
    expect(description).toContain('QUANTIDADE NÃO LIDA');
    expect(quantity).toBe('0');
    expect(dimension).toBe('80 x 200 x 15');
  });

  it('devolve null se a tabela não tiver nenhuma linha de peça', () => {
    expect(cleanModelarTable([HEADER, '\te\t\t\t'].join('\n'))).toBeNull();
  });
});

describe('cleanModelarTable — saída real de OCR do PDF inteiro', () => {
  // Num checkout do Windows o git pode trocar o fim de linha da fixture por CRLF.
  const raw = readFileSync(new URL('./fixtures/modelar-ocr-raw.txt', import.meta.url), 'utf8');
  const pages = raw.replace(/\r\n/g, '\n').split('\n\n');
  const cleanedPages = pages.map((page) => cleanModelarTable(page));

  it('reconhece as 6 páginas', () => {
    expect(pages).toHaveLength(6);
    expect(cleanedPages.every((page) => page != null)).toBe(true);
  });

  it('todas as linhas com medida viram uma linha de peça (uma só fica sem quantidade, "É" no lugar do "1")', () => {
    const rows = cleanedPages.flatMap((page) => rowsOf(page!));
    expect(rows).toHaveLength(149);
    expect(rows.filter((r) => r[1] === '0')).toHaveLength(1);
    expect(rows.every((r) => /^\d+(?:[.,]\d+)? x \d+(?:[.,]\d+)? x \d+$/.test(r[2]!))).toBe(true);
  });

  it('nenhuma linha fica sem material', () => {
    const rows = cleanedPages.flatMap((page) => rowsOf(page!)).filter((r) => r[1] !== '0');
    expect(rows.every((r) => r[3]!.startsWith('MDF '))).toBe(true);
    expect(new Set(rows.map((r) => r[3]))).toEqual(
      new Set([
        'MDF Branco 15mm',
        'MDF Branco 6mm',
        'MDF Duratex Essencial Wood Cumaru 15mm',
        'MDF Duratex Essencial Wood Cumaru 6mm',
        'MDF Duratex Essencial Wood Cumaru Raiz 18mm',
        'MDF Duratex Trama Grafite 15mm',
        'MDF Duratex Trama Titânio 15mm',
        'MDF Duratex Trama Titânio 18mm',
      ]),
    );
  });
});

describe('extractPdfTableText com a tabela do Modelar', () => {
  it('limpa a tabela lida por OCR antes de devolver o texto', async () => {
    const deps: PdfTableExtractorDeps = {
      extractNativePdfWords: vi.fn().mockResolvedValue([]),
      reconstructNativeTableRows: vi.fn().mockReturnValue(null),
      nativeTableRowsToText: vi.fn().mockReturnValue(''),
      renderPdfPages: vi
        .fn()
        .mockResolvedValue([{ pageNumber: 1, imageBuffer: Buffer.from('fake-page') }]),
      detectRotation: vi.fn().mockResolvedValue(0),
      recognizeWords: vi.fn().mockResolvedValue([] as OcrWord[]),
      reconstructTableText: vi.fn().mockReturnValue(SAMPLE),
      rotateImage: vi.fn().mockImplementation((path: string) => Promise.resolve(path)),
      tesseractPath: 'tesseract',
      lang: 'por',
    };

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text.split('\n')[0]).toBe('Descrição\tQuantidade\tDimensão\tMaterial');
    expect(text).toContain('Lateral 15 (Dir)\t2\t2262 x 525 x 15\tMDF Branco 15mm');
  });
});
