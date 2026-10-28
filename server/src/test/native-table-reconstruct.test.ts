import { describe, expect, it } from 'vitest';

import { reconstructNativeTableRows, nativeTableRowsToText } from '../services/pdf/native-table-reconstruct.js';
import type { OcrWord } from '../services/pdf/table-reconstruct.js';

/** Atalho pra criar uma palavra nativa de teste sem repetir os 4 campos toda vez. */
function word(text: string, left: number, top: number, width = 20, height = 10): OcrWord {
  return { text, left, top, width, height };
}

/**
 * Cabeçalho de teste espelhando o real (Cortecloud Central): "Função da" /
 * "peça" quebrado em duas linhas de verdade (alturas diferentes), o resto
 * das colunas numa linha só, mais abaixo.
 */
const HEADER_WORDS: OcrWord[] = [
  word('Função', 0, 0),
  word('da', 60, 0),
  word('peça', 0, 10),
  word('Qtde', 100, 10),
  word('Cliente', 150, 10),
  word('Chapa', 200, 10),
  word('Girar', 280, 10),
  word('Fita', 320, 10),
  word('C1', 450, 10),
  word('C2', 480, 10),
  word('L1', 510, 10),
  word('L2', 540, 10),
  word('Usinar', 600, 10),
];

describe('reconstructNativeTableRows', () => {
  it('reconstrói duas peças, incluindo uma com nome quebrado em duas linhas e fita só em C1/C2', () => {
    const words: OcrWord[] = [
      ...HEADER_WORDS,
      // peça 1 - tudo numa linha só, fita nos 4 lados (só o círculo de cima importa - inclui o par empilhado pra testar isso)
      word('1', 0, 30, 8),
      word('Lateral', 10, 30),
      word('direita', 60, 30),
      word('1', 100, 30, 8),
      word('Cliente', 150, 30),
      word('Branco', 200, 30),
      word('2200.0', 250, 30, 30),
      word('550.0', 285, 30, 30),
      word('●', 280, 30, 6),
      word('Fita', 320, 30),
      word('Branco', 360, 30),
      word('●', 450, 30, 6),
      word('○', 450, 40, 6),
      word('●', 480, 30, 6),
      word('○', 480, 40, 6),
      word('●', 510, 30, 6),
      word('○', 510, 40, 6),
      word('●', 540, 30, 6),
      word('○', 540, 40, 6),
      word('○', 600, 30, 6),

      // peça 2 - nome quebrado em duas linhas visuais, fita só em C1/C2
      word('2', 0, 60, 8),
      word('Rodapé', 10, 60),
      word('1', 100, 60, 8),
      word('Cliente', 150, 60),
      word('Branco', 200, 60),
      word('1385.0', 250, 60, 30),
      word('80.0', 285, 60, 30),
      word('●', 280, 60, 6),
      word('Fita', 320, 60),
      word('Branco', 360, 60),
      word('●', 450, 60, 6),
      word('●', 480, 60, 6),
      word('○', 510, 60, 6),
      word('○', 540, 60, 6),
      word('○', 600, 60, 6),
    ];

    const rows = reconstructNativeTableRows(words);

    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows![0]).toMatchObject({
      funcao: 'Lateral direita',
      qtde: '1',
      chapa: 'Branco',
      compr: '2200.0',
      larg: '550.0',
      c1: true,
      c2: true,
      l1: true,
      l2: true,
    });
    expect(rows![1]).toMatchObject({
      funcao: 'Rodapé',
      qtde: '1',
      chapa: 'Branco',
      compr: '1385.0',
      larg: '80.0',
      c1: true,
      c2: true,
      l1: false,
      l2: false,
    });
  });

  it('filtra o ruído do rodapé de página (URL) que cairia dentro da última peça', () => {
    const words: OcrWord[] = [
      ...HEADER_WORDS,
      word('1', 0, 30, 8),
      word('Lateral', 10, 30),
      word('1', 100, 30, 8),
      word('Cliente', 150, 30),
      word('Branco', 200, 30),
      word('2200.0', 250, 30, 30),
      word('550.0', 285, 30, 30),
      word('●', 280, 30, 6),
      // ruído do rodapé - cai logo abaixo, sem espinha própria, dentro do
      // intervalo vertical da última peça (mesma posição x da função)
      word('https://revenda.cortecloud.com.br/#/', 10, 45),
    ];

    const rows = reconstructNativeTableRows(words);

    expect(rows).not.toBeNull();
    expect(rows![0]!.funcao).toBe('Lateral');
  });

  it('devolve null quando não há nenhuma "espinha" (par de medidas) reconhecível', () => {
    const words: OcrWord[] = [...HEADER_WORDS, word('Sem nenhuma peça aqui', 10, 30)];

    expect(reconstructNativeTableRows(words)).toBeNull();
  });

  it('devolve null quando falta algum cabeçalho essencial (ex: página de outro relatório)', () => {
    const words: OcrWord[] = [word('Algo', 0, 0), word('1200.0', 100, 30, 30), word('500.0', 140, 30, 30)];

    expect(reconstructNativeTableRows(words)).toBeNull();
  });

  it('devolve null para uma lista de palavras vazia', () => {
    expect(reconstructNativeTableRows([])).toBeNull();
  });
});

