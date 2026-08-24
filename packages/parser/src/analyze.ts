/**
 * analyze.ts
 * ---------------------------------------------------------------------------
 * Análise da mensagem completa, linha por linha, com contexto corrente e
 * backfill retroativo de material/fita/espessura pendentes. Ver equivalente
 * (analyzeText) no parser.js legado — a máquina de estados (closures +
 * arrays de pendências) foi portada tal como está, apenas tipada.
 * ---------------------------------------------------------------------------
 */

import {
  QUANTITY_RE,
  THICKNESS_ONLY_RE,
  DISCARD_LABELS,
  SEPARATOR_LINE_RE,
  LOOKS_LIKE_PIECE_RE,
  SUSPICIOUS_ADJACENT_RE,
  MULTIPLE_PIECES_RE,
} from './regex-patterns.js';
import { toNumber } from './numbers.js';
import { stripWhatsAppFormatting, normalizeTypos, expandPcSeparatedPieces } from './text-normalize.js';
import { parseFitamentoPhrase } from './fitamento.js';
import { classifyHeaderLine, extractHeaderInfo } from './header.js';
import {
  isValidPiece,
  tryMatchPieceLine,
  buildPieceFromMatch,
  splitIntoPieceSegments,
  tryMatchDimensionFirstLine,
  tryMatchPcAsteriskLine,
  buildPieceFromDimensionFirstMatch,
} from './piece-matcher.js';
import type { PieceMatch, DimensionFirstMatch } from './piece-matcher.js';
import { finalizePiece } from './finalize.js';
import type { AnalyzeResult, DiscardedItem, FitamentoType, NextIdFn, ParseContext, Piece, RawPiece } from './types.js';

/**
 * Uma entrada de pendência é ou o contexto capturado de um item de
 * conferência (ParseContext), ou a própria peça (RawPiece) — ambos têm os
 * campos material/fitaType/thicknessMm mutados quando a informação
 * correspondente é declarada mais abaixo na mensagem.
 */
type PendingEntry = ParseContext | RawPiece;

/**
 * Interpreta a mensagem colada pelo usuário, linha por linha, mantendo o
 * "contexto corrente" (material, complemento, função, fita e espessura em
 * vigor) e aplicando retroativamente a peças já lidas quando alguma dessas
 * informações só aparece mais abaixo no texto (comum quando o material
 * vem no fim da lista de peças).
 */
