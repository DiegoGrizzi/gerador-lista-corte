import { describe, expect, it } from 'vitest';
import { tryMatchPieceLine, splitIntoPieceSegments } from '../src/piece-matcher.js';

describe('tryMatchPieceLine — quantity markers', () => {
  it.each([
    ['2=47/47', '='],
    ['2-47/47', '-'],
    ['2 pç 47/47', 'pç'],
    ['2 pc 47/47', 'pc'],
    ['2 un 47/47', 'un'],
    ['2 und 47/47', 'und'],
    ['2 unid 47/47', 'unid'],
    ['2 unidade 47/47', 'unidade'],
    ['2 47/47', 'bare'],
  ])('recognizes quantity marker in "%s" (%s)', (line) => {
    const match = tryMatchPieceLine(line);
    expect(match).not.toBeNull();
    expect(match!.qty).toBe(2);
    expect(match!.dimensionMatch[1]).toBe('47');
    expect(match!.dimensionMatch[3]).toBe('47');
  });
});

describe('tryMatchPieceLine — dimension separators', () => {
  it.each([
    ['2=50x60', 'x'],
    ['2=50 pro 60', 'pro'],
    ['2=50/60', '/'],
  ])('recognizes "%s" separator in "%s"', (line) => {
    const match = tryMatchPieceLine(line);
    expect(match).not.toBeNull();
    expect(match!.dimensionMatch[1]).toBe('50');
    expect(match!.dimensionMatch[3]).toBe('60');
  });
});

describe('tryMatchPieceLine — implicit quantity of 1 (no quantity prefix)', () => {
  it('matches "160 x 90 6mm" starting at index 0 of the full line', () => {
    const match = tryMatchPieceLine('160 x 90 6mm');
    expect(match).not.toBeNull();
    expect(match!.qty).toBe(1);
    expect(match!.dimensionMatch.index).toBe(0);
    expect(match!.dimensionMatch[1]).toBe('160');
    expect(match!.dimensionMatch[3]).toBe('90');
    expect(match!.dimensionMatch[5]).toBe('6');
  });

  it('does NOT allow "/" as a separator for the no-quantity-prefix case', () => {
    // "1/4 de FCC" must not be read as a 1x4 piece.
    const match = tryMatchPieceLine('1/4 de FCC');
    expect(match).toBeNull();
  });
});

describe('tryMatchPieceLine — inline thickness (3rd number)', () => {
  it('captures the 3rd number in "3 = 820 x 400 x 18" as inline thickness', () => {
    const match = tryMatchPieceLine('3 = 820 x 400 x 18');
    expect(match).not.toBeNull();
    expect(match!.qty).toBe(3);
    expect(match!.dimensionMatch[1]).toBe('820');
    expect(match!.dimensionMatch[3]).toBe('400');
    expect(match!.dimensionMatch[5]).toBe('18');
  });
});

describe('tryMatchPieceLine — inline fita marker on a number', () => {
  it('detects "fita" glued to the first number ("70 fita x59")', () => {
    const match = tryMatchPieceLine('2 pç 70 fita x59');
    expect(match).not.toBeNull();
    expect(match!.dimensionMatch[1]).toBe('70');
    expect(match!.dimensionMatch[2]).toBe('fita');
    expect(match!.dimensionMatch[3]).toBe('59');
    expect(match!.dimensionMatch[4]).toBeUndefined();
  });

  it('detects "fita" glued to the second number ("70x59 fita")', () => {
    const match = tryMatchPieceLine('2 pç 70x59 fita');
    expect(match).not.toBeNull();
    expect(match!.dimensionMatch[1]).toBe('70');
    expect(match!.dimensionMatch[2]).toBeUndefined();
    expect(match!.dimensionMatch[3]).toBe('59');
    expect(match!.dimensionMatch[4]).toBe('fita');
  });
});

describe('splitIntoPieceSegments', () => {
  it('splits "2=47/47, 3=50/60" into two segments', () => {
    const segments = splitIntoPieceSegments('2=47/47, 3=50/60');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe('2=47/47');
    expect(segments[1]).toBe('3=50/60');
  });

  it('does NOT split on the decimal comma inside "56,5"', () => {
    const segments = splitIntoPieceSegments('2=56,5/42, 3=50/60');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe('2=56,5/42');
    expect(segments[1]).toBe('3=50/60');
  });

  it('returns a single segment for a line with no separator', () => {
    const segments = splitIntoPieceSegments('2=47/47');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe('2=47/47');
  });
});
