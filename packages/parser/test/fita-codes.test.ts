import { describe, expect, it } from 'vitest';
import {
  extractTrailingFitaCodes,
  computeFitaFromCodes,
  computeFitaFromCounts,
  resolveThreeLadosFita,
  applyFitaCodesToPiece,
} from '../src/fita-codes.js';
import type { RawPiece } from '../src/types.js';

function makeRawPiece(overrides: Partial<RawPiece>): RawPiece {
  return {
    id: '1',
    material: '',
    complemento: '',
    funcao: '',
    qtd: 1,
    compr: 100,
    larg: 50,
    thicknessMm: 15,
    fitaType: null,
    customFita: null,
    isOverride: false,
    note: '',
    ...overrides,
  };
}

describe('extractTrailingFitaCodes', () => {
  it('extrai um único código no final da linha', () => {
    const result = extractTrailingFitaCodes('2 X 0,80 X 0,485  3L');
    expect(result.line).toBe('2 X 0,80 X 0,485');
    expect(result.codes).toEqual(['3L']);
  });

  it('extrai vários códigos no final da linha, preservando a ordem', () => {
    const result = extractTrailingFitaCodes('3 X 0,80 X 0,505  1M  1m');
    expect(result.line).toBe('3 X 0,80 X 0,505');
    expect(result.codes).toEqual(['1M', '1m']);
  });

  it('não altera a linha quando não há nenhum código no final', () => {
    const result = extractTrailingFitaCodes('2=47/47');
    expect(result.line).toBe('2=47/47');
    expect(result.codes).toEqual([]);
  });

  it('não trata um número de medida no final como se fosse um código', () => {
    // "0,505" não é um código válido (não é um único dígito 1-4 + letra).
    const result = extractTrailingFitaCodes('3 X 0,80 X 0,505');
    expect(result.codes).toEqual([]);
  });
});

describe('computeFitaFromCounts', () => {
  it('coloca a fita no par C quando o comprimento é a medida maior', () => {
    expect(computeFitaFromCounts(100, 50, 1, 0)).toEqual({ c1: true, c2: false, l1: false, l2: false });
  });

  it('coloca a fita no par L quando a largura é a medida maior', () => {
    expect(computeFitaFromCounts(50, 100, 1, 0)).toEqual({ c1: false, c2: false, l1: true, l2: false });
  });

  it('marca os dois lados de um par quando a contagem é 2', () => {
    expect(computeFitaFromCounts(100, 50, 2, 0)).toEqual({ c1: true, c2: true, l1: false, l2: false });
  });

  it('combina contagem no par maior e no par menor ao mesmo tempo (ex: "1M 1m")', () => {
    expect(computeFitaFromCounts(100, 50, 1, 1)).toEqual({ c1: true, c2: false, l1: true, l2: false });
  });
});

describe('computeFitaFromCodes', () => {
  it('"1M" — fita em 1 lado do par maior', () => {
    expect(computeFitaFromCodes(['1M'], 100, 50)).toEqual({
      customFita: { c1: true, c2: false, l1: false, l2: false },
      pendingThreeLados: false,
    });
  });

  it('"1M" + "1m" — combina os dois pares', () => {
    expect(computeFitaFromCodes(['1M', '1m'], 100, 50)).toEqual({
      customFita: { c1: true, c2: false, l1: true, l2: false },
      pendingThreeLados: false,
    });
  });

  it('"4L" — todos os 4 lados, sem ambiguidade', () => {
    expect(computeFitaFromCodes(['4L'], 100, 50)).toEqual({
      customFita: { c1: true, c2: true, l1: true, l2: true },
      pendingThreeLados: false,
    });
  });

  it('"3L" — ambíguo, vira pendência em vez de uma fita decidida', () => {
    expect(computeFitaFromCodes(['3L'], 100, 50)).toEqual({ customFita: null, pendingThreeLados: true });
  });
});

describe('resolveThreeLadosFita', () => {
  it('"2 lados maiores" = par maior inteiro + 1 lado do par menor', () => {
    expect(resolveThreeLadosFita(100, 50, 'maior')).toEqual({ c1: true, c2: true, l1: true, l2: false });
  });

  it('"2 lados menores" = par menor inteiro + 1 lado do par maior', () => {
    expect(resolveThreeLadosFita(100, 50, 'menor')).toEqual({ c1: true, c2: false, l1: true, l2: true });
  });
});

describe('applyFitaCodesToPiece', () => {
  it('sobrescreve customFita da peça com a fita resolvida dos códigos', () => {
    const piece = makeRawPiece({ compr: 100, larg: 50, customFita: { c1: false, c2: false, l1: false, l2: false } });
    applyFitaCodesToPiece(piece, ['2M']);
    expect(piece.customFita).toEqual({ c1: true, c2: true, l1: false, l2: false });
    expect(piece.pendingThreeLados).toBeUndefined();
  });

  it('marca pendingThreeLados e deixa uma fita provisória "nenhum lado" para "3L"', () => {
    const piece = makeRawPiece({ compr: 100, larg: 50 });
    applyFitaCodesToPiece(piece, ['3L']);
    expect(piece.pendingThreeLados).toBe(true);
    expect(piece.customFita).toEqual({ c1: false, c2: false, l1: false, l2: false });
  });
});
