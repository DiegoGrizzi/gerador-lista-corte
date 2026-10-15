import { describe, expect, it } from 'vitest';
import {
  allowsEdgeBanding,
  convertPieceToMm,
  finalizePiece,
  isMaterialWithoutColor,
  markFitaUnknownIfNeeded,
  MIN_PLAUSIBLE_PIECE_MM,
} from '../src/finalize.js';

describe('isMaterialWithoutColor', () => {
  it.each(['MDF', 'mdf', 'MDF 6mm', 'mdf 15mm', 'MDF 12,5mm'])('"%s" é MDF sem cor', (material) => {
    expect(isMaterialWithoutColor(material)).toBe(true);
  });

  it.each(['MDF branco', 'MDF Branco 6mm', 'Branca 15mm', '', '15mm', 'MDF beige naval'])(
    '"%s" não é "só MDF"',
    (material) => {
      expect(isMaterialWithoutColor(material)).toBe(false);
    },
  );
});
import type { Piece, RawPiece } from '../src/types.js';

function makePiece(overrides: Partial<Piece>): Piece {
  return {
    id: '1',
    material: 'MDF branco 15mm',
    complemento: '',
    funcao: '',
    qtd: 1,
    compr: 100,
    larg: 50,
    thicknessMm: 15,
    fitaType: null,
    customFita: null,
    isOverride: false,
    note: '',
    fita: { c1: true, c2: false, l1: false, l2: true },
    ...overrides,
  };
}

describe('convertPieceToMm — aviso de medida implausível', () => {
  it('é uma constante fixa de 30mm', () => {
    expect(MIN_PLAUSIBLE_PIECE_MM).toBe(30);
  });

  it('não marca uma peça com medidas plausíveis depois da conversão', () => {
    const piece = makePiece({ compr: 96, larg: 65 });
    convertPieceToMm(piece, 10); // cm -> mm: 960 x 650
    expect(piece.compr).toBe(960);
    expect(piece.larg).toBe(650);
    expect(piece.suspiciouslySmall).toBe(false);
  });

  it('não marca uma peça pequena mas ainda plausível (ex: um retalho/fita de acabamento)', () => {
    // Limite baixo (30mm) de proposito para não incomodar em peças
    // pequenas legitimas - só pega casos bem extremos de mistura de unidade.
    const piece = makePiece({ compr: 500, larg: 4 });
    convertPieceToMm(piece, 10); // 4cm -> 40mm, acima do limite
    expect(piece.larg).toBe(40);
    expect(piece.suspiciouslySmall).toBe(false);
  });

  it('marca quando compr fica abaixo de 30mm depois da conversão (caso real testado: "1.90" tratado como cm)', () => {
    // Mensagem real do usuário: a maioria das peças em cm, mas algumas
    // medidas especificamente escritas em metros (ex: "1.90" = 1,90m).
    // Ao escolher "cm" para a mensagem inteira, 1.90 vira 19mm - bem
    // abaixo do plausível para uma peça de corte real.
    const piece = makePiece({ compr: 1.9, larg: 7 });
    convertPieceToMm(piece, 10); // cm -> mm
    expect(piece.compr).toBe(19);
    expect(piece.larg).toBe(70);
    expect(piece.suspiciouslySmall).toBe(true);
  });

  it('marca quando só a largura fica pequena, mesmo com o comprimento plausível', () => {
    const piece = makePiece({ compr: 500, larg: 2 });
    convertPieceToMm(piece, 10); // 2cm -> 20mm, abaixo do limite
    expect(piece.larg).toBe(20);
    expect(piece.suspiciouslySmall).toBe(true);
  });

  it('não marca quando a medida está exatamente no limite (30mm)', () => {
    const piece = makePiece({ compr: 3, larg: 3 });
    convertPieceToMm(piece, 10); // exatamente 30mm nos dois lados
    expect(piece.compr).toBe(30);
    expect(piece.larg).toBe(30);
    expect(piece.suspiciouslySmall).toBe(false);
  });

  it('não interfere na regra do sentido do veio (continuam podendo rodar juntas)', () => {
    const piece = makePiece({ compr: 100, larg: 200 });
    convertPieceToMm(piece, 10); // 1000 x 2000 -> larg > 1840, deve inverter
    expect(piece.compr).toBe(2000);
    expect(piece.larg).toBe(1000);
    expect(piece.wasInverted).toBe(true);
    expect(piece.suspiciouslySmall).toBe(false);
  });
});

describe('MDF abaixo de 15mm não leva fita', () => {
  const rawPiece = (overrides: Partial<RawPiece>): RawPiece => ({
    id: '1',
    material: 'MDF Branco',
    complemento: '',
    funcao: '',
    qtd: 1,
    compr: 100,
    larg: 50,
    thicknessMm: 6,
    fitaType: null,
    customFita: null,
    isOverride: false,
    note: '',
    ...overrides,
  });

  it('allowsEdgeBanding: só é falso com espessura conhecida abaixo de 15', () => {
    expect(allowsEdgeBanding(6)).toBe(false);
    expect(allowsEdgeBanding(14.9)).toBe(false);
    expect(allowsEdgeBanding(15)).toBe(true);
    expect(allowsEdgeBanding(18)).toBe(true);
    expect(allowsEdgeBanding(null)).toBe(true);
    expect(allowsEdgeBanding(undefined)).toBe(true);
  });

  it('finalizePiece zera a fita mesmo com fita explícita (tipo, códigos ou "3L" pendente)', () => {
    const none = { c1: false, c2: false, l1: false, l2: false };
    expect(finalizePiece(rawPiece({ fitaType: 'all' })).fita).toEqual(none);
    expect(finalizePiece(rawPiece({ customFita: { c1: true, c2: true, l1: true, l2: true } })).fita).toEqual(none);
    expect(finalizePiece(rawPiece({ pendingThreeLados: true })).pendingThreeLados).toBe(false);
  });

  it('finalizePiece mantém a fita em 15mm ou mais', () => {
    expect(finalizePiece(rawPiece({ thicknessMm: 15, fitaType: 'all' })).fita).toEqual({
      c1: true,
      c2: true,
      l1: true,
      l2: true,
    });
  });

  it('markFitaUnknownIfNeeded não marca peça fina (não há o que perguntar)', () => {
    const thin = rawPiece({});
    markFitaUnknownIfNeeded(thin);
    expect(thin.fitaUnknown).toBeUndefined();

    const thick = rawPiece({ thicknessMm: 15 });
    markFitaUnknownIfNeeded(thick);
    expect(thick.fitaUnknown).toBe(true);
  });
});
