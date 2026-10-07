import { describe, expect, it } from 'vitest';
import { parseFitaByDimensionLine } from '../src/fita-by-dimension.js';

describe('parseFitaByDimensionLine', () => {
  it.each([
    ['1200 × 700: nos 4 lados', ['4L']],
    ['735 × 700: frente, trás e parte inferior', ['1M', '2m']],
    ['1170 × 300: borda superior e laterais', ['1M', '2m']],
    ['500 × 260: borda frontal', ['1M']],
    ['395 x 120: sem fita', []],
    ['395 x 120: lado maior', ['1M']],
    ['395 x 120: dois lados menor', ['2m']],
  ])('"%s" → %j', (line, codes) => {
    expect(parseFitaByDimensionLine(line)!.codes).toEqual(codes);
  });

  it('lê várias medidas antes dos dois-pontos', () => {
    const rule = parseFitaByDimensionLine('450 × 100 e 315 × 100: borda superior')!;
    expect(rule.dimensions).toEqual([
      { compr: 450, larg: 100 },
      { compr: 315, larg: 100 },
    ]);
  });

  it('devolve null quando a frase não é uma fita reconhecível (ex: formato "medidas: quantidade")', () => {
    expect(parseFitaByDimensionLine('760x395: 2 peças')).toBeNull();
    expect(parseFitaByDimensionLine('465x650: peça')).toBeNull();
  });

  it('devolve null para contagem ambígua de bordas (2) — vai para a conferência em vez de chutar', () => {
    expect(parseFitaByDimensionLine('100 × 50: frente e trás')).toBeNull();
  });

  it('devolve null em linha que não tem o formato medidas: frase', () => {
    expect(parseFitaByDimensionLine('Fita de borda:')).toBeNull();
    expect(parseFitaByDimensionLine('2=47/47')).toBeNull();
  });
});
