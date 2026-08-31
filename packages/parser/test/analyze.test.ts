import { describe, expect, it } from 'vitest';
import { analyzeText } from '../src/analyze.js';
import {
  HEADER_THEN_PIECES,
  MATERIAL_DECLARED_AFTER_PIECES,
  TYPO_LINE,
  UNPARSEABLE_LINE,
  MULTI_PIECE_ALL_VALID,
  MULTI_PIECE_NOT_ALL_VALID,
  DIMENSION_FIRST_LIST,
  PC_ASTERISK_LIST,
  REALISTIC_MESSAGE,
  NAVAL_BR_FITA_CODES,
  CINZA_JAZZ_SHORTHAND_FITA,
  ASTERISK_MULTI_HEADER_MESSAGE,
  SPELLED_OUT_QUANTITY_MESSAGE,
  MARKDOWN_TABLE_LIST,
  MARKDOWN_TABLE_LIST_WITH_UNIT_HEADER,
  MARKDOWN_TABLE_LIST_WITH_FITA_COLUMNS,
  TSV_TABLE_LIST,
  PDF_TABLE_WITH_OBSERVACAO,
  PDF_TABLE_WITH_COMBINED_DIMENSAO,
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

describe('analyzeText — "comprimento x largura: quantidade" format (real user list)', () => {
  it('reads quantity from after the colon instead of defaulting every line to 1', () => {
    const result = analyzeText(DIMENSION_FIRST_LIST, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(13);
    expect(result.pieces.map((p) => ({ qtd: p.qtd, compr: p.compr, larg: p.larg }))).toEqual([
      { qtd: 2, compr: 760, larg: 395 },
      { qtd: 2, compr: 245, larg: 453 },
      { qtd: 1, compr: 975, larg: 375 },
      { qtd: 1, compr: 210, larg: 356 },
      { qtd: 1, compr: 502, larg: 356 },
      { qtd: 1, compr: 800, larg: 271 },
      { qtd: 1, compr: 800, larg: 265 },
      { qtd: 4, compr: 690, larg: 400 },
      { qtd: 1, compr: 765, larg: 350 },
      { qtd: 1, compr: 185, larg: 690 },
      { qtd: 2, compr: 496, larg: 690 },
      { qtd: 1, compr: 465, larg: 650 }, // "465x650: peça" — sem número, quantidade implícita 1.
      { qtd: 2, compr: 765, larg: 585 }, // "2 pecas" sem cedilha.
    ]);
    // Nenhuma peça carrega o texto ": N peças" sobrando no campo função.
    for (const piece of result.pieces) {
      expect(piece.funcao).toBe('');
    }
  });
});

describe('analyzeText — tabela em formato Markdown (real user list)', () => {
  it('lê Quantidade/Comprimento/Largura pelo cabeçalho e usa a coluna "Peça" como Função', () => {
    const result = analyzeText(MARKDOWN_TABLE_LIST, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(21);
    expect(result.pieces[0]).toMatchObject({ qtd: 4, compr: 1700, larg: 100, funcao: 'Pilares verticais' });
    expect(result.pieces[1]).toMatchObject({ qtd: 4, compr: 1900, larg: 200, funcao: 'Laterais das camas' });
    expect(result.pieces.at(-1)).toMatchObject({ qtd: 1, compr: 1900, larg: 850, funcao: 'Fundo/base do bicama' });
    // Nenhum material foi declarado na mensagem - fica pendente do modal.
    expect(result.materialMentioned).toBe(false);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('');
    }
  });

  it('reconhece o cabeçalho mesmo com unidade entre parênteses ("Comprimento (mm)")', () => {
    const result = analyzeText(MARKDOWN_TABLE_LIST_WITH_UNIT_HEADER, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(3);
    expect(result.pieces.map((p) => ({ qtd: p.qtd, compr: p.compr, larg: p.larg, funcao: p.funcao }))).toEqual([
      { qtd: 2, compr: 1700, larg: 970, funcao: 'Laterais estruturais' },
      { qtd: 2, compr: 1990, larg: 250, funcao: 'Frente/fundo da cama superior' },
      { qtd: 1, compr: 1990, larg: 900, funcao: 'Base do bicama' },
    ]);
  });

  it('lê "Quant." (com ponto) e as colunas Fita C1/C2/L1/L2 (✓/-) como a fita explícita de cada linha', () => {
    const result = analyzeText(MARKDOWN_TABLE_LIST_WITH_FITA_COLUMNS, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(3);
    expect(result.pieces.map((p) => ({ qtd: p.qtd, fita: p.fita }))).toEqual([
      { qtd: 2, fita: { c1: true, c2: true, l1: true, l2: true } },
      { qtd: 4, fita: { c1: false, c2: false, l1: false, l2: false } },
      { qtd: 2, fita: { c1: true, c2: true, l1: false, l2: false } },
    ]);
  });
});

describe('analyzeText — tabela colada de planilha (TSV, delimitada por tabulação, real user list)', () => {
  it('lê Quantidade/Comprimento/Largura/Função/Fita/Material pelo cabeçalho, sem linha separadora', () => {
    const result = analyzeText(TSV_TABLE_LIST, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(3);
    expect(
      result.pieces.map((p) => ({ qtd: p.qtd, compr: p.compr, larg: p.larg, funcao: p.funcao, material: p.material, fita: p.fita })),
    ).toEqual([
      { qtd: 2, compr: 1700, larg: 970, funcao: 'LAT', material: 'MDF 25mm', fita: { c1: true, c2: true, l1: true, l2: true } },
      { qtd: 4, compr: 900, larg: 100, funcao: 'TRAV', material: 'MDF 25mm', fita: { c1: false, c2: false, l1: false, l2: false } },
      { qtd: 2, compr: 860, larg: 120, funcao: 'LAT', material: 'MDF 25mm', fita: { c1: true, c2: true, l1: false, l2: false } },
    ]);
    expect(result.materialMentioned).toBe(false); // material vem da própria linha, não de um cabeçalho de bloco.
  });
});

describe('analyzeText — tabela extraída de PDF via OCR, com "Observação" (real user data)', () => {
  it('lê Largura/Altura (Altura = comprimento) e usa Observação como Complemento', () => {
    const result = analyzeText(PDF_TABLE_WITH_OBSERVACAO, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(3);
    expect(
      result.pieces.map((p) => ({ qtd: p.qtd, compr: p.compr, larg: p.larg, funcao: p.funcao, complemento: p.complemento })),
    ).toEqual([
      { qtd: 1, compr: 302, larg: 1452, funcao: 'Painel @B14 @T14 @L14 @R14', complemento: 'SALA' },
      { qtd: 1, compr: 302, larg: 223.5, funcao: 'Lateral Esquerda @B14 @T14 @L14 @R14', complemento: 'SALA' },
      { qtd: 1, compr: 301, larg: 207, funcao: 'Divisoria @B14 @R14', complemento: 'SALA' },
    ]);
  });
});

describe('analyzeText — tabela extraída de PDF via OCR, sem quantidade e com Dimensão combinada (real user data)', () => {
  it('lê "compr x larg x espessura" de uma célula só e assume 1 peça por linha (sem coluna de quantidade)', () => {
    const result = analyzeText(PDF_TABLE_WITH_COMBINED_DIMENSAO, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.pieces).toHaveLength(3);
    expect(
      result.pieces.map((p) => ({ qtd: p.qtd, compr: p.compr, larg: p.larg, thicknessMm: p.thicknessMm, funcao: p.funcao })),
    ).toEqual([
      { qtd: 1, compr: 250, larg: 435, thicknessMm: 15, funcao: 'Base 15' },
      { qtd: 1, compr: 250, larg: 435, thicknessMm: 15, funcao: 'Prateleira Linear (Fixa)' },
      { qtd: 1, compr: 1700, larg: 70, thicknessMm: 15, funcao: 'Base 15' },
    ]);
  });
});

describe('analyzeText — "quantidade+pc+comprimento*largura" format, tudo numa linha (real user list)', () => {
  it('expande a lista inteira e propaga o material/espessura do cabeçalho na mesma linha', () => {
    const result = analyzeText(PC_ASTERISK_LIST, makeNextId());

    // 24 peças na lista, 1 malformada ("8pc+13+43", separador errado) -> 23 reconhecidas.
    expect(result.pieces).toHaveLength(23);
    expect(result.materialMentioned).toBe(true);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('MDF naval 18mm');
    }

    expect(result.pieces[0]).toMatchObject({ qtd: 1, compr: 96, larg: 65 });
    expect(result.pieces[1]).toMatchObject({ qtd: 1, compr: 192, larg: 65 });
    expect(result.pieces[2]).toMatchObject({ qtd: 4, compr: 69.5, larg: 65 });
    // Última peça da lista, depois da malformada — confirma que o resto
    // continua sendo processado normalmente após o item descartado.
    expect(result.pieces[22]).toMatchObject({ qtd: 1, compr: 53, larg: 57 });

    // A peça sem o comprimento vai para a conferência, não quebra o resto.
    expect(result.discarded).toHaveLength(1);
    expect(result.discarded[0]!.text).toContain('13+43');
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

describe('analyzeText — "quantidade X compr X larg" com códigos de fita por peça (real user list)', () => {
  it('reconhece o cabeçalho sem "MDF", as 12 peças e nenhuma vai para conferência', () => {
    const result = analyzeText(NAVAL_BR_FITA_CODES, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.materialMentioned).toBe(true);
    expect(result.pieces).toHaveLength(12);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('NAVAL BR 15mm');
      // O "X" repetido entre quantidade e comprimento não deve sobrar como função.
      expect(piece.funcao).toBe('');
    }
  });

  it('"1M" e "1m" na mesma linha combinam fita no lado maior e no menor', () => {
    const result = analyzeText(NAVAL_BR_FITA_CODES, makeNextId());
    const piece = result.pieces[0]!; // 3 X 0,80 X 0,505  1M  1m
    expect(piece).toMatchObject({ qtd: 3, compr: 0.8, larg: 0.505 });
    // comprimento (0,80) > largura (0,505) -> par maior é C.
    expect(piece.fita).toEqual({ c1: true, c2: false, l1: true, l2: false });
  });

  it('"1M" sozinho marca só o lado maior', () => {
    const result = analyzeText(NAVAL_BR_FITA_CODES, makeNextId());
    const piece = result.pieces[1]!; // 1 X 1,46 X 0,505  1M
    expect(piece.fita).toEqual({ c1: true, c2: false, l1: false, l2: false });
  });

  it('"3L" fica pendente (ambíguo) em vez de decidir uma fita sozinho', () => {
    const result = analyzeText(NAVAL_BR_FITA_CODES, makeNextId());
    const threeLadosPieces = result.pieces.filter((p) => p.pendingThreeLados);
    // 5 linhas usam "3L" no fixture.
    expect(threeLadosPieces).toHaveLength(5);
    for (const piece of threeLadosPieces) {
      expect(piece.fita).toEqual({ c1: false, c2: false, l1: false, l2: false });
    }
  });
});

describe('analyzeText — cabeçalho genérico sem "MDF" e fitamento em abreviação curta (real user list)', () => {
  it('lê a cor/espessura do cabeçalho mesmo sem "MDF" nem palavra de quantidade', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());

    expect(result.discarded).toHaveLength(0);
    expect(result.materialMentioned).toBe(true);
    expect(result.pieces).toHaveLength(10);
    for (const piece of result.pieces) {
      expect(piece.material).toBe('cinza jazz 18mm');
      // O "1-"/"2-" da quantidade não deve sobrar como função.
      expect(piece.funcao).toBe('');
    }
  });

  it('"sem" sozinho (sem a palavra "fita") é entendido como none-explicit, não como função', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());
    const piece = result.pieces[0]!; // 1-137x137 sem
    expect(piece.funcao).toBe('');
    expect(piece.fita).toEqual({ c1: false, c2: false, l1: false, l2: false });
  });

  it('"1 menor"/"2 menor" e "1 maior"/"2 maior" (sem a palavra "lado") aplicam a fita certa, não a função', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());

    // 2-73x90 1 menor -> comprimento (73) é o lado menor -> C1.
    expect(result.pieces[1]).toMatchObject({ funcao: '', fita: { c1: true, c2: false, l1: false, l2: false } });
    // 2-73x78 2 menor -> comprimento (73) é o lado menor -> C1+C2.
    expect(result.pieces[3]).toMatchObject({ funcao: '', fita: { c1: true, c2: true, l1: false, l2: false } });
    // 1- 73x90 2 menor -> mesma peça de novo, mesma regra.
    expect(result.pieces[7]).toMatchObject({ funcao: '', fita: { c1: true, c2: true, l1: false, l2: false } });
  });

  it('"4 lados" continua funcionando (fita nos 4 lados)', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());
    expect(result.pieces[2]!.fita).toEqual({ c1: true, c2: true, l1: true, l2: true }); // 1-168x78 4 lados
    expect(result.pieces[8]!.fita).toEqual({ c1: true, c2: true, l1: true, l2: true }); // 6- 72,5x42,8 4 lados
  });

  it('tolera o "." sobrando entre a medida e a fita ("73x1,20. 2 menor")', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());
    const piece = result.pieces[5]!; // 2-73x1,20. 2 menor
    expect(piece.funcao).toBe('');
    // largura (1,20) é o lado menor aqui -> L1+L2.
    expect(piece.fita).toEqual({ c1: false, c2: false, l1: true, l2: true });
  });

  it('linhas sem nenhuma anotação de fita ficam sem fita (default), sem quebrar nada', () => {
    const result = analyzeText(CINZA_JAZZ_SHORTHAND_FITA, makeNextId());
    expect(result.pieces[6]!.fita).toEqual({ c1: false, c2: false, l1: false, l2: false }); // 1- 196,3x20
    expect(result.pieces[9]!.fita).toEqual({ c1: false, c2: false, l1: false, l2: false }); // 4- 46,3x72,5
  });
});

