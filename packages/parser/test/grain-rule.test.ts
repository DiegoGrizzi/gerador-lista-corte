import { describe, expect, it } from 'vitest';
import { applyGrainOrientationRule, GRAIN_INVERSION_THRESHOLD_MM } from '../src/grain-rule.js';
import type { Piece } from '../src/types.js';

function makePiece(overrides: Partial<Piece>): Piece {
  return {
    id: '1',
    material: 'MDF branco 15mm',
    complemento: '',
    funcao: '',
    qtd: 1,
    compr: 1000,
    larg: 500,
    thicknessMm: 15,
    fitaType: null,
    customFita: null,
    isOverride: false,
    note: '',
    fita: { c1: true, c2: false, l1: false, l2: true },
    ...overrides,
  };
}

describe('applyGrainOrientationRule', () => {
  it('is a fixed physical constant of 1840mm', () => {
    expect(GRAIN_INVERSION_THRESHOLD_MM).toBe(1840);
  });

  it('does NOT swap when larg is exactly at the threshold', () => {
    const piece = makePiece({ compr: 1000, larg: 1840 });
    applyGrainOrientationRule(piece);
    expect(piece.compr).toBe(1000);
    expect(piece.larg).toBe(1840);
    expect(piece.wasInverted).toBeFalsy();
  });

  it('swaps compr/larg and c1<->l1, c2<->l2 when larg exceeds the threshold', () => {
    const piece = makePiece({
      compr: 1000,
      larg: 1841,
      fita: { c1: true, c2: false, l1: false, l2: true },
    });
    applyGrainOrientationRule(piece);
    expect(piece.compr).toBe(1841);
    expect(piece.larg).toBe(1000);
    expect(piece.fita).toEqual({ c1: false, c2: true, l1: true, l2: false });
    expect(piece.wasInverted).toBe(true);
  });

  it('leaves a piece well below the threshold untouched', () => {
    const piece = makePiece({ compr: 1000, larg: 500 });
    applyGrainOrientationRule(piece);
    expect(piece.compr).toBe(1000);
    expect(piece.larg).toBe(500);
    expect(piece.wasInverted).toBeFalsy();
  });
});
