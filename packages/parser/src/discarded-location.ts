/**
 * discarded-location.ts
 * ---------------------------------------------------------------------------
 * Descobre em que linha do texto colado cada item da conferência está, para o
 * vendedor achar a linha na lista dele. analyzeText trabalha em cima de uma
 * cópia do texto que já passou por várias limpezas (unidades "mm" tiradas,
 * linhas de quantidade emendadas, "peça + peça" separadas...), então o número
 * da linha dessa cópia não vale para o texto original. Em vez de carregar o
 * número por todas as limpezas, a linha é procurada no texto original pelo
 * conteúdo, do mais exato ao mais frouxo:
 *   1. mesmo texto, ignorando maiúsculas, espaços e pontuação;
 *   2. um contém o outro (linha emendada ou separada pela limpeza);
 *   3. mesma sequência de números (a limpeza só tirou unidade/palavra).
 * Cada linha original só vale para um item (itens repetidos pegam as
 * ocorrências seguintes), e a busca começa depois do último item achado, que é
 * a ordem em que os itens aparecem. Sem achar, o item fica sem linha.
 * ---------------------------------------------------------------------------
 */
import type { DiscardedItem } from './types.js';

const MIN_CONTAINS_LENGTH = 4;

function alnum(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function numberSignature(text: string): string {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).join('|');
}

type Matcher = (original: string, item: string) => boolean;

const MATCHERS: Matcher[] = [
  (original, item) => original === item,
  (original, item) =>
    Math.min(original.length, item.length) >= MIN_CONTAINS_LENGTH &&
    (original.includes(item) || item.includes(original)),
];

export function locateDiscardedLines(originalText: string, discarded: DiscardedItem[]): void {
  if (discarded.length === 0) return;
  const originalLines = originalText.split(/\r?\n/);
  const normalized = originalLines.map(alnum);
  const signatures = originalLines.map(numberSignature);
  const used = new Set<number>();
  let cursor = 0;

  function search(matches: (index: number) => boolean): number {
    for (const range of [
      [cursor, originalLines.length],
      [0, cursor],
    ] as const) {
      for (let i = range[0]; i < range[1]; i++) {
        if (!used.has(i) && matches(i)) return i;
      }
    }
    return -1;
  }

  for (const item of discarded) {
    const itemNormalized = alnum(item.text);
    if (!itemNormalized) continue;

    let found = -1;
    for (const matcher of MATCHERS) {
      found = search((i) => normalized[i] !== '' && matcher(normalized[i]!, itemNormalized));
      if (found !== -1) break;
    }
    if (found === -1) {
      const signature = numberSignature(item.text);
      if (signature.includes('|')) found = search((i) => signatures[i] === signature);
    }
    if (found === -1) continue;

    used.add(found);
    cursor = found + 1;
    item.line = found + 1;
  }
}
