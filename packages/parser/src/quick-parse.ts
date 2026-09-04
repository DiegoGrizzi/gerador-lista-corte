/**
 * quick-parse.ts
 * ---------------------------------------------------------------------------
 * Resgate de uma linha editada na lista de conferência. Ver equivalente
 * (quickParseLine) no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import { SUSPICIOUS_ADJACENT_RE, MULTIPLE_PIECES_RE } from './regex-patterns.js';
import { toNumber } from './numbers.js';
import {
  stripWhatsAppFormatting,
  stripGreetingPrefix,
  normalizeLeadingNumberWord,
  normalizeTypos,
} from './text-normalize.js';
import {
  isValidPiece,
  tryMatchPieceLine,
  buildPieceFromMatch,
  tryMatchDimensionFirstLine,
  tryMatchPcAsteriskLine,
  buildPieceFromDimensionFirstMatch,
} from './piece-matcher.js';
import { extractTrailingFitaCodes, applyFitaCodesToPiece } from './fita-codes.js';
import { finalizePiece, markFitaUnknownIfNeeded } from './finalize.js';
import type { NextIdFn, ParseContext, Piece } from './types.js';

/**
 * Tenta reinterpretar uma única linha (já editada pelo usuário na lista de
 * conferência) usando o contexto que estava em vigor quando ela foi
 * descartada. Diferente de analyzeText, resolve tudo imediatamente — não
 * há "pendências" para uma única linha isolada.
 *
 * @returns a peça pronta, ou null se ainda não for possível interpretar
 */
export function quickParseLine(line: string, ctx: ParseContext, nextId: NextIdFn): Piece | null {
  let cleanedLine = normalizeTypos(stripWhatsAppFormatting(line.trim()));
  if (!cleanedLine) return null;

  // Ver comentário equivalente em analyze.ts: saudação solta e quantidade
  // por extenso ("uma", "duas", "cinco"...).
  cleanedLine = normalizeLeadingNumberWord(stripGreetingPrefix(cleanedLine));

  // Ver comentário equivalente em analyze.ts: códigos de fita colados ao
  // final da linha (ex: "... 1M 1m", "... 3L"), só em linhas que começam
  // com a quantidade.
  let fitaCodes: string[] = [];
  if (/^\d/.test(cleanedLine)) {
    const stripped = extractTrailingFitaCodes(cleanedLine);
    if (stripped.codes.length > 0) {
      cleanedLine = stripped.line;
      fitaCodes = stripped.codes;
    }
    // Ver comentário equivalente em analyze.ts sobre o "X" repetido entre
    // quantidade e comprimento no formato "quantidade X compr X larg".
    cleanedLine = cleanedLine.replace(/^(\d+)\s+[xX]\s+/, '$1 ');
  }

  const dimensionFirstMatch = tryMatchDimensionFirstLine(cleanedLine);
  if (dimensionFirstMatch) {
    if (!isValidPiece(dimensionFirstMatch.compr, dimensionFirstMatch.larg, dimensionFirstMatch.qty)) return null;
    const piece = buildPieceFromDimensionFirstMatch(dimensionFirstMatch, ctx);
    piece.id = nextId();
    if (fitaCodes.length > 0) applyFitaCodesToPiece(piece, fitaCodes);
    markFitaUnknownIfNeeded(piece);
    return finalizePiece(piece);
  }

  const pcAsteriskMatch = tryMatchPcAsteriskLine(cleanedLine);
  if (pcAsteriskMatch) {
    if (!isValidPiece(pcAsteriskMatch.compr, pcAsteriskMatch.larg, pcAsteriskMatch.qty)) return null;
    const piece = buildPieceFromDimensionFirstMatch(pcAsteriskMatch, ctx);
    piece.id = nextId();
    if (fitaCodes.length > 0) applyFitaCodesToPiece(piece, fitaCodes);
    markFitaUnknownIfNeeded(piece);
    return finalizePiece(piece);
  }

  const match = tryMatchPieceLine(cleanedLine);
  if (!match) return null;

  const comprimento = toNumber(match.dimensionMatch[1]!);
  const largura = toNumber(match.dimensionMatch[3]!);
  if (!isValidPiece(comprimento, largura, match.qty)) return null;
  if (SUSPICIOUS_ADJACENT_RE.test(match.rawSuffix) || MULTIPLE_PIECES_RE.test(match.rawSuffix)) return null;

  const built = buildPieceFromMatch(match.qty, match.prefix, match.dimensionMatch, match.suffix, ctx);
  built.piece.id = nextId();
  if (fitaCodes.length > 0) applyFitaCodesToPiece(built.piece, fitaCodes);
  markFitaUnknownIfNeeded(built.piece);
  return finalizePiece(built.piece);
}
