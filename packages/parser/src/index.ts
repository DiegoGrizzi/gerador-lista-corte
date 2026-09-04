/**
 * index.ts
 * ---------------------------------------------------------------------------
 * API pública de @corte-cloud/parser — equivalente ao `window.CutListParser`
 * exposto pelo parser.js legado.
 * ---------------------------------------------------------------------------
 */

export { toNumber } from './numbers.js';
export { analyzeText } from './analyze.js';
export { quickParseLine } from './quick-parse.js';
export { convertPieceToMm, looksLikeNoMaterial } from './finalize.js';
export { resolveThreeLadosFita } from './fita-codes.js';
export { resolveFitaFromType } from './fitamento.js';

export type {
  Piece,
  RawPiece,
  ParseContext,
  DiscardedItem,
  AnalyzeResult,
  FitaState,
  FitamentoType,
  NextIdFn,
  HeaderInfo,
} from './types.js';
