/**
 * fitamento.ts
 * ---------------------------------------------------------------------------
 * Interpretação de frases de fitamento e tradução do tipo detectado nas
 * quatro bordas reais da peça. Ver equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import type { FitamentoType, FitaState } from './types.js';

/**
 * Interpreta uma frase sobre fitamento e devolve um dos tipos abaixo,
 * ou null se o texto não menciona fita nenhuma:
 *   'none-explicit' → "não precisa fita" / "sem fita" / "só cortar"
 *   'all'           → "fita tudo" / "fitado os 4 lados"
 *   'maior-um'      → fita em uma borda do lado maior
 *   'maior-dois'    → fita nas duas bordas do lado maior
 *   'menor-um'      → fita em uma borda do lado menor
 *   'menor-dois'    → fita nas duas bordas do lado menor
 */
export function parseFitamentoPhrase(text: string): FitamentoType | null {
  const lower = text.toLowerCase();
  if (/n[aã]o\s+precisa|sem\s+fita|s[oó]\s+cortar/.test(lower)) return 'none-explicit';
  if (/4\s*lados?|fita\s*tudo|tudo\s*fita/.test(lower)) return 'all';
  if (/dois?\s+lados?\s+(maior|grande)/.test(lower)) return 'maior-dois';
  if (/dois?\s+lados?\s+(menor|pequen[oa])/.test(lower)) return 'menor-dois';
  if (/lado\s+(maior|grande)|parte\s+(maior|grande)/.test(lower)) return 'maior-um';
  if (/lado\s+(menor|pequen[oa])|parte\s+(menor|pequen[oa])/.test(lower)) return 'menor-um';
  return null;
}

/**
 * Traduz um tipo de fitamento (ver parseFitamentoPhrase) nas quatro bordas
 * reais da peça: C1/C2 (bordas do comprimento) e L1/L2 (bordas da largura).
 * Quando o tipo é "um lado" ou "dois lados", a comparação comprimento x
 * largura decide qual par de bordas recebe a fita.
 */
export function resolveFitaFromType(
  type: FitamentoType | null,
  comprimento: number,
  largura: number,
): FitaState {
  const none: FitaState = { c1: false, c2: false, l1: false, l2: false };
  if (!type || type === 'none-explicit') return none;
  if (type === 'all') return { c1: true, c2: true, l1: true, l2: true };

  const largMaior = largura > comprimento;
  const largMenor = largura < comprimento;

  if (type === 'maior-um')
    return largMaior ? { c1: false, c2: false, l1: true, l2: false } : { c1: true, c2: false, l1: false, l2: false };
  if (type === 'maior-dois')
    return largMaior ? { c1: false, c2: false, l1: true, l2: true } : { c1: true, c2: true, l1: false, l2: false };
  if (type === 'menor-um')
    return largMenor ? { c1: false, c2: false, l1: true, l2: false } : { c1: true, c2: false, l1: false, l2: false };
  if (type === 'menor-dois')
    return largMenor ? { c1: false, c2: false, l1: true, l2: true } : { c1: true, c2: true, l1: false, l2: false };
  return none;
}
