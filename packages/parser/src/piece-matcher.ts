/**
 * piece-matcher.ts
 * ---------------------------------------------------------------------------
 * Reconhecimento de uma linha de peça: encontrar quantidade + duas medidas,
 * montar o objeto de peça a partir do contexto corrente, e separar linhas
 * com mais de uma peça. Ver equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import {
  QUANTITY_RE,
  DIMENSIONS_RE,
  DIMENSIONS_NO_SLASH_RE,
  DIMENSION_FIRST_RE,
  DIMENSION_FIRST_PARENS_RE,
  QUANTITY_PARENS_FIRST_RE,
  QUANTITY_DASH_DIMENSIONS_RE,
  DIMENSION_FIRST_EQUALS_RE,
  PC_ASTERISK_RE,
  THICKNESS_SUFFIX_RE,
  PIECE_SEPARATOR_RE,
  FITAMENTO_ADJECTIVE_AT_START_RE,
} from './regex-patterns.js';
import { toNumber, isDecimalDotMeasure } from './numbers.js';
import { stripFillers } from './text-normalize.js';
import { parseFitamentoPhrase, resolveFitaFromType } from './fitamento.js';
import { extractHeaderInfo } from './header.js';
import type { HeaderInfo, ParseContext, RawPiece } from './types.js';

/**
 * Confirma se uma peça tem valores utilizáveis (nenhum zero, vazio ou NaN).
 * Uma peça inválida nunca deve aparecer na tabela — vai para conferência.
 */
export function isValidPiece(comprimento: number, largura: number, quantidade: number): boolean {
  return (
    !isNaN(comprimento) &&
    !isNaN(largura) &&
    !isNaN(quantidade) &&
    comprimento > 0 &&
    largura > 0 &&
    quantidade > 0
  );
}

/**
 * Resultado de tryMatchPieceLine: `rawSuffix` mantém espaços/pontuação
 * originais (necessário para detectar digitação suspeita) e `suffix` é a
 * versão já cortada (trim).
 */
export interface PieceMatch {
  qty: number;
  prefix: string;
  dimensionMatch: RegExpExecArray;
  suffix: string;
  rawSuffix: string;
}

/**
 * Tenta encontrar um padrão de peça (quantidade + duas medidas) dentro de
 * uma linha de texto. Cobre dois casos:
 *   1. Quantidade explícita seguida de medidas em qualquer lugar do resto
 *      da linha (ex: "6 = MDF branco 30x273", "2 pç 70 fita x59").
 *   2. Sem quantidade nenhuma na frente — assume-se 1 peça, desde que as
 *      medidas comecem já no início da linha (ex: "160 x 90 6mm").
 *
 * Devolve null se a linha não parecer uma peça.
 */
export function tryMatchPieceLine(line: string): PieceMatch | null {
  const quantityMatch = line.match(QUANTITY_RE);
  if (!quantityMatch) return null;

  const qty = parseInt(quantityMatch[1]!, 10);
  const explicitMarker = quantityMatch[2];
  const rest = quantityMatch[3]!;

  const dimensionMatch = DIMENSIONS_RE.exec(rest);
  if (dimensionMatch) {
    const rawSuffix = rest.substring(dimensionMatch.index + dimensionMatch[0].length);
    return {
      qty,
      prefix: rest.substring(0, dimensionMatch.index).trim(),
      dimensionMatch,
      suffix: rawSuffix.trim(),
      rawSuffix,
    };
  }

  // Sem separador explícito de quantidade (=, -, pç...): tenta a linha
  // inteira como uma única peça de quantidade implícita 1.
  if (!explicitMarker) {
    const fullLineMatch = DIMENSIONS_NO_SLASH_RE.exec(line);
    if (fullLineMatch && fullLineMatch.index === 0) {
      const rawSuffixFull = line.substring(fullLineMatch.index + fullLineMatch[0].length);
      return {
        qty: 1,
        prefix: '',
        dimensionMatch: fullLineMatch,
        suffix: rawSuffixFull.trim(),
        rawSuffix: rawSuffixFull,
      };
    }
  }

  return null;
}

