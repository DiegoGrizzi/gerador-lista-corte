import { describe, expect, it } from 'vitest';
import { parseFitamentoPhrase, resolveFitaFromType } from '../src/fitamento.js';

describe('parseFitamentoPhrase', () => {
  it.each(['não precisa fita', 'nao precisa', 'sem fita', 'só cortar', 'so cortar'])(
    'recognizes "%s" as none-explicit',
    (phrase) => {
      expect(parseFitamentoPhrase(phrase)).toBe('none-explicit');
    },
  );

  it.each(['fitado os 4 lados', '4 lados', 'fita tudo', 'tudo fita'])('recognizes "%s" as all', (phrase) => {
    expect(parseFitamentoPhrase(phrase)).toBe('all');
  });

  it('recognizes "dois lados maior" as maior-dois', () => {
    expect(parseFitamentoPhrase('dois lados maior')).toBe('maior-dois');
  });

  it('recognizes "dois lados menor" as menor-dois', () => {
    expect(parseFitamentoPhrase('dois lados menor')).toBe('menor-dois');
  });

  it.each(['lado maior', 'parte maior'])('recognizes "%s" as maior-um', (phrase) => {
    expect(parseFitamentoPhrase(phrase)).toBe('maior-um');
  });

  it.each(['lado menor', 'parte menor'])('recognizes "%s" as menor-um', (phrase) => {
    expect(parseFitamentoPhrase(phrase)).toBe('menor-um');
  });

  it('returns null for unrelated text', () => {
    expect(parseFitamentoPhrase('gato pulou o muro')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseFitamentoPhrase('')).toBeNull();
  });
});

describe('resolveFitaFromType', () => {
  // largura (60) > comprimento (50): "maior" refers to the largura side (L1/L2).
  const comprLargMaior = { compr: 50, larg: 60 };
  // largura (40) < comprimento (50): "maior" refers to the comprimento side (C1/C2).
  const comprLargMenor = { compr: 50, larg: 40 };

  it('returns all-false for null type', () => {
    expect(resolveFitaFromType(null, 50, 60)).toEqual({ c1: false, c2: false, l1: false, l2: false });
  });

  it('returns all-false for none-explicit', () => {
    expect(resolveFitaFromType('none-explicit', 50, 60)).toEqual({ c1: false, c2: false, l1: false, l2: false });
  });

  it('returns all-true for "all"', () => {
    expect(resolveFitaFromType('all', 50, 60)).toEqual({ c1: true, c2: true, l1: true, l2: true });
  });

  it('maior-um: puts the fita on L1 when largura is the larger side', () => {
    expect(resolveFitaFromType('maior-um', comprLargMaior.compr, comprLargMaior.larg)).toEqual({
      c1: false,
      c2: false,
      l1: true,
      l2: false,
    });
  });

  it('maior-um: puts the fita on C1 when comprimento is the larger side', () => {
    expect(resolveFitaFromType('maior-um', comprLargMenor.compr, comprLargMenor.larg)).toEqual({
      c1: true,
      c2: false,
      l1: false,
      l2: false,
    });
  });

  it('maior-dois: puts the fita on L1+L2 when largura is the larger side', () => {
    expect(resolveFitaFromType('maior-dois', comprLargMaior.compr, comprLargMaior.larg)).toEqual({
      c1: false,
      c2: false,
      l1: true,
      l2: true,
    });
  });

  it('maior-dois: puts the fita on C1+C2 when comprimento is the larger side', () => {
    expect(resolveFitaFromType('maior-dois', comprLargMenor.compr, comprLargMenor.larg)).toEqual({
      c1: true,
      c2: true,
      l1: false,
      l2: false,
    });
  });

  it('menor-um: puts the fita on L1 when largura is the smaller side', () => {
    expect(resolveFitaFromType('menor-um', comprLargMenor.compr, comprLargMenor.larg)).toEqual({
      c1: false,
      c2: false,
      l1: true,
      l2: false,
    });
  });

  it('menor-um: puts the fita on C1 when comprimento is the smaller side', () => {
    expect(resolveFitaFromType('menor-um', comprLargMaior.compr, comprLargMaior.larg)).toEqual({
      c1: true,
      c2: false,
      l1: false,
      l2: false,
    });
  });

  it('menor-dois: puts the fita on L1+L2 when largura is the smaller side', () => {
    expect(resolveFitaFromType('menor-dois', comprLargMenor.compr, comprLargMenor.larg)).toEqual({
      c1: false,
      c2: false,
      l1: true,
      l2: true,
    });
  });

  it('menor-dois: puts the fita on C1+C2 when comprimento is the smaller side', () => {
    expect(resolveFitaFromType('menor-dois', comprLargMaior.compr, comprLargMaior.larg)).toEqual({
      c1: true,
      c2: true,
      l1: false,
      l2: false,
    });
  });
});
