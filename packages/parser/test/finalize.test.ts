import { describe, expect, it } from 'vitest';
import { convertPieceToMm, MIN_PLAUSIBLE_PIECE_MM } from '../src/finalize.js';
import type { Piece } from '../src/types.js';

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
  it('é uma constante fixa de 100mm', () => {
    expect(MIN_PLAUSIBLE_PIECE_MM).toBe(100);
  });

  it('não marca uma peça com medidas plausíveis depois da conversão', () => {
    const piece = makePiece({ compr: 96, larg: 65 });
    convertPieceToMm(piece, 10); // cm -> mm: 960 x 650
    expect(piece.compr).toBe(960);
    expect(piece.larg).toBe(650);
    expect(piece.suspiciouslySmall).toBe(false);
  });

  it('marca quando compr fica abaixo de 100mm depois da conversão (caso real testado: "1.90" tratado como cm)', () => {
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
    const piece = makePiece({ compr: 500, larg: 5 });
    convertPieceToMm(piece, 10);
    expect(piece.larg).toBe(50);
    expect(piece.suspiciouslySmall).toBe(true);
  });

  it('não marca quando a medida está exatamente no limite (100mm)', () => {
    const piece = makePiece({ compr: 10, larg: 10 });
    convertPieceToMm(piece, 10); // exatamente 100mm nos dois lados
    expect(piece.compr).toBe(100);
    expect(piece.larg).toBe(100);
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
