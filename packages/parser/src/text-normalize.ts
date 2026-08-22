/**
 * text-normalize.ts
 * ---------------------------------------------------------------------------
 * Pequenas limpezas de texto aplicadas antes de tentar interpretar uma linha
 * (formatação do WhatsApp, erros de digitação comuns, palavras de
 * preenchimento). Ver equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import { UNIT_ONLY_RE } from './regex-patterns.js';

/**
 * Remove marcação de negrito (*texto*), itálico (_texto_) ou tachado
 * (~texto~) do WhatsApp quando envolve a linha inteira — comum quando o
 * usuário destaca um cabeçalho ou uma peça inteira ao copiar a mensagem.
 */
export function stripWhatsAppFormatting(line: string): string {
  return line.replace(/^([*_~])(.+)\1$/, '$2');
}

/**
 * Corrige o erro de digitação mais comum: pontuação decimal repetida por
 * engano (32..2, 0,,30, 10''5) → normaliza para um único separador.
 */
export function normalizeTypos(line: string): string {
  return line.replace(/[.,']{2,}/g, '.');
}

/**
 * Remove palavras de preenchimento ("de", "pro") e pontuação solta de um
 * trecho de texto, para decidir se o que resta é um valor real de Função.
 * Retorna string vazia se não sobrar nada útil.
 */
export function stripFillers(text: string): string {
  const cleaned = text
    .replace(/\b(de|pro)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (UNIT_ONLY_RE.test(cleaned)) return '';
  if (/^[.,;:]*$/.test(cleaned)) return '';
  return cleaned;
}