/** Resultado de tryMatchDimensionFirstLine: já convertido para número, sem sobrar texto pra interpretar. */
export interface DimensionFirstMatch {
  qty: number;
  compr: number;
  larg: number;
  /** Medidas escritas com ponto decimal de verdade (ver RawPiece.cmDecimals); ausente quando nenhuma. */
  cmDecimals?: { compr: boolean; larg: boolean };
}

/** Marca de ponto decimal por medida, ou undefined quando nenhuma das duas tem. */
function cmDecimalsOf(comprText: string, largText: string): { compr: boolean; larg: boolean } | undefined {
  const compr = isDecimalDotMeasure(comprText);
  const larg = isDecimalDotMeasure(largText);
  return compr || larg ? { compr, larg } : undefined;
}

/**
 * Tenta reconhecer o formato "comprimento x largura: quantidade" (ver
 * DIMENSION_FIRST_RE), "comprimento x largura (quantidade)" (ver
 * DIMENSION_FIRST_PARENS_RE), "(quantidade)comprimentoxlargura" (ver
 * QUANTITY_PARENS_FIRST_RE) ou "N peças — comprimento × largura mm" (ver
 * QUANTITY_DASH_DIMENSIONS_RE) ou "comprimento x largura=quantidade" (ver
 * DIMENSION_FIRST_EQUALS_RE) — formatos de listas exportadas de outros
 * programas, todos fora da ordem do formato principal do sistema. Devolve
 * null se a linha não bater com nenhum deles.
 */
export function tryMatchDimensionFirstLine(line: string): DimensionFirstMatch | null {
  const match = DIMENSION_FIRST_RE.exec(line);
  if (match) {
    return {
      qty: match[3] ? parseInt(match[3], 10) : 1,
      compr: toNumber(match[1]!),
      larg: toNumber(match[2]!),
      cmDecimals: cmDecimalsOf(match[1]!, match[2]!),
    };
  }

  const parensMatch = DIMENSION_FIRST_PARENS_RE.exec(line);
  if (parensMatch) {
    return {
      qty: parseInt(parensMatch[3]!, 10),
      compr: toNumber(parensMatch[1]!),
      larg: toNumber(parensMatch[2]!),
      cmDecimals: cmDecimalsOf(parensMatch[1]!, parensMatch[2]!),
    };
  }

  const qtyParensMatch = QUANTITY_PARENS_FIRST_RE.exec(line);
  if (qtyParensMatch) {
    return {
      qty: parseInt(qtyParensMatch[1]!, 10),
      compr: toNumber(qtyParensMatch[2]!),
      larg: toNumber(qtyParensMatch[3]!),
      cmDecimals: cmDecimalsOf(qtyParensMatch[2]!, qtyParensMatch[3]!),
    };
  }

  const equalsMatch = DIMENSION_FIRST_EQUALS_RE.exec(line);
  if (equalsMatch) {
    return {
      qty: parseInt(equalsMatch[3]!, 10),
      compr: toNumber(equalsMatch[1]!),
      larg: toNumber(equalsMatch[2]!),
      cmDecimals: cmDecimalsOf(equalsMatch[1]!, equalsMatch[2]!),
    };
  }

  const qtyDashMatch = QUANTITY_DASH_DIMENSIONS_RE.exec(line);
  if (qtyDashMatch) {
    return {
      qty: parseInt(qtyDashMatch[1]!, 10),
      compr: toNumber(qtyDashMatch[2]!),
      larg: toNumber(qtyDashMatch[3]!),
      cmDecimals: cmDecimalsOf(qtyDashMatch[2]!, qtyDashMatch[3]!),
    };
  }

  return null;
}

/**
 * Tenta reconhecer o formato "quantidade+pc+comprimento*largura" (ver
 * PC_ASTERISK_RE) — cada peça já deve estar isolada na própria linha
 * (ver expandPcSeparatedPieces em text-normalize.ts, que separa uma lista
 * inteira escrita numa única linha antes desta função rodar). Devolve o
 * mesmo formato de DimensionFirstMatch: assim como aquele formato, esta
 * peça também não carrega fita/espessura/material inline, então reaproveita
 * o mesmo builder (buildPieceFromDimensionFirstMatch).
 */
