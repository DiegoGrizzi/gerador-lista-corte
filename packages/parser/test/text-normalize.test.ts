import { describe, expect, it } from 'vitest';
import {
  extractStatedTotal,
  stripMeasureUnits,
  stripWhatsAppFormatting,
  normalizeTypos,
  stripFillers,
  expandPcSeparatedPieces,
  stripGreetingPrefix,
  normalizeLeadingNumberWord,
  stripWhatsAppExportPrefixes,
  normalizeDotAfterQuantity,
  joinSplitQuantityLines,
  mergeMdfThicknessAndColorLines,
  detectStatedUnitFactor,
} from '../src/text-normalize.js';

describe('detectStatedUnitFactor', () => {
  it.each([
    ['As medidas seguem em milímetros', 1],
    ['As medidas seguem em milímetros \n\nMDF 15', 1],
    ['medidas em mm', 1],
    ['Medidas em cm', 10],
    ['as medidas estão em centímetros', 10],
    ['tudo em cm', 10],
    ['As medidas são em metros', 1000],
    ['Bom dia\nMedidas em mm\n2=47/47', 1],
  ])('"%s" → %s', (text, factor) => {
    expect(detectStatedUnitFactor(text)).toBe(factor);
  });

  it.each([
    ['2=47/47'],
    ['Medidas MDF 15mm'],
    ['MDF branco de 15mm'],
    ['2 peças c/ 100x50 em cm'],
    ['Quarto em metros quadrados'],
    [''],
  ])('"%s" → nenhuma unidade informada', (text) => {
    expect(detectStatedUnitFactor(text)).toBeNull();
  });
});

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
    expect(joinSplitQuantityLines('2=47/47\n2=35x20')).toBe('2=47/47\n2=35x20');
  });

  it('medida sozinha, sem nenhuma quantidade por perto, vira quantidade 1 (evita ler "75" de "75.0x50.0" como quantidade)', () => {
    expect(joinSplitQuantityLines('MDF 6mm\n75.0x50.0')).toBe('MDF 6mm\n1=75.0x50.0');
  });
});

describe('normalizeDotAfterQuantity', () => {
  it('troca o ponto digitado depois da quantidade por espaço', () => {
    expect(normalizeDotAfterQuantity('2.peca 83.0x40.0')).toBe('2 peca 83.0x40.0');
    expect(normalizeDotAfterQuantity('10.peças 50x20')).toBe('10 peças 50x20');
  });

  it('não mexe em decimais nem em outras linhas', () => {
    expect(normalizeDotAfterQuantity('2.5 x 30')).toBe('2.5 x 30');
    expect(normalizeDotAfterQuantity('15.x35.')).toBe('15.x35.');
  });
});

describe('mergeMdfThicknessAndColorLines', () => {
  it('junta "MDF 6" com a cor da linha seguinte', () => {
    expect(mergeMdfThicknessAndColorLines('MDF 6\nBranco')).toBe('MDF Branco 6mm');
  });

  it('sem cor na linha seguinte, só acrescenta a unidade', () => {
    expect(mergeMdfThicknessAndColorLines('MDF 18\n2=47/47')).toBe('MDF 18mm\n2=47/47');
  });

  it('aceita a cor como "Cor X" e mantém o descritor depois da vírgula', () => {
    expect(mergeMdfThicknessAndColorLines('MDF 15, duas face naval \nCor Louro Freijó \n\n2=47/47')).toBe(
      'MDF Louro Freijó duas face naval 15mm\n\n2=47/47',
    );
  });

  it('aceita "Fundo em MDF 6" + "Cor X"', () => {
    expect(mergeMdfThicknessAndColorLines('Fundo em MDF 6 \nCor Louro Freijó')).toBe('MDF Louro Freijó 6mm');
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
  it('removes "c/" (abreviação de "com") como palavra solta', () => {
    expect(stripFillers('c/')).toBe('');
    expect(stripFillers('c/ gaveta')).toBe('gaveta');
    expect(stripFillers('abc/def')).toBe('abc/def');
  });

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

describe('extractStatedTotal', () => {
  it.each([
    ['Total de peças: 116', 116],
    ['Total peças 116', 116],
    ['TOTAL GERAL DE PEÇAS = 58', 58],
    ['Total: 116 peças', 116],
    ['total - 12 pç', 12],
    ['116 peças no total', 116],
  ])('"%s" informa o total %i e sai do texto', (line, total) => {
    expect(extractStatedTotal('MDF branco 15mm\n2=100x50\n' + line)).toEqual({
      text: 'MDF branco 15mm\n2=100x50',
      total,
    });
  });

  it.each(['Total: 116', 'Total R$ 116', '2 peças 100x50', 'Total de peças a cortar depois'])(
    '"%s" não é linha de total',
    (line) => {
      const text = 'MDF branco 15mm\n' + line;
      expect(extractStatedTotal(text)).toEqual({ text, total: null });
    },
  );
});

describe('stripMeasureUnits', () => {
  it('tira o mm colado nas duas medidas ou em uma só e devolve o fator 1', () => {
    expect(stripMeasureUnits('1- 1630mm x 65mm Mdf de 15mm')).toEqual({ text: '1- 1630 x 65 Mdf de 15mm', unitFactor: 1 });
    expect(stripMeasureUnits('1- 1670mm x 135 em titânio')).toEqual({ text: '1- 1670 x 135 em titânio', unitFactor: 1 });
    expect(stripMeasureUnits('2 pç 1200 mm × 600')).toEqual({ text: '2 pç 1200 x 600', unitFactor: 1 });
  });

  it('cm devolve o fator 10', () => {
    expect(stripMeasureUnits('2- 50cm x 30cm')).toEqual({ text: '2- 50 x 30', unitFactor: 10 });
  });

  it('linhas que dizem mm e linhas que dizem cm se contradizem: sem fator', () => {
    expect(stripMeasureUnits('1- 100mm x 50mm\n1- 10cm x 5cm').unitFactor).toBeNull();
  });

  it('mm numa medida e cm na outra: deixa a linha como está', () => {
    expect(stripMeasureUnits('1- 100mm x 50cm')).toEqual({ text: '1- 100mm x 50cm', unitFactor: null });
  });

  it('não mexe em linha sem unidade, em linha que não começa com número nem na espessura (terceira medida)', () => {
    expect(stripMeasureUnits('1- 1000 x 500 x 15mm')).toEqual({ text: '1- 1000 x 500 x 15mm', unitFactor: null });
    expect(stripMeasureUnits('MDF 15mm x 2750')).toEqual({ text: 'MDF 15mm x 2750', unitFactor: null });
    expect(stripMeasureUnits('2 = 100x50')).toEqual({ text: '2 = 100x50', unitFactor: null });
  });
});
