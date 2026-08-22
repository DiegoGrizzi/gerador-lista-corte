import { describe, expect, it } from 'vitest';
import { analyzeText } from '../src/analyze.js';
import {
  HEADER_THEN_PIECES,
  MATERIAL_DECLARED_AFTER_PIECES,
  TYPO_LINE,
  UNPARSEABLE_LINE,
  MULTI_PIECE_ALL_VALID,
  MULTI_PIECE_NOT_ALL_VALID,
  REALISTIC_MESSAGE,
} from './fixtures/sample-messages.js';

function makeNextId() {
  let id = 0;
  return () => String(++id);
}

describe('analyzeText — material header propagates to pieces', () => {
  it('propagates material, fitamento and thickness from a header line to every following piece', () => {
    const result = analyzeText(HEADER_THEN_PIECES, makeNextId());

    expect(result.materialMentioned).toBe(true);
    expect(result.pieces).toHaveLength(2);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('MDF titânio 15mm');
      expect(piece.thicknessMm).toBe(15);
      expect(piece.fitaType).toBe('maior-um');
      expect(piece.complemento).toBe('Quarto casal');
    }
    // 47/47 is square, so largura is not strictly greater: falls to the compr side (c1).
    expect(result.pieces[0]!.fita).toEqual({ c1: true, c2: false, l1: false, l2: false });
    // 50/60: largura (60) > comprimento (50) -> fita goes on l1.
    expect(result.pieces[1]!.fita).toEqual({ c1: false, c2: false, l1: true, l2: false });
  });
});

describe('analyzeText — retroactive backfill', () => {
  it('backfills material declared after pieces onto pieces read earlier', () => {
    const result = analyzeText(MATERIAL_DECLARED_AFTER_PIECES, makeNextId());

    expect(result.materialMentioned).toBe(true);
    expect(result.pieces).toHaveLength(2);
    // NOTE: this mirrors a real quirk of the legacy engine — setNewMaterial
    // backfills pendingMaterial (and defaults pendingFitamento to
    // 'none-explicit'), but clears pendingThickness WITHOUT writing back
    // into those entries. So a thickness declared alongside a retroactive
    // material ("MDF branco de 15mm") never reaches pieces read earlier:
    // thicknessMm stays null and the material label carries no "Nmm" suffix.
    expect(result.pieces[0]!.material).toBe('MDF branco');
    expect(result.pieces[0]!.thicknessMm).toBeNull();
    expect(result.pieces[1]!.material).toBe('MDF branco');
    expect(result.pieces[1]!.thicknessMm).toBeNull();
  });
});

describe('analyzeText — typo recovery suggestion', () => {
  it('discards a piece-like line with a typo and suggests the normalized correction', () => {
    const result = analyzeText(TYPO_LINE, makeNextId());

    expect(result.pieces).toHaveLength(0);
    expect(result.discarded).toHaveLength(1);
    expect(result.discarded[0]!.text).toBe(TYPO_LINE);
    expect(result.discarded[0]!.suggested).toBe('2=50/32.2');
  });
});

describe('analyzeText — unparseable, non-piece-like line', () => {
  it('silently drops a line that is neither a piece nor a recognized header', () => {
    const result = analyzeText(UNPARSEABLE_LINE, makeNextId());

    expect(result.pieces).toHaveLength(0);
    expect(result.discarded).toHaveLength(0);
  });
});

describe('analyzeText — multi-segment lines', () => {
  it('splits a comma-separated line into multiple pieces when ALL segments are valid', () => {
    const result = analyzeText(MULTI_PIECE_ALL_VALID, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(2);
    expect(result.pieces[0]).toMatchObject({ qtd: 2, compr: 47, larg: 47 });
    expect(result.pieces[1]).toMatchObject({ qtd: 3, compr: 50, larg: 60 });
  });

  it('discards the whole line when NOT all segments are valid', () => {
    const result = analyzeText(MULTI_PIECE_NOT_ALL_VALID, makeNextId());

    expect(result.pieces).toHaveLength(0);
    expect(result.discarded).toHaveLength(1);
    expect(result.discarded[0]!.text).toBe(MULTI_PIECE_NOT_ALL_VALID);
  });
});

describe('analyzeText — full realistic message', () => {
  it('interprets material, complemento, funcao and separator/label lines together', () => {
    const result = analyzeText(REALISTIC_MESSAGE, makeNextId());

    expect(result.materialMentioned).toBe(true);
    expect(result.pieces).toHaveLength(2);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('MDF branco 15mm');
      expect(piece.complemento).toBe('Cozinha');
      expect(piece.funcao).toBe('Gaveta');
      expect(piece.fita).toEqual({ c1: true, c2: true, l1: true, l2: true });
    }
    // The separator line and the "Ferragens" label both go to conferência.
    expect(result.discarded).toHaveLength(2);
    expect(result.discarded.map((d) => d.text)).toEqual(['----------x-------------', 'Ferragens']);
  });
});
