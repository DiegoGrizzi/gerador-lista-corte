import { describe, expect, it } from 'vitest';
import { stripWhatsAppFormatting, normalizeTypos, stripFillers, expandPcSeparatedPieces } from '../src/text-normalize.js';

describe('stripWhatsAppFormatting', () => {
  it('strips bold markup wrapping the whole line', () => {
    expect(stripWhatsAppFormatting('*MDF branco*')).toBe('MDF branco');
  });

  it('strips italic markup wrapping the whole line', () => {
    expect(stripWhatsAppFormatting('_qualquer coisa_')).toBe('qualquer coisa');
  });

  it('strips strikethrough markup wrapping the whole line', () => {
    expect(stripWhatsAppFormatting('~alguma coisa~')).toBe('alguma coisa');
  });

  it('does NOT strip partial/inline markup that does not wrap the whole line', () => {
    expect(stripWhatsAppFormatting('abc *bold* def')).toBe('abc *bold* def');
  });

  it('does NOT strip markup with mismatched wrapping characters', () => {
    expect(stripWhatsAppFormatting('*bold_')).toBe('*bold_');
  });

  it('leaves a plain line untouched', () => {
    expect(stripWhatsAppFormatting('2=47/47')).toBe('2=47/47');
  });
});

describe('normalizeTypos', () => {
  it('collapses a repeated dot into a single dot', () => {
    expect(normalizeTypos('32..2')).toBe('32.2');
  });

  it('collapses a repeated comma into a single dot', () => {
    expect(normalizeTypos('0,,30')).toBe('0.30');
  });

  it('collapses repeated apostrophes into a single dot', () => {
    expect(normalizeTypos("10''5")).toBe('10.5');
  });

  it('leaves single, correctly-typed decimal separators untouched', () => {
    expect(normalizeTypos('56.5')).toBe('56.5');
    expect(normalizeTypos('56,5')).toBe('56,5');
  });
});

describe('stripFillers', () => {
  it('removes the "de" filler word', () => {
    expect(stripFillers('de gaveta')).toBe('gaveta');
  });

  it('removes the "pro" filler word', () => {
    expect(stripFillers('pro fundo')).toBe('fundo');
  });

  it('collapses extra whitespace left behind', () => {
    expect(stripFillers('gaveta   de   cima')).toBe('gaveta cima');
  });

  it('returns empty string for a bare unit of measurement', () => {
    expect(stripFillers('mm')).toBe('');
    expect(stripFillers('cm')).toBe('');
  });

  it('returns empty string for pure punctuation', () => {
    expect(stripFillers('.,;:')).toBe('');
  });

  it('returns empty string when only filler words remain', () => {
    expect(stripFillers('de')).toBe('');
  });
});

describe('expandPcSeparatedPieces', () => {
  it('splits "N pc compr*larg" pieces separated by ". " into one line each (caso real testado)', () => {
    const raw = '1pc96*65. 1pc192*65. 4pc69.5*65';
    expect(expandPcSeparatedPieces(raw)).toBe('1pc96*65\n1pc192*65\n4pc69.5*65');
  });

  it('splits a material header (sem "pc") do resto da lista', () => {
    const raw = 'MDF naval de 18.  1pc96*65. 1pc192*65';
    expect(expandPcSeparatedPieces(raw)).toBe('MDF naval de 18\n1pc96*65\n1pc192*65');
  });

  it('não separa um ponto decimal dentro de uma medida (não vem seguido de espaço)', () => {
    expect(expandPcSeparatedPieces('4pc69.5*65')).toBe('4pc69.5*65');
    // Mesmo um número com mais de um ponto (provável erro de digitação do
    // usuário) não deve ser cortado — só pontos seguidos de espaço+"Npc" são.
    expect(expandPcSeparatedPieces('1pc1.73.03*07')).toBe('1pc1.73.03*07');
  });

  it('não altera um texto sem nenhuma peça no formato "pc"', () => {
    expect(expandPcSeparatedPieces('2=47/47')).toBe('2=47/47');
  });
});