export function analyzeText(text: string, nextId: NextIdFn): AnalyzeResult {
  const pieces: RawPiece[] = [];
  const discarded: DiscardedItem[] = [];

  let currentMaterial = '';
  let currentFitamentoType: FitamentoType | null = null;
  let currentThickness: number | null = null;
  let currentComplemento = '';
  let currentFuncao = '';
  let materialMentioned = false;

  // Peças/itens de conferência que ainda esperam por material, fita ou
  // espessura declarados mais abaixo na mensagem.
  let pendingMaterial: PendingEntry[] = [];
  let pendingFitamento: PendingEntry[] = [];
  let pendingThickness: PendingEntry[] = [];

  function snapshotContext(): ParseContext {
    return {
      material: currentMaterial,
      complemento: currentComplemento,
      funcao: currentFuncao,
      fitaType: currentFitamentoType,
      thicknessMm: currentThickness,
    };
  }

  /** Registra uma linha na lista de conferência, junto com o contexto do momento. */
  function pushDiscarded(text: string, suggested?: string | null): void {
    const ctx = snapshotContext();
    discarded.push({ text, suggested: suggested || null, context: ctx });
    // O contexto capturado é o mesmo objeto usado pela peça, então, se
    // for atualizado depois (ver setNewMaterial), o item na conferência
    // também recebe o valor correto ao ser resgatado.
    if (!currentMaterial) pendingMaterial.push(ctx);
    if (currentFitamentoType == null) pendingFitamento.push(ctx);
    if (currentThickness == null) pendingThickness.push(ctx);
  }

  /** Atualiza o contexto corrente ao encontrar um novo cabeçalho de material,
   * propagando o valor retroativamente para tudo que estava pendente. */
  function setNewMaterial(materialText: string, fitType: FitamentoType | null, thicknessVal: number | null): void {
    pendingMaterial.forEach((entry) => {
      entry.material = materialText;
    });
    pendingMaterial = [];
    pendingFitamento.forEach((entry) => {
      entry.fitaType = entry.fitaType || 'none-explicit';
    });
    pendingFitamento = [];
    pendingThickness = [];
    currentMaterial = materialText;
    currentFitamentoType = fitType;
    currentThickness = thicknessVal;
    materialMentioned = true;
  }

  /** Constrói e registra uma peça a partir de um resultado de tryMatchPieceLine já validado. */
  function addSinglePiece(match: PieceMatch, ctx: ParseContext): void {
    const built = buildPieceFromMatch(match.qty, match.prefix, match.dimensionMatch, match.suffix, ctx);
    built.piece.id = nextId();
    pieces.push(built.piece);

    if (built.newMaterialInfo) {
      setNewMaterial(built.newMaterialInfo.material, built.newMaterialInfo.fitamento, built.newMaterialInfo.thickness);
    }
    if (!currentMaterial) pendingMaterial.push(built.piece);
    if (built.fitaPending) pendingFitamento.push(built.piece);
    if (built.thicknessPending) pendingThickness.push(built.piece);
  }

  /**
   * Constrói e registra uma peça a partir de um resultado já validado de
   * tryMatchDimensionFirstLine OU tryMatchPcAsteriskLine — os dois formatos
   * têm o mesmo formato de resultado (qty/compr/larg, sem fita/espessura/
   * material inline), então compartilham esta mesma função.
   */
  function addDimensionFirstPiece(match: DimensionFirstMatch, ctx: ParseContext): void {
    const piece = buildPieceFromDimensionFirstMatch(match, ctx);
    piece.id = nextId();
    pieces.push(piece);

    if (!currentMaterial) pendingMaterial.push(piece);
    if (piece.fitaType == null) pendingFitamento.push(piece);
    if (piece.thicknessMm == null) pendingThickness.push(piece);
  }

  /**
   * Trata uma linha com mais de uma peça (ex: "2=47/47, 3=50/60"): separa
   * em segmentos e só aceita se TODOS os segmentos resultarem em peças
   * válidas — caso contrário, mantém a linha inteira na conferência, para
   * evitar registrar parte da linha errada ou perder informação calada.
   */
  function addPiecesFromMultiSegmentLine(line: string): void {
    const segments = splitIntoPieceSegments(line);
    const segmentMatches = segments.map(tryMatchPieceLine);

    const allValid =
      segments.length > 1 &&
      segmentMatches.every((segMatch) => {
        if (!segMatch) return false;
        const segComprimento = toNumber(segMatch.dimensionMatch[1]!);
        const segLargura = toNumber(segMatch.dimensionMatch[3]!);
        return isValidPiece(segComprimento, segLargura, segMatch.qty) && !SUSPICIOUS_ADJACENT_RE.test(segMatch.rawSuffix);
      });

    if (!allValid) {
      pushDiscarded(line);
      return;
    }

    const ctx = snapshotContext();
    segmentMatches.forEach((segMatch) => {
      addSinglePiece(segMatch as PieceMatch, ctx);
    });
  }

  // Expande uma lista "1pc96*65. 1pc192*65. ..." (tudo numa única linha,
  // separada por ponto) em uma linha por peça, antes de mais nada — o resto
  // da função processa cada peça normalmente a partir daqui.
  const expandedText = expandPcSeparatedPieces(text);

  expandedText.split('\n').forEach((rawLine) => {
    let line = stripWhatsAppFormatting(rawLine.trim());
    if (!line) return;

    // Formato "comprimento x largura: quantidade" (ver DIMENSION_FIRST_RE) e
    // "quantidade+pc+comprimento*largura" (ver PC_ASTERISK_RE) — checados
    // antes do formato principal porque são linhas inteiras ancoradas
    // (^...$) que nunca deveriam ser reinterpretadas pelas regras abaixo.
    // Em particular, QUANTITY_RE trataria o "pc" de "1pc96*65" como um
    // marcador de quantidade válido (está na mesma lista de "pç"/"pc"
    // usada no formato principal) e cortaria a linha no lugar errado.
    const dimensionFirstMatch = tryMatchDimensionFirstLine(line);
    if (dimensionFirstMatch) {
      if (!isValidPiece(dimensionFirstMatch.compr, dimensionFirstMatch.larg, dimensionFirstMatch.qty)) {
        pushDiscarded(line);
        return;
      }
      addDimensionFirstPiece(dimensionFirstMatch, snapshotContext());
      return;
    }

    const pcAsteriskMatch = tryMatchPcAsteriskLine(line);
    if (pcAsteriskMatch) {
      if (!isValidPiece(pcAsteriskMatch.compr, pcAsteriskMatch.larg, pcAsteriskMatch.qty)) {
        pushDiscarded(line);
        return;
      }
      addDimensionFirstPiece(pcAsteriskMatch, snapshotContext());
      return;
    }

    const quantityMatch = line.match(QUANTITY_RE);
    if (quantityMatch) {
      const match = tryMatchPieceLine(line);
      if (match) {
        if (MULTIPLE_PIECES_RE.test(match.rawSuffix)) {
          addPiecesFromMultiSegmentLine(line);
          return;
        }

        const comprimento = toNumber(match.dimensionMatch[1]!);
        const largura = toNumber(match.dimensionMatch[3]!);
        const looksLikeTypo = SUSPICIOUS_ADJACENT_RE.test(match.rawSuffix);

        if (!isValidPiece(comprimento, largura, match.qty) || looksLikeTypo) {
          // Provável erro de digitação: sugere a versão corrigida (se
          // ela resultar numa peça válida) para o usuário só confirmar.
          const normalizedLine = normalizeTypos(line);
          let suggestion: string | null = null;
          if (normalizedLine !== line) {
            const normalizedMatch = tryMatchPieceLine(normalizedLine);
            if (normalizedMatch) {
              const normComprimento = toNumber(normalizedMatch.dimensionMatch[1]!);
              const normLargura = toNumber(normalizedMatch.dimensionMatch[3]!);
              if (isValidPiece(normComprimento, normLargura, normalizedMatch.qty)) {
                suggestion = normalizedLine;
              }
            }
          }
          pushDiscarded(line, suggestion);
          return;
        }

        addSinglePiece(match, snapshotContext());
        return;
      }
      // Tinha formato de quantidade, mas não achou medidas depois dela —
      // segue analisando o restante da linha como possível cabeçalho.
      line = quantityMatch[3]!;
    }

    const thicknessMatch = line.match(THICKNESS_ONLY_RE);
    if (thicknessMatch) {
      currentThickness = toNumber(thicknessMatch[1]!);
      pendingThickness.forEach((entry) => {
        if (entry.thicknessMm == null) entry.thicknessMm = currentThickness;
      });
      pendingThickness = [];
      return;
    }

    const fitamentoType = parseFitamentoPhrase(line);
    if (fitamentoType && !/mdf/i.test(line)) {
      currentFitamentoType = fitamentoType;
      pendingFitamento.forEach((entry) => {
        if (entry.fitaType == null) entry.fitaType = currentFitamentoType;
      });
      pendingFitamento = [];
      return;
    }

    if (/mdf/i.test(line)) {
      const headerInfo = extractHeaderInfo(line);
      setNewMaterial(headerInfo.material, headerInfo.fitamento, headerInfo.thickness);
      return;
    }

    const normalizedLabel = line.toLowerCase().replace(/[.:]/g, '').trim();
    if (DISCARD_LABELS.indexOf(normalizedLabel) !== -1) {
      pushDiscarded(line);
      return;
    }
    if (SEPARATOR_LINE_RE.test(line)) {
      pushDiscarded(line);
      return;
    }
    if (LOOKS_LIKE_PIECE_RE.test(line)) {
      // Parece uma tentativa de peça que não bateu com o padrão esperado.
      pushDiscarded(line);
      return;
    }

    const headerCategory = classifyHeaderLine(line);
    if (headerCategory === 'complemento') {
      currentComplemento = line;
      currentFuncao = '';
    } else if (headerCategory === 'funcao') {
      currentFuncao = line;
    }
    // headerCategory === 'unknown': linha não reconhecida, ignorada em
    // silêncio (não é peça, não é ambiente/função conhecidos).
  });

  pendingFitamento.forEach((entry) => {
    entry.fitaType = entry.fitaType || 'none-explicit';
  });
  // finalizePiece muta e devolve a mesma referência, já tipada como Piece.
  const finalizedPieces: Piece[] = pieces.map(finalizePiece);

  return { pieces: finalizedPieces, discarded, materialMentioned };
}
