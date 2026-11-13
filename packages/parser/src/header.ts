/**
 * header.ts
 * ---------------------------------------------------------------------------
 * Classificação de linhas de cabeçalho (Complemento vs Função) e leitura de
 * cabeçalhos de material ("MDF ..."). Ver equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import { ENVIRONMENT_OR_FURNITURE_KEYWORDS, PIECE_ROLE_KEYWORDS } from './keywords.js';
import { THICKNESS_SUFFIX_RE } from './regex-patterns.js';
import { toNumber } from './numbers.js';
import { parseFitamentoPhrase } from './fitamento.js';
import type { HeaderInfo } from './types.js';

/**
 * Decide se uma linha de texto (que não é peça, material nem fita) se
 * refere a um ambiente/móvel (Complemento) ou ao papel da peça (Função),
 * usando as listas de palavras-chave. Retorna 'unknown' se não reconhecer
 * nenhuma palavra — nesse caso a linha é simplesmente ignorada, sem
 * arriscar um palpite.
 */
export function classifyHeaderLine(line: string): 'complemento' | 'funcao' | 'unknown' {
  const lower = line.toLowerCase();
  for (let i = 0; i < ENVIRONMENT_OR_FURNITURE_KEYWORDS.length; i++) {
    if (lower.indexOf(ENVIRONMENT_OR_FURNITURE_KEYWORDS[i]!) !== -1) return 'complemento';
  }
  for (let j = 0; j < PIECE_ROLE_KEYWORDS.length; j++) {
    if (lower.indexOf(PIECE_ROLE_KEYWORDS[j]!) !== -1) return 'funcao';
  }
  return 'unknown';
}

/**
 * Espessura escrita colada, sem o "de" na frente (ex: "MDF branco 15mm
 * comum") — fallback usado por extractHeaderInfo só quando
 * THICKNESS_SUFFIX_RE (que exige "de") não bate com nada na linha.
 */
const BARE_MM_RE = /(\d+(?:[.,]\d+)?)\s*mm\b/i;

/** "de" abreviado para "d" e sem unidade (ex: "MDF branco d 15") — último recurso de extractHeaderInfo. */
const SHORT_D_THICKNESS_RE = /\bd\s+(\d+(?:[.,]\d+)?)\b/i;

/**
 * Extrai de uma linha de material (contém "MDF"): o nome do material sem
 * a espessura/fitamento embutidos, o tipo de fitamento padrão do bloco
 * (se mencionado) e a espessura em mm (se mencionada).
 * Ex: "MDF (titânio de 15mm fitado um lado maior)"
 *     → { material: "MDF titânio", fitamento: "maior-um", thickness: 15 }
 */
export function extractHeaderInfo(rawLine: string): HeaderInfo {
  const withoutParens = rawLine.replace(/[()]/g, ' ').trim();
  const fitamento = parseFitamentoPhrase(withoutParens);
  const thicknessMatch =
    withoutParens.match(THICKNESS_SUFFIX_RE) || withoutParens.match(BARE_MM_RE) || withoutParens.match(SHORT_D_THICKNESS_RE);
  const thickness = thicknessMatch ? toNumber(thicknessMatch[1]!) : null;
  const material = withoutParens
    .replace(/(?:fitad[oa]|revestiment)\w*.*$/i, '') // remove a frase de fitamento ("revestimento" é o mesmo) e tudo depois dela
    .replace(THICKNESS_SUFFIX_RE, '') // remove "de Nmm"
    .replace(BARE_MM_RE, '') // remove "Nmm" colado, sem "de" (ex: "15mm" solto)
    .replace(SHORT_D_THICKNESS_RE, '') // remove "d N" (ex: "d 15")
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;]+$/, '')
    .trim();
  return { material, fitamento, thickness };
}

/** Espessura numa declaração falada: "de 15 mm", "de 6mm", "de 15" ou "15mm" solto. */
const ABOVE_THICKNESS_RE = /(?:\bde\s+(\d+(?:[.,]\d+)?)(?:\s*(?:mm|ml|m)\b)?|\b(\d+(?:[.,]\d+)?)\s*(?:mm|ml)\b)/i;

/** Palavras que abrem um comentário solto depois do material ("... o MDF mais em conta"). */
const COMMENTARY_START_WORDS = new Set(['o', 'a', 'os', 'as', 'que', 'é', 'e', 'mais', 'pois', 'porque', 'por', 'para', 'ok', 'blz']);

/** Corta o texto na primeira palavra de comentário (depois da primeira palavra, que é o material). */
function cutAtCommentary(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const stop = words.findIndex((word, index) => index > 0 && COMMENTARY_START_WORDS.has(word.toLowerCase().replace(/[.,;:]+$/, '')));
  return (stop < 0 ? words : words.slice(0, stop)).join(' ').replace(/[\s,;.:]+$/, '');
}

/**
 * Material e espessura de uma declaração sobre as peças já listadas ("Essas
 * peças acima MDF branco de 15 mm o MDF mais em conta" → o que sobra depois
 * de "acima": "MDF branco de 15 mm o MDF mais em conta"). O comentário solto
 * no fim não entra no nome; uma cor logo depois da espessura ("MDF de 15mm
 * titânio trama") entra. Devolve null quando o texto não parece um material:
 * sem "mdf" e sem espessura (ex: "estão em cm").
 */
export function extractAboveDeclaration(rest: string): { material: string; thickness: number | null } | null {
  const thicknessMatch = rest.match(ABOVE_THICKNESS_RE);
  const thickness = thicknessMatch ? toNumber((thicknessMatch[1] || thicknessMatch[2])!) : null;
  const before = thicknessMatch ? rest.slice(0, thicknessMatch.index) : rest;
  const after = thicknessMatch ? rest.slice(thicknessMatch.index! + thicknessMatch[0].length) : '';
  let material = cutAtCommentary(before);
  const afterWords = after.trim().split(/\s+/).filter(Boolean);
  const startsWithCommentary = afterWords.length > 0 && COMMENTARY_START_WORDS.has(afterWords[0]!.toLowerCase());
  if (!startsWithCommentary && afterWords.length > 0 && afterWords.length <= 3 && /^[a-zà-öø-ÿ\s]+$/i.test(after.trim())) {
    material = (material + ' ' + after.trim()).trim();
  }
  if (!material) return null;
  if (thickness == null && !/mdf/i.test(rest)) return null;
  return { material, thickness };
}