export function tryMatchPcAsteriskLine(line: string): DimensionFirstMatch | null {
  const match = PC_ASTERISK_RE.exec(line);
  if (!match) return null;

  return {
    qty: parseInt(match[1]!, 10),
    compr: toNumber(match[2]!),
    larg: toNumber(match[3]!),
    cmDecimals: cmDecimalsOf(match[2]!, match[3]!),
  };
}

/**
 * Monta a peça a partir de um resultado de tryMatchDimensionFirstLine (ou
 * tryMatchPcAsteriskLine, que devolve o mesmo formato). Diferente de
 * buildPieceFromMatch, não há prefixo/sufixo de linha pra extrair função/
 * fita/espessura/material — esses formatos só carregam dimensão e
 * quantidade, então tudo o mais vem do contexto corrente.
 */
export function buildPieceFromDimensionFirstMatch(match: DimensionFirstMatch, ctx: ParseContext): RawPiece {
  const piece: RawPiece = {
    id: '',
    material: ctx.material,
    complemento: ctx.complemento,
    funcao: ctx.funcao,
    qtd: match.qty,
    compr: match.compr,
    larg: match.larg,
    thicknessMm: ctx.thicknessMm,
    fitaType: ctx.fitaType,
    customFita: null,
    isOverride: false,
    note: '',
  };
  if (match.cmDecimals) piece.cmDecimals = match.cmDecimals;
  return piece;
}

/** "6mm" solto no meio do texto da linha (ex: "fundo 6mm"). */
const BARE_MM_INLINE_RE = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*mm\b/i;
/** Pontuação sobrando nas pontas de um texto de Função (ex: ". Piso do armário."). */
const EDGE_PUNCTUATION_RE = /^[\s.,;:\-–—]+|[\s.,;:]+$/g;

/** Texto de Função limpo: sem palavras de enchimento ("de", "pro", "c/") nem pontuação nas pontas. */
function cleanFuncaoText(text: string): string {
  return stripFillers(text).replace(EDGE_PUNCTUATION_RE, '').trim();
}

/**
 * Nota de fita entre parênteses no fim do sufixo da linha, mesmo sem o
 * fecha-parênteses ("(Fitado 4 lados)", "(Fitado um lado"). Devolve o resto
 * do sufixo (a descrição da peça, ex: "lateral roupeiro.") separado da nota,
 * ou null se o parêntese final não fala de fita.
 */
function extractParentheticalFitaNote(suffix: string): { rest: string; note: string } | null {
  const match = suffix.match(/\(([^()]*)\)?\s*$/);
  if (!match || match.index == null) return null;
  const note = match[1]!.trim();
  if (!/fita/i.test(note) && parseFitamentoPhrase(note) == null) return null;
  return { rest: suffix.slice(0, match.index).trim(), note };
}

/** Resultado de buildPieceFromMatch. */
export interface BuildPieceResult {
  piece: RawPiece;
  newMaterialInfo: HeaderInfo | null;
  fitaPending: boolean;
  thicknessPending: boolean;
  /** A própria linha trouxe informação de fita (frase, nota entre parênteses ou "fita" colada a uma medida). */
  explicitFita: boolean;
  /** Espessura citada no texto da própria linha ("fundo 6mm"), ou null. */
  inlineThicknessMm: number | null;
}

/**
 * Monta o objeto de peça a partir de um resultado de tryMatchPieceLine e
 * do contexto (material/complemento/função/fita/espessura) em vigor.
 *
 * Função pura: não altera o contexto recebido, apenas lê dele. Quando a
 * própria linha declara um material novo (prefixo com "MDF"), isso é
 * devolvido em `newMaterialInfo` para quem chamou decidir se propaga esse
 * novo contexto para as peças seguintes — isso só faz sentido durante a
 * leitura sequencial da mensagem inteira (analyzeText), não ao reprocessar
 * uma única linha resgatada da conferência.
 */
