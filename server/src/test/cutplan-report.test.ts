import { describe, expect, it, vi } from 'vitest';

import { colorFromFileName, readCutPlanPage } from '../services/pdf/cutplan-report.js';
import { extractPdfTableText, type PdfTableExtractorDeps } from '../services/pdf/pdf-table-extractor.js';
import type { OcrWord } from '../services/pdf/table-reconstruct.js';

/**
 * Cada linha é uma lista de [x, texto]: monta as palavras como o leitor de
 * texto nativo do PDF devolve (com posição). Dados inventados, no formato do
 * PDF real do SCM CutPlan.
 */
function page(lines: Array<Array<[number, string]>>): OcrWord[] {
  const words: OcrWord[] = [];
  lines.forEach((line, row) => {
    for (const [left, text] of line) {
      words.push({ text, left, top: row * 14, width: text.length * 6, height: 10 });
    }
  });
  return words;
}

/** Cabeçalho comum às páginas: cliente à esquerda e título do material mais à direita, na mesma linha. */
const REPORT_HEADER: Array<Array<[number, string]>> = [
  [[3, 'Cliente'], [60, 'Teste'], [300, 'MDF'], [326, 'UNICOLOR'], [384, '15MM']],
  [[6, 'SCM'], [28, 'CutPlan']],
];

