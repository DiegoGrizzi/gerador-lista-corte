/**
 * finalize.ts
 * ---------------------------------------------------------------------------
 * Cálculo final dos booleanos de fita e conversão de unidade. Ver
 * equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import { resolveFitaFromType } from './fitamento.js';
import { applyGrainOrientationRule } from './grain-rule.js';
import type { Piece, RawPiece } from './types.js';

/**
 * Calcula os booleanos finais de fita (c1/c2/l1/l2) e junta a espessura
 * ao nome do material (ex: "MDF branco" + 15 → "MDF branco 15mm").
 * Deve ser chamada uma única vez por peça, depois que todo contexto
 * pendente (material/fita/espessura que só aparecem mais abaixo na
 * mensagem) já foi resolvido.
 *
 * Não aplica a regra do sentido do veio aqui de propósito — nesse ponto
 * a medida pode ainda não estar em milímetros (a pergunta "já está em
 * mm?" só é respondida depois). Ver convertPieceToMm.
 *
 * Muta o objeto recebido (mesma referência usada pelo mecanismo de
 * pendências de analyzeText) e devolve a mesma referência já tipada como
 * Piece, agora com `fita` presente.
 */
export function finalizePiece(piece: RawPiece): Piece {
  const fita = piece.customFita || resolveFitaFromType(piece.fitaType, piece.compr, piece.larg);
  let label = piece.material || '';
  if (piece.thicknessMm != null) label += (label ? ' ' : '') + piece.thicknessMm + 'mm';

  const finalized = piece as Piece;
  finalized.fita = fita;
  finalized.material = label;
  return finalized;
}

/**
 * Abaixo desse valor (em mm), uma medida de comprimento ou largura é
 * fisicamente implausível para uma peça de corte real — sinal forte de
 * mistura de unidades dentro da mesma mensagem (ex: a maioria das medidas
 * em cm, mas uma ou outra escrita em metros, como "1.90" em vez de "190").
 * Como o sistema só pergunta uma unidade para a mensagem inteira, não dá
 * para converter automaticamente sem arriscar adivinhar errado — a peça só
 * é marcada (ver Piece.suspiciouslySmall) para o usuário revisar e corrigir
 * manualmente, nunca corrigida sozinha.
 */
export const MIN_PLAUSIBLE_PIECE_MM = 30;

/**
 * Converte uma peça já finalizada para milímetros (multiplicando pelo
 * fator escolhido pelo usuário: 1 se já estava em mm, 10 para cm→mm,
 * 1000 para m→mm) e só então aplica a regra do sentido do veio — que
 * exige a medida real em mm para funcionar corretamente (chapas de MDF
 * têm um limite físico de largura; medir em cm ou m confundiria essa
 * checagem se aplicada antes da conversão).
 */
export function convertPieceToMm(piece: Piece, factor: number): void {
  piece.compr = Math.round(piece.compr * factor);
  piece.larg = Math.round(piece.larg * factor);
  applyGrainOrientationRule(piece);
  piece.suspiciouslySmall = piece.compr < MIN_PLAUSIBLE_PIECE_MM || piece.larg < MIN_PLAUSIBLE_PIECE_MM;
}