describe('nativeTableRowsToText', () => {
  it('monta um bloco de texto com cabeçalho reconhecível pelo parser (Comprimento/Largura/Chapa, não C/L)', () => {
    const text = nativeTableRowsToText([
      {
        funcao: 'Lateral direita',
        qtde: '1',
        chapa: 'Branco 15mm',
        compr: '2200.0',
        larg: '550.0',
        fita: 'Fita Branco',
        c1: true,
        c2: true,
        l1: false,
        l2: false,
      },
    ]);

    const lines = text.split('\n');
    expect(lines[0]).toBe('Peça\tQtde\tChapa\tComprimento\tLargura\tFita\tC1\tC2\tL1\tL2');
    expect(lines[1]).toBe('Lateral direita\t1\tBranco 15mm\t2200.0\t550.0\tFita Branco\t✓\t✓\t\t');
  });
});

/**
 * Variante real do Cortecloud (marceneiro.cortecloud.com.br): cabeçalhos
 * C1/C2/L1/L2 são ÍCONES (sem texto), cada lado fitado é um check "U+E013"
 * e o texto de cada peça fica centralizado na vertical (há linhas antes E
 * depois da linha com o par C L). Posições copiadas de um PDF real.
 */
describe('reconstructNativeTableRows — cabeçalhos C1/C2/L1/L2 em ícone e texto centralizado na vertical', () => {
  const CHECK = '';
  const w = (text: string, left: number, top: number): OcrWord => ({ text, left, top, width: text.length * 4, height: 7 });
  const at = (top: number, ...items: [string, number][]): OcrWord[] => items.map(([text, left]) => w(text, left, top));

  const HEADER: OcrWord[] = [
    ...at(163, ['Função', 60], ['da', 89]),
    ...at(169, ['Qtde.', 133], ['Cliente', 169], ['Chapa', 203], ['C', 274], ['L', 305], ['Girar', 336], ['Fita', 371], ['Usinar', 522]),
    ...at(174, ['peça', 60]),
  ];

  const PIECE_1: OcrWord[] = [
    ...at(196, ['Mdf', 203], ['15', 220], ['Mm', 232]),
    ...at(199, ['Fita', 371], ['1', 389], ['X', 396], ['22', 404], ['Mm', 415]),
    ...at(203, ['tampo', 60], ['canto', 82], ['gabriel', 169], ['-', 193], ['Carvalho', 203]),
    ...at(207, ['1', 44], ['1', 140], ['2480.0', 265], ['206.0', 298], ['Carvalho', 371], ['Hanover', 405], [CHECK, 482]),
    ...at(211, ['leitura', 60], ['sala', 169], ['Hanover', 203], ['Design', 234]),
    ...at(214, ['Rehau', 371], ['®', 396]),
    ...at(218, ['2f', 203], ['Duratex', 214], ['®', 242]),
  ];
  const PIECE_2: OcrWord[] = [
    ...at(234, ['Mdf', 203], ['15', 220], ['Mm', 232]),
    ...at(238, ['lateral', 60], ['Fita', 371], ['1', 389], ['X', 396], ['22', 404], ['Mm', 415]),
    ...at(241, ['gabriel', 169], ['-', 193], ['Carvalho', 203]),
    ...at(245, ['2', 44], ['tamponamento', 60], ['1', 140], ['815.0', 267], ['206.0', 298], ['Carvalho', 371], ['Hanover', 405], [CHECK, 446]),
    ...at(249, ['sala', 169], ['Hanover', 203], ['Design', 234]),
    ...at(253, ['sala', 60], ['Rehau', 371], ['®', 396]),
    ...at(256, ['2f', 203], ['Duratex', 214], ['®', 242]),
  ];
  // Peça sem fita nenhuma, com o botão "Girar" marcado (não deve virar fita).
  const PIECE_3: OcrWord[] = [
    ...at(272, ['Mdf', 203], ['15', 220], ['Mm', 232]),
    ...at(280, ['gabriel', 169], ['-', 193], ['Carvalho', 203]),
    ...at(283, ['3', 44], ['painel', 60], ['sala', 83], ['1', 140], ['1320.0', 265], ['1460.0', 295], [CHECK, 343]),
    ...at(287, ['sala', 169], ['Hanover', 203], ['Design', 234]),
    ...at(295, ['2f', 203], ['Duratex', 214], ['®', 242]),
  ];
  // Total da lista (caixa "116" sob a coluna Qtde) e rodapé da página.
  const FOOTER: OcrWord[] = [...at(335, ['116', 140]), ...at(580, ['https://marceneiro.cortecloud.com.br/#/plans/1/view', 26], ['2/6', 560])];

  it('reconstrói cada peça com as linhas de cima e de baixo da espinha, e a fita pelos ícones de check', () => {
    const rows = reconstructNativeTableRows([...HEADER, ...PIECE_1, ...PIECE_2, ...PIECE_3, ...FOOTER]);

    expect(rows).toEqual([
      {
        funcao: 'tampo canto leitura',
        qtde: '1',
        chapa: 'Mdf 15 Mm Carvalho Hanover Design 2f Duratex ®',
        compr: '2480.0',
        larg: '206.0',
        fita: 'Fita 1 X 22 Mm Carvalho Hanover Rehau ®',
        c1: false,
        c2: false,
        l1: true,
        l2: false,
      },
      {
        funcao: 'lateral tamponamento sala',
        qtde: '1',
        chapa: 'Mdf 15 Mm Carvalho Hanover Design 2f Duratex ®',
        compr: '815.0',
        larg: '206.0',
        fita: 'Fita 1 X 22 Mm Carvalho Hanover Rehau ®',
        c1: true,
        c2: false,
        l1: false,
        l2: false,
      },
      {
        funcao: 'painel sala',
        qtde: '1',
        chapa: 'Mdf 15 Mm Carvalho Hanover Design 2f Duratex ®',
        compr: '1320.0',
        larg: '1460.0',
        fita: '',
        c1: false,
        c2: false,
        l1: false,
        l2: false,
      },
    ]);
  });

  it('o total sob a coluna Qtde ("116") e o rodapé não vazam para a última peça', () => {
    const rows = reconstructNativeTableRows([...HEADER, ...PIECE_1, ...PIECE_3, ...FOOTER])!;
    expect(rows[rows.length - 1]!.qtde).toBe('1');
    expect(rows[rows.length - 1]!.funcao).toBe('painel sala');
  });

  it('cada um dos 4 ícones cai na sua coluna (C1, C2, L1, L2)', () => {
    const rowWith = (checkLeft: number): OcrWord[] => [
      ...HEADER,
      ...at(207, ['1', 44], ['x', 60], ['1', 140], ['100.0', 265], ['50.0', 298], [CHECK, checkLeft]),
    ];
    const sides = (left: number) => {
      const row = reconstructNativeTableRows(rowWith(left))![0]!;
      return [row.c1, row.c2, row.l1, row.l2];
    };
    expect(sides(446)).toEqual([true, false, false, false]);
    expect(sides(464)).toEqual([false, true, false, false]);
    expect(sides(482)).toEqual([false, false, true, false]);
    expect(sides(500)).toEqual([false, false, false, true]);
  });
});
