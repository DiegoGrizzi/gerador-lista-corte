/**
 * fita-by-dimension.ts
 * ---------------------------------------------------------------------------
 * Linhas que descrevem a fita de uma peça JÁ listada, identificando-a pelas
 * medidas em vez de repetir a peça: "1200 × 700: nos 4 lados",
 * "450 × 100 e 315 × 100: borda superior". Não criam peça nova — só aplicam
 * a fita às peças de mesma medida (ver applyFitaByDimensionRules).
 * ---------------------------------------------------------------------------
 */

import { parseFitamentoPhrase } from './fitamento.js';
import { applyFitaCodesToPiece } from './fita-codes.js';
import { toNumber } from './numbers.js';
import type { RawPiece } from './types.js';

const DIMENSION_SOURCE = "\\d+(?:[.,']\\d+)?\\s*[x×]\\s*\\d+(?:[.,']\\d+)?";

/** "1200 × 700: <frase>" ou "450 × 100 e 315 × 100: <frase>" — uma ou mais medidas antes dos dois-pontos. */
export const FITA_BY_DIMENSION_RE = new RegExp(
  '^(' + DIMENSION_SOURCE + '(?:\\s*(?:e|,|;|\\+|&)\\s*' + DIMENSION_SOURCE + ')*)\\s*(?:mm)?\\s*:\\s*(.+)$',
  'i',
);

const SINGLE_DIMENSION_RE = new RegExp("(\\d+(?:[.,']\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,']\\d+)?)", 'gi');

export interface FitaByDimensionRule {
  dimensions: { compr: number; larg: number }[];
  /** Códigos de fita (ver fita-codes.ts); lista vazia = "sem fita". */
  codes: string[];
  /** Linha original, usada para ir à conferência quando nenhuma peça tem essas medidas. */
  line: string;
}

/**
 * Posições de borda citadas por nome (frente/trás/superior/inferior/
 * laterais...) — só dá para saber QUANTAS bordas a frase pede, não a qual
 * dos pares (maior/menor) cada uma pertence, porque isso depende de como a
 * peça fica montada. Convenção assumida (editável na tabela de conferência):
 *   - 1 borda  → 1 lado maior ("borda frontal" / "borda superior" quase
 *     sempre são a borda comprida visível da peça)
 *   - 3 bordas → 1 lado maior + 2 menores (uma borda avulsa + um par
 *     oposto, como "superior e laterais" ou "frente, trás e inferior")
 *   - 4 bordas → todas
 * Qualquer outra contagem (ex: 2) devolve null — ambígua demais, a linha
 * vai para a conferência em vez de chutar.
 */
const EDGE_WORDS: { re: RegExp; count: number }[] = [
  { re: /\b(?:frente|frontal)\b/i, count: 1 },
  { re: /\b(?:tr[aá]s|traseira)\b/i, count: 1 },
  { re: /\b(?:superior|topo)\b/i, count: 1 },
  { re: /\binferior\b/i, count: 1 },
  { re: /\blaterais\b/i, count: 2 },
  { re: /\blateral\b/i, count: 1 },
  { re: /\b(?:esquerd[ao]|direit[ao])\b/i, count: 1 },
];

function codesFromEdgeWords(phrase: string): string[] | null {
  let total = 0;
  for (const word of EDGE_WORDS) {
    if (word.re.test(phrase)) total += word.count;
  }
  if (total === 1) return ['1M'];
  if (total === 3) return ['1M', '2m'];
  if (total === 4) return ['4L'];
  return null;
}

const CODES_BY_TYPE = {
  'none-explicit': [],
  all: ['4L'],
  'maior-um': ['1M'],
  'maior-dois': ['2M'],
  'menor-um': ['1m'],
  'menor-dois': ['2m'],
} as const;

/** Devolve a regra se a linha tem o formato "medidas: fita" E a frase é uma fita reconhecível; senão null (a linha segue para os outros formatos). */
export function parseFitaByDimensionLine(line: string): FitaByDimensionRule | null {
  const match = FITA_BY_DIMENSION_RE.exec(line);
  if (!match) return null;

  const phrase = match[2]!;
  const type = parseFitamentoPhrase(phrase);
  const codes = type ? [...CODES_BY_TYPE[type]] : codesFromEdgeWords(phrase);
  if (!codes) return null;

  const dimensions = Array.from(match[1]!.matchAll(SINGLE_DIMENSION_RE)).map((m) => ({
    compr: toNumber(m[1]!),
    larg: toNumber(m[2]!),
  }));
  return { dimensions, codes, line };
}

/**
 * Aplica as regras às peças de mesma medida (tenta a ordem exata; se
 * nenhuma bater, tenta comprimento/largura trocados). Depois, quando pelo
 * menos uma regra foi aplicada, as peças que ficaram sem nenhuma informação
 * de fita viram "sem fita" explícito — uma seção "Fita de borda:" lista
 * todas as que têm fita, então as ausentes não têm. Devolve as linhas cujas
 * medidas não bateram com nenhuma peça (para a conferência).
 */
export function applyFitaByDimensionRules(pieces: RawPiece[], rules: FitaByDimensionRule[]): string[] {
  const unmatchedLines: string[] = [];
  let appliedAny = false;

  for (const rule of rules) {
    let lineMatchedEverything = true;
    for (const dim of rule.dimensions) {
      let matches = pieces.filter((p) => p.compr === dim.compr && p.larg === dim.larg);
      if (matches.length === 0) matches = pieces.filter((p) => p.compr === dim.larg && p.larg === dim.compr);
      if (matches.length === 0) {
        lineMatchedEverything = false;
        continue;
      }
      appliedAny = true;
      for (const piece of matches) applyFitaCodesToPiece(piece, rule.codes);
    }
    if (!lineMatchedEverything) unmatchedLines.push(rule.line);
  }

  if (appliedAny) {
    for (const piece of pieces) {
      if (piece.fitaType == null && !piece.customFita) piece.fitaType = 'none-explicit';
    }
  }
  return unmatchedLines;
}
