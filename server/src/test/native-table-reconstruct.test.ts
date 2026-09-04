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