describe('analyzeText — separador "*" e três estilos de cabeçalho de material na mesma mensagem (real user list)', () => {
  it('reconhece as 22 peças (nenhuma vai para conferência, só a seção "Ferragens")', () => {
    const result = analyzeText(ASTERISK_MULTI_HEADER_MESSAGE, makeNextId());

    expect(result.pieces).toHaveLength(22);
    expect(result.materialMentioned).toBe(true);
    // As linhas de ferragem (sem duas medidas reconhecíveis) somem em
    // silêncio hoje — só o rótulo "Ferragens" em si vai pra conferência.
    expect(result.discarded.map((d) => d.text)).toEqual(['Ferragens']);
  });

  it('"Branco 18 comum" — cor + espessura sem "mm", com palavra de acabamento no final', () => {
    const result = analyzeText(ASTERISK_MULTI_HEADER_MESSAGE, makeNextId());
    for (const piece of result.pieces.slice(0, 9)) {
      expect(piece).toMatchObject({ material: 'Branco 18mm', funcao: '' });
    }
    expect(result.pieces[0]).toMatchObject({ qtd: 3, compr: 624, larg: 480 });
  });

  it('"2"850*515" — troca de propósito de "*" por aspas simples continua lendo certo', () => {
    const result = analyzeText(ASTERISK_MULTI_HEADER_MESSAGE, makeNextId());
    expect(result.pieces[4]).toMatchObject({ qtd: 2, compr: 850, larg: 515 });
  });

  it('"MDF branco 15mm comum" — espessura colada sem "de" na frente continua sendo lida', () => {
    const result = analyzeText(ASTERISK_MULTI_HEADER_MESSAGE, makeNextId());
    for (const piece of result.pieces.slice(9, 16)) {
      expect(piece).toMatchObject({ material: 'MDF branco comum 15mm', thicknessMm: 15 });
    }
  });

  it('"Freijó Trend" + "18mm" em duas linhas separadas vira um cabeçalho só', () => {
    const result = analyzeText(ASTERISK_MULTI_HEADER_MESSAGE, makeNextId());
    for (const piece of result.pieces.slice(16, 22)) {
      expect(piece).toMatchObject({ material: 'Freijó Trend 18mm', thicknessMm: 18 });
    }
  });
});

