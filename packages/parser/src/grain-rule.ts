/**
 * grain-rule.ts
 * ---------------------------------------------------------------------------
 * Regra do sentido do veio do MDF. Ver equivalente no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import type { Piece } from './types.js';

/**
 * Chapas de MDF têm veio/desenho impresso no sentido do comprimento.
 * Quando a largura de uma peça vem maior que uma chapa permite, é sinal
 * de que ela foi digitada com comprimento e largura trocados — inverte
 * os dois valores para que o maior sempre vire o comprimento.
 *
 * A fita é remapeada junto, seguindo a MEDIDA física, não o rótulo:
 * se a fita estava em L1 (numa largura de 2000mm), depois da inversão
 * essa mesma borda passa a se chamar C1 (porque 2000 agora é o
 * comprimento) — por isso C1↔L1 e C2↔L2 trocam de lugar.
 *
 * IMPORTANTE: este limiar é uma propriedade física das chapas de MDF (a
 * largura máxima de uma chapa padrão), não um parâmetro de configuração —
 * por isso permanece uma constante de código, não uma variável de ambiente.
 */
export const GRAIN_INVERSION_THRESHOLD_MM = 1840;

export function applyGrainOrientationRule(piece: Piece): void {
  if (piece.larg <= GRAIN_INVERSION_THRESHOLD_MM) return;

  const oldCompr = piece.compr;
  const oldLarg = piece.larg;
  piece.compr = oldLarg;
  piece.larg = oldCompr;

  const oldFita = piece.fita;
  piece.fita = { c1: oldFita.l1, c2: oldFita.l2, l1: oldFita.c1, l2: oldFita.c2 };

  piece.wasInverted = true;
}
