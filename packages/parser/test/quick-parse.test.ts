import { describe, expect, it } from 'vitest';
import { quickParseLine } from '../src/quick-parse.js';
import type { ParseContext } from '../src/types.js';

function makeNextId() {
  let id = 0;
  return () => String(++id);
}

const ctx: ParseContext = {
  material: 'MDF branco',
  complemento: 'Quarto',
  funcao: '',
  fitaType: 'maior-um',
  thicknessMm: 15,
};

describe('quickParseLine', () => {
  it('returns null for a line that still cannot be parsed as a piece', () => {
    expect(quickParseLine('linha sem sentido nenhum', ctx, makeNextId())).toBeNull();
  });

  it('returns a finalized piece for a valid corrected line, resolving fita from context', () => {
    const piece = quickParseLine('2=50/32', ctx, makeNextId());

    expect(piece).not.toBeNull();
    expect(piece!.qtd).toBe(2);
    expect(piece!.compr).toBe(50);
    expect(piece!.larg).toBe(32);
    // Thickness gets folded into the material label by finalizePiece.
    expect(piece!.material).toBe('MDF branco 15mm');
    // largura (32) < comprimento (50) -> maior-um puts fita on c1.
    expect(piece!.fita).toEqual({ c1: true, c2: false, l1: false, l2: false });
  });

  it('normalizes a repeated-punctuation typo internally before matching', () => {
    const piece = quickParseLine('2=50/32..2', ctx, makeNextId());

    expect(piece).not.toBeNull();
    expect(piece!.larg).toBe(32.2);
  });

  it('resolves fita from an explicit customFita (fita glued to a number) rather than context', () => {
    const piece = quickParseLine('2 pç 70 fita x59', ctx, makeNextId());

    expect(piece).not.toBeNull();
    expect(piece!.customFita).toEqual({ c1: true, c2: false, l1: false, l2: false });
    expect(piece!.fita).toEqual({ c1: true, c2: false, l1: false, l2: false });
  });
});