export function buildPieceFromMatch(
  qty: number,
  prefix: string,
  dimensionMatch: RegExpExecArray,
  suffix: string,
  ctx: ParseContext,
): BuildPieceResult {
  const comprimento = toNumber(dimensionMatch[1]!);
  const largura = toNumber(dimensionMatch[3]!);
  const fitaNoComprimento = !!dimensionMatch[2]; // "fita" colada ao 1º número
  const fitaNaLargura = !!dimensionMatch[4]; // "fita" colada ao 2º número
  let inlineThickness = dimensionMatch[5] != null ? toNumber(dimensionMatch[5]) : null;

  // O "terceiro número" capturado acima não é uma espessura embutida
  // quando o que sobra na linha é uma abreviação de fitamento sem a
  // palavra "lado(s)" (ex: "73x90 1 menor", "168x78 4 lados") — o dígito
  // era o começo dessa frase, não uma medida. Devolve ele para o sufixo
  // antes de seguir, senão ele é lido (errado) como espessura e o resto
  // ("menor"/"lados") vira Função por engano.
  if (inlineThickness != null && FITAMENTO_ADJECTIVE_AT_START_RE.test(suffix)) {
    suffix = dimensionMatch[5]! + ' ' + suffix;
    inlineThickness = null;
  }

  let inlineMentionedThickness: number | null = null;
  let funcao = '';
  let material = ctx.material;
  let fitamentoType = ctx.fitaType;
  let thickness = ctx.thicknessMm;
  let newMaterialInfo: HeaderInfo | null = null;

  if (prefix && /mdf/i.test(prefix)) {
    // A própria linha declara um material novo (ex: "6 = MDF branco 30x273").
    const headerInfo = extractHeaderInfo(prefix);
    material = headerInfo.material;
    fitamentoType = headerInfo.fitamento;
    thickness = headerInfo.thickness;
    newMaterialInfo = headerInfo;
  } else if (prefix) {
    // "fundo 6mm": a espessura citada na linha vale para esta peça e não
    // faz parte do nome dela.
    let prefixText = prefix;
    const mmInPrefix = prefixText.match(BARE_MM_INLINE_RE);
    if (mmInPrefix) {
      thickness = toNumber(mmInPrefix[1]!);
      inlineMentionedThickness = thickness;
      prefixText = prefixText.replace(mmInPrefix[0], ' ');
    }
    const funcaoFromPrefix = cleanFuncaoText(prefixText);
    if (funcaoFromPrefix) funcao = funcaoFromPrefix;
  }

  // Espessura mencionada no restante da linha (ex: "... de 6mm").
  const thicknessInSuffix = suffix.match(THICKNESS_SUFFIX_RE);
  if (thicknessInSuffix) {
    thickness = toNumber(thicknessInSuffix[1]!);
    suffix = suffix.replace(thicknessInSuffix[0], '').trim();
  }
  if (!/fita/i.test(suffix)) {
    const mmInSuffix = suffix.match(BARE_MM_INLINE_RE);
    if (mmInSuffix) {
      thickness = toNumber(mmInSuffix[1]!);
      inlineMentionedThickness = thickness;
      suffix = suffix.replace(mmInSuffix[0], ' ').trim();
    }
  }
  const pieceThickness = inlineThickness != null ? inlineThickness : thickness;

  // "lateral roupeiro. (Fitado 4 lados)": a nota de fita entre parênteses é
  // separada da descrição da peça, que vira a Função (senão a frase de
  // fita "engolia" o sufixo inteiro e a descrição se perdia).
  const parentheticalFita = extractParentheticalFitaNote(suffix);
  const fitaNote = parentheticalFita ? parentheticalFita.note : '';
  if (parentheticalFita) suffix = parentheticalFita.rest;

  // Se havia "fita" colada ao 2º número, reconstrói a frase para checar se
  // na verdade era o início de algo maior, como "fita os 4 lados".
  const tailPhrase = (fitaNaLargura ? 'fita ' : '') + (fitaNote || suffix);
  let tailPhraseType = tailPhrase.trim() ? parseFitamentoPhrase(tailPhrase) : null;
  // "(Fitado um lado" sem dizer maior ou menor: quem escreve assim quase
  // sempre fala do lado maior — melhor do que perguntar de novo sobre uma
  // peça cuja linha já diz que tem fita.
  if (!tailPhraseType && fitaNote && /\b(?:um|1)\s+lado\b/i.test(fitaNote)) tailPhraseType = 'maior-um';

  let fitaType = null as RawPiece['fitaType'];
  let customFita = null as RawPiece['customFita'];
  if (tailPhraseType) {
    fitaType = tailPhraseType;
    if (fitaNote && !funcao) {
      const funcaoFromRest = cleanFuncaoText(suffix);
      if (funcaoFromRest) funcao = funcaoFromRest;
    }
  } else if (fitaNoComprimento || fitaNaLargura) {
    customFita = { c1: fitaNoComprimento, c2: false, l1: fitaNaLargura, l2: false };
  } else {
    fitaType = fitamentoType;
    if (!funcao) {
      const funcaoFromSuffix = cleanFuncaoText(suffix);
      if (funcaoFromSuffix) funcao = funcaoFromSuffix;
    }
  }
  if (!funcao) funcao = ctx.funcao;

  /*
   * Marca como "alterado por observação" quando a própria peça declarou
   * um fitamento explícito (tailPhraseType). Duas situações contam:
   *
   *   1. "não precisa fita" / "sem fita" / "só cortar" (none-explicit) —
   *      sempre digno de destaque, é uma decisão explícita e deliberada,
   *      com ou sem um padrão de bloco pra comparar.
   *   2. Qualquer outro tipo (ex: "fitado os 4 lados") só conta como
   *      override quando existe um padrão de bloco (fitamentoType) E o
   *      resultado da peça é DIFERENTE desse padrão — evita marcar
   *      formatos onde cada peça sempre declara o próprio fitamento
   *      (sem nenhum "MDF (...) fitado ..." por perto), onde isso é o
   *      jeito normal de informar, não uma exceção a nada.
   */
  let isOverride = false;
  if (tailPhraseType === 'none-explicit') {
    isOverride = true;
  } else if (tailPhraseType && fitamentoType != null) {
    const defaultFita = resolveFitaFromType(fitamentoType, comprimento, largura);
    const explicitFita = resolveFitaFromType(tailPhraseType, comprimento, largura);
    isOverride =
      defaultFita.c1 !== explicitFita.c1 ||
      defaultFita.c2 !== explicitFita.c2 ||
      defaultFita.l1 !== explicitFita.l1 ||
      defaultFita.l2 !== explicitFita.l2;
  }

  const piece: RawPiece = {
    // Preenchido por quem cria a peça (precisa de um contador global) —
    // nunca lido antes de ser sobrescrito pelo chamador logo em seguida.
    id: '',
    material,
    complemento: ctx.complemento,
    funcao,
    qtd: qty,
    compr: comprimento,
    larg: largura,
    thicknessMm: pieceThickness,
    fitaType,
    customFita,
    isOverride,
    note: isOverride ? (fitaNote || suffix || tailPhrase).trim() : '',
  };
  const cmDecimals = cmDecimalsOf(dimensionMatch[1]!, dimensionMatch[3]!);
  if (cmDecimals) piece.cmDecimals = cmDecimals;

  return {
    piece,
    newMaterialInfo,
    fitaPending: fitaType == null && !customFita,
    thicknessPending: pieceThickness == null,
    explicitFita: !!tailPhraseType || !!fitaNote || fitaNoComprimento || fitaNaLargura,
    inlineThicknessMm: inlineMentionedThickness,
  };
}

/**
 * Divide uma linha com mais de uma peça separada por vírgula ou
 * ponto-e-vírgula (ex: "2=47/47, 3=50/60") em segmentos individuais,
 * cada um processado depois como uma peça própria.
 */
export function splitIntoPieceSegments(line: string): string[] {
  return line
    .split(PIECE_SEPARATOR_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
}
