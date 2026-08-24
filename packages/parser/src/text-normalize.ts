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
 * Expande uma lista de peças escrita numa única linha, separada por ponto,
 * no formato "quantidade + pc + comprimento*largura" (ex:
 * "1pc96*65. 1pc192*65. 4pc69.5*65"), transformando cada peça numa linha
 * própria — permite que o resto do analisador processe cada uma
 * normalmente, como se tivesse vindo em linhas separadas desde o início.
 *
 * O ponto só é tratado como separador de peça quando vem seguido (depois
 * de espaço) de um "número+pc" — ou seja, só nos pontos que realmente
 * separam uma peça da próxima. Um ponto decimal dentro de uma medida (ex:
 * "69.5", "1.90") nunca é seguido de espaço + "número+pc", então nunca é
 * confundido com esse separador e permanece intacto na mesma linha.
 */
export function expandPcSeparatedPieces(text: string): string {
  // Sem \b depois de "pc" de propósito: "pc" vem sempre colado direto no
  // número seguinte ("1pc96"), sem espaço — "c" e "9" são os dois
  // caracteres de palavra, então não há fronteira de palavra ali (\b não
  // bateria nunca, e a expansão inteira silenciosamente não faria nada).
  return text.replace(/\.\s+(?=\d+\s*pc)/gi, '\n');
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