describe('analyzeText — quantidade por extenso, saudação colada e espessura declarada depois em "ml" (real user list)', () => {
  it('reconhece as 14 peças, todas sem material (nunca foi declarado nesta mensagem)', () => {
    const result = analyzeText(SPELLED_OUT_QUANTITY_MESSAGE, makeNextId());

    expect(result.pieces).toHaveLength(14);
    expect(result.discarded).toHaveLength(0);
    expect(result.materialMentioned).toBe(false);
  });

  it('"boa tarde duas lateral de 2050x550" — remove a saudação e lê "duas" como quantidade 2', () => {
    const result = analyzeText(SPELLED_OUT_QUANTITY_MESSAGE, makeNextId());
    expect(result.pieces[0]).toMatchObject({ qtd: 2, compr: 2050, larg: 550, funcao: 'lateral' });
  });

  it.each([
    [1, { qtd: 1, compr: 196.5, larg: 550, funcao: 'lateral' }], // uma de 196.5x550 lateral
    [7, { qtd: 5, compr: 530, larg: 500, funcao: '' }], // cinco de 530x500
    [8, { qtd: 5, compr: 57.5, larg: 500, funcao: '' }], // cinco 57.5x500 (sem "de")
    [11, { qtd: 4, compr: 450, larg: 13, funcao: '' }], // quatro de 450x13
  ])('lê a quantidade por extenso corretamente na peça %i', (index, expected) => {
    const result = analyzeText(SPELLED_OUT_QUANTITY_MESSAGE, makeNextId());
    expect(result.pieces[index]).toMatchObject(expected);
  });

  it('"esses são de 15 ml" retroage a espessura 15mm pra todas as 13 peças já lidas', () => {
    const result = analyzeText(SPELLED_OUT_QUANTITY_MESSAGE, makeNextId());
    for (const piece of result.pieces.slice(0, 13)) {
      expect(piece.thicknessMm).toBe(15);
    }
  });

  it('"uma de 1730x2000 fundo de 6ml" sobrescreve a espessura do bloco só nessa peça', () => {
    const result = analyzeText(SPELLED_OUT_QUANTITY_MESSAGE, makeNextId());
    const last = result.pieces[13]!;
    expect(last).toMatchObject({ qtd: 1, compr: 1730, larg: 2000, funcao: 'fundo', thicknessMm: 6 });
  });
});
