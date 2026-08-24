/**
 * fita-codes.ts
 * ---------------------------------------------------------------------------
 * Interpretação dos códigos de fita colados ao final de cada linha de peça
 * em listas do formato "3 X 0,80 X 0,505  1M  1m" — uma convenção diferente
 * da frase livre de fitamento (ver fitamento.ts): aqui cada peça declara a
 * própria fita através de um ou mais códigos de duas letras:
 *
 *   "1M" → fita em 1 lado do par MAIOR (a medida maior entre compr/larg)
 *   "2M" → fita nos 2 lados do par maior
 *   "1m" → fita em 1 lado do par MENOR
 *   "2m" → fita nos 2 lados do par menor
 *   "4L" → fita nos 4 lados (equivale a "2M" + "2m")
 *   "3L" → fita em 3 dos 4 lados, mas AMBÍGUO: pode ser "2 maiores + 1
 *          menor" ou "2 menores + 1 maior" — só o usuário sabe qual, por
 *          isso vira uma pendência (ver pendingThreeLados em types.ts) até
 *          ser resolvida por uma pergunta na interface.
 * ---------------------------------------------------------------------------
 */

import type { FitaState, RawPiece } from './types.js';

/** Um código isolado válido: um dígito de 1 a 4 seguido de M, m ou L (maiúsculas/minúsculas distintas de propósito — M ≠ m). */
const FITA_CODE_TOKEN_RE = /^[1-4][MmL]$/;

/**
 * Remove do FINAL da linha uma sequência de tokens que parecem códigos de
 * fita (separados por espaço), devolvendo a linha sem eles e a lista de
 * códigos encontrados (na ordem em que apareciam). Não encontra nada, não
 * muda a linha — devolve `codes: []`.
 */
export function extractTrailingFitaCodes(line: string): { line: string; codes: string[] } {
  const parts = line.split(/\s+/);
  const codes: string[] = [];
  while (parts.length > 0 && FITA_CODE_TOKEN_RE.test(parts[parts.length - 1]!)) {
    codes.unshift(parts.pop()!);
  }
  return { line: parts.join(' ').trim(), codes };
}

/** Booleans de um par de bordas (ex: c1/c2) a partir de quantos lados desse par estão fitados (0, 1 ou 2). Quando só 1, é sempre o primeiro (mesma convenção de resolveFitaFromType em fitamento.ts). */
function pairFromCount(count: number): [boolean, boolean] {
  return [count >= 1, count >= 2];
}

/**
 * Monta os quatro booleanos finais a partir de "quantos lados do par maior"
 * e "quantos lados do par menor" devem ser fitados — decidindo qual par
 * (C ou L) é o maior comparando comprimento x largura, igual a
 * resolveFitaFromType.
 */
export function computeFitaFromCounts(
  comprimento: number,
  largura: number,
  maiorCount: number,
  menorCount: number,
): FitaState {
  const largMaior = largura > comprimento;
  const [maior1, maior2] = pairFromCount(maiorCount);
  const [menor1, menor2] = pairFromCount(menorCount);
  return largMaior
    ? { l1: maior1, l2: maior2, c1: menor1, c2: menor2 }
    : { c1: maior1, c2: maior2, l1: menor1, l2: menor2 };
}

/** Resultado de computeFitaFromCodes: ou a fita já decidida, ou uma pendência de "3L" aguardando resposta do usuário. */
export interface FitaCodesResult {
  customFita: FitaState | null;
  pendingThreeLados: boolean;
}

/**
 * Interpreta a lista de códigos encontrados numa linha (ver
 * extractTrailingFitaCodes) e devolve a fita resultante — ou sinaliza que a
 * peça precisa de uma resposta do usuário (código "3L", ambíguo).
 */
export function computeFitaFromCodes(codes: string[], comprimento: number, largura: number): FitaCodesResult {
  if (codes.some((code) => code.toUpperCase() === '3L')) {
    return { customFita: null, pendingThreeLados: true };
  }

  let maiorCount = 0;
  let menorCount = 0;
  for (const code of codes) {
    if (code.toUpperCase() === '4L') {
      maiorCount = 2;
      menorCount = 2;
      continue;
    }
    const n = parseInt(code, 10);
    if (code.endsWith('M')) maiorCount = Math.max(maiorCount, n);
    else if (code.endsWith('m')) menorCount = Math.max(menorCount, n);
  }
  return { customFita: computeFitaFromCounts(comprimento, largura, maiorCount, menorCount), pendingThreeLados: false };
}

/**
 * Aplica os códigos encontrados numa linha diretamente à peça já construída
 * (sobrescrevendo qualquer fita inferida do sufixo da linha ou do contexto
 * corrente — os códigos são sempre a declaração mais explícita possível).
 * Quando ambíguo ("3L"), marca `pendingThreeLados` com uma fita provisória
 * "sem nenhum lado", até a pergunta ser respondida na interface.
 */
export function applyFitaCodesToPiece(piece: RawPiece, codes: string[]): void {
  const result = computeFitaFromCodes(codes, piece.compr, piece.larg);
  if (result.pendingThreeLados) {
    piece.pendingThreeLados = true;
    piece.customFita = { c1: false, c2: false, l1: false, l2: false };
  } else {
    piece.customFita = result.customFita;
  }
}

/**
 * Resolve a pendência de "3L" depois que o usuário escolheu, no modal, se
 * são 2 lados maiores + 1 menor, ou 2 lados menores + 1 maior. Chamada com
 * a medida FINAL da peça (já convertida para mm e já com a regra do sentido
 * do veio aplicada) — ver applyGrainOrientationRule, que já remapeia C/L
 * corretamente se compr/larg forem invertidos antes desta função rodar.
 */
export function resolveThreeLadosFita(comprimento: number, largura: number, choice: 'maior' | 'menor'): FitaState {
  return choice === 'maior'
    ? computeFitaFromCounts(comprimento, largura, 2, 1)
    : computeFitaFromCounts(comprimento, largura, 1, 2);
}