describe('readCutPlanPage — relatório (Cant / Base / Altura)', () => {
  const firstPage = page([
    ...REPORT_HEADER,
    [[28, 'Material:'], [88, 'MDF'], [111, 'UNICOLOR'], [170, '15MM']],
    [[28, 'Lista'], [60, 'de'], [80, 'placas'], [110, 'usadas']],
    [[28, 'Cant'], [80, 'Base'], [140, 'Altura'], [200, 'Detalhe']],
    [[28, '6'], [80, '2744.2'], [140, '1834.2'], [200, 'Chapa'], [240, 'Inteira']],
    [[28, 'Peças'], [60, 'cortadas']],
    [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura'], [230, 'Observación']],
    [[100, '2'], [140, '380'], [180, '370']],
    [[100, '6'], [140, '380'], [180, '2215']],
  ]);

  const lastPage = page([
    ...REPORT_HEADER,
    [[28, 'Peças'], [60, 'cortadas']],
    [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura']],
    [[100, '3'], [140, '200'], [180, '942']],
    [[28, 'Total'], [60, 'de'], [80, 'peças'], [110, 'cortadas'], [160, ':'], [170, '11']],
    [[28, 'Lista'], [60, 'de'], [80, 'cortes'], [110, 'utilizáveis']],
    [[28, 'Id'], [60, 'Cant'], [90, 'Base'], [130, 'Altura']],
    [[28, 'U1'], [60, '2'], [90, '120'], [130, '15.8']],
  ]);

  it('lê Cant como quantidade, Base como comprimento e Altura como largura, com o material do título', () => {
    const result = readCutPlanPage(firstPage);

    expect(result?.rows).toEqual([
      '2\t380\t370\tMDF UNICOLOR 15mm',
      '6\t380\t2215\tMDF UNICOLOR 15mm',
    ]);
  });

  it('não confunde a lista de chapas usadas nem a de sobras com peças', () => {
    expect(readCutPlanPage(firstPage)?.rows).toHaveLength(2);
    expect(readCutPlanPage(lastPage)?.rows).toEqual(['3\t200\t942\tMDF UNICOLOR 15mm']);
  });

  it('devolve o total de peças que o relatório informa', () => {
    expect(readCutPlanPage(lastPage)?.statedTotal).toBe(11);
    expect(readCutPlanPage(firstPage)?.statedTotal).toBeNull();
  });
});

describe('readCutPlanPage — plano de corte (Ref / Qtde / Comp / Largura)', () => {
  const sheet = (sheetCount: number) =>
    page([
      ...REPORT_HEADER.map((line) => line.map(([x, t]): [number, string] => [x, t === '15MM' ? '6MM' : t])),
      [[3, `${sheetCount}`], [20, 'de'], [40, '2744.2'], [80, 'x'], [90, '1834.2'], [140, 'Chapa'], [180, 'Inteira']],
      [[3, 'Peças'], [40, 'cortadas'], [300, 'Sobras'], [340, 'de'], [360, 'Recortes']],
      [[3, 'T'], [30, 'Ref.'], [80, 'Qtde.'], [130, 'Comp.'], [180, 'Largura'], [240, 'Detalhe']],
      [[30, '(2)'], [80, '1'], [130, '784'], [180, '2200'], [300, '(U1)'], [330, '1'], [345, 'de'], [360, '1447'], [390, 'x'], [400, '15.8']],
      [[30, '(5)'], [80, '1'], [130, '708'], [180, '977'], [300, '(U2)'], [330, '1'], [345, 'de'], [360, '484'], [390, 'x'], [400, '15.8']],
      [[3, 'Sobra'], [40, '='], [50, '8.903'], [90, '%']],
    ]);

  it('lê só o lado das peças, sem as sobras de recortes ao lado', () => {
    expect(readCutPlanPage(sheet(1))?.rows).toEqual([
      '1\t784\t2200\tMDF UNICOLOR 6mm',
      '1\t708\t977\tMDF UNICOLOR 6mm',
    ]);
  });

  it('não multiplica pelo "2 de ... Chapa Inteira": isso só diz quantas chapas o plano usou', () => {
    expect(readCutPlanPage(sheet(2))?.rows).toEqual([
      '1\t784\t2200\tMDF UNICOLOR 6mm',
      '1\t708\t977\tMDF UNICOLOR 6mm',
    ]);
  });
});

describe('colorFromFileName', () => {
  it.each([
    ['relatorio branco 15mnnnn.pdf', 'BRANCO'],
    ['RELATORIO TITANIO 18MMM.pdf', 'TITANIO'],
    ['plano itapua 18mm.pdf', 'ITAPUA'],
    ['relatorio itapua 6mm (1).pdf', 'ITAPUA'],
    ['C:\\Users\\x\\Downloads\\relatorio branco 6mmm.pdf', 'BRANCO'],
    ['relatorio branco gelo 15 mm.pdf', 'BRANCO GELO'],
  ])('%s -> %s', (fileName, color) => {
    expect(colorFromFileName(fileName)).toBe(color);
  });

  it('sem cor no nome do arquivo, ou com nome que não parece cor, devolve null', () => {
    expect(colorFromFileName('relatorio 15mm.pdf')).toBeNull();
    expect(colorFromFileName('plano.pdf')).toBeNull();
    expect(colorFromFileName('lista final do cliente joao silva 15mm.pdf')).toBeNull();
    expect(colorFromFileName('2284006 bc15mm.pdf')).toBeNull();
    expect(colorFromFileName(undefined)).toBeNull();
  });
});

describe('readCutPlanPage — cor do nome do arquivo', () => {
  const relatorio = page([
    ...REPORT_HEADER,
    [[28, 'Peças'], [60, 'cortadas']],
    [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura']],
    [[100, '2'], [140, '380'], [180, '370']],
  ]);

  it('põe a cor entre o nome do material e a espessura', () => {
    expect(readCutPlanPage(relatorio, 'BRANCO')?.rows).toEqual(['2	380	370	MDF UNICOLOR BRANCO 15mm']);
  });

  it('não repete a cor que já está no título', () => {
    expect(readCutPlanPage(relatorio, 'UNICOLOR')?.rows).toEqual(['2	380	370	MDF UNICOLOR 15mm']);
  });
});

describe('readCutPlanPage — outras páginas', () => {
  it('ignora uma página que não é do SCM CutPlan', () => {
    const words = page([[[3, 'Peças'], [40, 'cortadas']], [[3, 'Cant'], [50, 'Base'], [90, 'Altura']], [[3, '2'], [50, '380'], [90, '370']]]);

    expect(readCutPlanPage(words)).toBeNull();
  });

  it('página do CutPlan sem peças (só a lista de sobras) devolve vazio, para não cair no OCR', () => {
    const onlyOffcuts = page([
      ...REPORT_HEADER,
      [[28, 'Lista'], [60, 'de'], [80, 'cortes'], [110, 'utilizáveis']],
      [[28, 'Id'], [60, 'Cant'], [90, 'Base'], [130, 'Altura']],
      [[28, 'U1'], [60, '2'], [90, '120'], [130, '15.8']],
    ]);

    expect(readCutPlanPage(onlyOffcuts)).toEqual({ rows: [], statedTotal: null });
  });
});

describe('extractPdfTableText — SCM CutPlan', () => {
  it('junta as páginas numa tabela só e põe o total informado no fim, sem passar pelo OCR', async () => {
    const pageOne = page([
      ...REPORT_HEADER,
      [[28, 'Peças'], [60, 'cortadas']],
      [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura']],
      [[100, '2'], [140, '380'], [180, '370']],
    ]);
    const pageTwo = page([
      ...REPORT_HEADER,
      [[28, 'Peças'], [60, 'cortadas']],
      [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura']],
      [[100, '4'], [140, '550'], [180, '750']],
      [[28, 'Total'], [60, 'de'], [80, 'peças'], [110, 'cortadas'], [160, ':'], [170, '6']],
    ]);
    const recognizeWords = vi.fn().mockResolvedValue([] as OcrWord[]);
    const deps: PdfTableExtractorDeps = {
      extractNativePdfWords: vi.fn().mockResolvedValue([
        { pageNumber: 1, words: pageOne },
        { pageNumber: 2, words: pageTwo },
      ]),
      reconstructNativeTableRows: vi.fn().mockReturnValue(null),
      nativeTableRowsToText: vi.fn().mockReturnValue(''),
      renderPdfPages: vi.fn().mockResolvedValue([
        { pageNumber: 1, imageBuffer: Buffer.from('a') },
        { pageNumber: 2, imageBuffer: Buffer.from('b') },
      ]),
      detectRotation: vi.fn().mockResolvedValue(0),
      recognizeWords,
      reconstructTableText: vi.fn().mockReturnValue(null),
      rotateImage: vi.fn(),
      tesseractPath: 'tesseract',
      lang: 'por',
    };

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps);

    expect(text).toBe(
      [
        'Quantidade\tComprimento\tLargura\tMaterial',
        '2\t380\t370\tMDF UNICOLOR 15mm',
        '4\t550\t750\tMDF UNICOLOR 15mm',
        '',
        'Total de peças: 6',
      ].join('\n'),
    );
    expect(recognizeWords).not.toHaveBeenCalled();
  });

  it('usa a cor do nome do arquivo no material', async () => {
    const pageOne = page([
      ...REPORT_HEADER,
      [[28, 'Peças'], [60, 'cortadas']],
      [[3, 'Esquema'], [100, 'Cant'], [140, 'Base'], [180, 'Altura']],
      [[100, '2'], [140, '380'], [180, '370']],
    ]);
    const deps: PdfTableExtractorDeps = {
      extractNativePdfWords: vi.fn().mockResolvedValue([{ pageNumber: 1, words: pageOne }]),
      reconstructNativeTableRows: vi.fn().mockReturnValue(null),
      nativeTableRowsToText: vi.fn().mockReturnValue(''),
      renderPdfPages: vi.fn().mockResolvedValue([{ pageNumber: 1, imageBuffer: Buffer.from('a') }]),
      detectRotation: vi.fn().mockResolvedValue(0),
      recognizeWords: vi.fn().mockResolvedValue([] as OcrWord[]),
      reconstructTableText: vi.fn().mockReturnValue(null),
      rotateImage: vi.fn(),
      tesseractPath: 'tesseract',
      lang: 'por',
    };

    const text = await extractPdfTableText(Buffer.from('fake-pdf'), deps, { fileName: 'RELATORIO TITANIO 15MM.pdf' });

    expect(text).toBe('Quantidade\tComprimento\tLargura\tMaterial\n2\t380\t370\tMDF UNICOLOR TITANIO 15mm');
  });
});
