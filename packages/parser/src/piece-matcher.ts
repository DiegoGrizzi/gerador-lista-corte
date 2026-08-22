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
  THICKNESS_SUFFIX_RE,
  PIECE_SEPARATOR_RE,
} from './regex-patterns.js';
import { toNumber } from './numbers.js';
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
}

/**
 * Tenta reconhecer o formato "comprimento x largura: quantidade" (ver
 * DIMENSION_FIRST_RE) — usado por listas exportadas de outros programas de
 * otimização de corte, na ordem oposta ao formato principal do sistema.
 * Devolve null se a linha não bater com esse formato específico.
 */
export function tryMatchDimensionFirstLine(line: string): DimensionFirstMatch | null {
  const match = DIMENSION_FIRST_RE.exec(line);
  if (!match) return null;

  return {
    qty: match[3] ? parseInt(match[3], 10) : 1,
    compr: toNumber(match[1]!),
    larg: toNumber(match[2]!),
  };
}

/**
 * Monta a peça a partir de um resultado de tryMatchDimensionFirstLine.
 * Diferente de buildPieceFromMatch, não há prefixo/sufixo de linha pra
 * extrair função/fita/espessura/material — esse formato só carrega
 * dimensão e quantidade, então tudo o mais vem do contexto corrente.
 */
export function buildPieceFromDimensionFirstMatch(match: DimensionFirstMatch, ctx: ParseContext): RawPiece {
  return {
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
}

/** Resultado de buildPieceFromMatch. */
export interface BuildPieceResult {
  piece: RawPiece;
  newMaterialInfo: HeaderInfo | null;
  fitaPending: boolean;
  thicknessPending: boolean;
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
  const inlineThickness = dimensionMatch[5] != null ? toNumber(dimensionMatch[5]) : null;

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
    const funcaoFromPrefix = stripFillers(prefix);
    if (funcaoFromPrefix) funcao = funcaoFromPrefix;
  }

  // Espessura mencionada no restante da linha (ex: "... de 6mm").
  const thicknessInSuffix = suffix.match(THICKNESS_SUFFIX_RE);
  if (thicknessInSuffix) {
    thickness = toNumber(thicknessInSuffix[1]!);
    suffix = suffix.replace(thicknessInSuffix[0], '').trim();
  }
  const pieceThickness = inlineThickness != null ? inlineThickness : thickness;

  // Se havia "fita" colada ao 2º número, reconstrói a frase para checar se
  // na verdade era o início de algo maior, como "fita os 4 lados".
  const tailPhrase = (fitaNaLargura ? 'fita ' : '') + suffix;
  const tailPhraseType = tailPhrase.trim() ? parseFitamentoPhrase(tailPhrase) : null;

  let fitaType = null as RawPiece['fitaType'];
  let customFita = null as RawPiece['customFita'];
  if (tailPhraseType) {
    fitaType = tailPhraseType;
  } else if (fitaNoComprimento || fitaNaLargura) {
    customFita = { c1: fitaNoComprimento, c2: false, l1: fitaNaLargura, l2: false };
  } else {
    fitaType = fitamentoType;
    if (!funcao) {
      const funcaoFromSuffix = stripFillers(suffix);
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
    note: isOverride ? (suffix || tailPhrase).trim() : '',
  };

  return {
    piece,
    newMaterialInfo,
    fitaPending: fitaType == null && !customFita,
    thicknessPending: pieceThickness == null,
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
