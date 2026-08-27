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
  const thicknessMatch = withoutParens.match(THICKNESS_SUFFIX_RE) || withoutParens.match(BARE_MM_RE);
  const thickness = thicknessMatch ? toNumber(thicknessMatch[1]!) : null;
  const material = withoutParens
    .replace(/fitad[oa]\w*.*$/i, '') // remove a frase de fitamento e tudo depois dela
    .replace(THICKNESS_SUFFIX_RE, '') // remove "de Nmm"
    .replace(BARE_MM_RE, '') // remove "Nmm" colado, sem "de" (ex: "15mm" solto)
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { material, fitamento, thickness };
}
