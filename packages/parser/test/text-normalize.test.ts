import { describe, expect, it } from 'vitest';
import {
  stripWhatsAppFormatting,
  normalizeTypos,
  stripFillers,
  expandPcSeparatedPieces,
  stripGreetingPrefix,
  normalizeLeadingNumberWord,
  stripWhatsAppExportPrefixes,
  joinSplitQuantityLines,
  mergeMdfThicknessAndColorLines,
} from '../src/text-normalize.js';

describe('stripWhatsAppExportPrefixes', () => {
  it('remove o prefixo do iPhone e do Android', () => {
    expect(stripWhatsAppExportPrefixes('[15:29, 15/10/2026] Taciana Araujo Madeiras: 8 peça')).toBe('8 peça');
    expect(stripWhatsAppExportPrefixes('15/10/2026 15:29 - Taciana: 15x35')).toBe('15x35');
  });

  it('não mexe em linha sem prefixo, nem em dois-pontos comuns', () => {
    expect(stripWhatsAppExportPrefixes('760x395: 2 peças')).toBe('760x395: 2 peças');
    expect(stripWhatsAppExportPrefixes('Fita de borda:')).toBe('Fita de borda:');
  });
});

describe('joinSplitQuantityLines', () => {
  it('junta quantidade e medida de linhas separadas, aceitando ponto sobrando ("15.x35.")', () => {
    expect(joinSplitQuantityLines(['8 peça', '15.x35.', '4 peca', '160.0x50.0'].join('\n'))).toBe(
      '8=15x35\n4=160.0x50.0',
    );
  });

  it('medida sem quantidade antes recebe a quantidade da linha seguinte', () => {
    expect(joinSplitQuantityLines(['75.0x20', '12 peça'].join('\n'))).toBe('12=75.0x20');
  });

  it('quantidade sem nenhuma medida volta como estava', () => {
    expect(joinSplitQuantityLines(['8 peça', 'Quarto'].join('\n'))).toBe('8 peça\nQuarto');
  });

  it('não altera linhas que já trazem quantidade e medida juntas', () => {
    expect(joinSplitQuantityLines('2=47/47\n35x20')).toBe('2=47/47\n35x20');
  });
});

describe('mergeMdfThicknessAndColorLines', () => {
  it('junta "MDF 6" com a cor da linha seguinte', () => {
    expect(mergeMdfThicknessAndColorLines('MDF 6\nBranco')).toBe('MDF Branco 6mm');
  });

  it('sem cor na linha seguinte, só acrescenta a unidade', () => {
    expect(mergeMdfThicknessAndColorLines('MDF 18\n2=47/47')).toBe('MDF 18mm\n2=47/47');
  });
});

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

describe('stripGreetingPrefix', () => {
  it.each(['boa tarde', 'boa noite', 'bom dia', 'olá', 'ola', 'oi'])(
    'remove a saudação "%s" do início da linha',
    (greeting) => {
      expect(stripGreetingPrefix(`${greeting} duas laterais de 2050x550`)).toBe('duas laterais de 2050x550');
    },
  );

  it('tolera vírgula ou ponto depois da saudação', () => {
    expect(stripGreetingPrefix('Boa tarde, duas laterais de 2050x550')).toBe('duas laterais de 2050x550');
  });

  it('não mexe numa linha sem saudação', () => {
    expect(stripGreetingPrefix('duas laterais de 2050x550')).toBe('duas laterais de 2050x550');
  });
});

describe('normalizeLeadingNumberWord', () => {
  it.each([
    ['um', 1],
    ['uma', 1],
    ['dois', 2],
    ['duas', 2],
    ['três', 3],
    ['tres', 3],
    ['quatro', 4],
    ['cinco', 5],
    ['dez', 10],
    ['vinte', 20],
  ])('troca "%s" pelo algarismo %i no início da linha', (word, value) => {
    expect(normalizeLeadingNumberWord(`${word} de 530x500`)).toBe(`${value} de 530x500`);
  });

  it('não altera o resto da linha, só a primeira palavra', () => {
    expect(normalizeLeadingNumberWord('duas de 1700x500 base')).toBe('2 de 1700x500 base');
  });

  it('não troca uma palavra-número que não está no início da linha', () => {
    expect(normalizeLeadingNumberWord('base duas de 1700x500')).toBe('base duas de 1700x500');
  });

  it('não altera uma linha que já começa com algarismo', () => {
    expect(normalizeLeadingNumberWord('2 de 1700x500')).toBe('2 de 1700x500');
  });

  it('não altera uma linha sem quantidade por extenso nenhuma', () => {
    expect(normalizeLeadingNumberWord('MDF branco de 15mm')).toBe('MDF branco de 15mm');
  });
});
