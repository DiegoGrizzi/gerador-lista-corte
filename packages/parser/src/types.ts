/**
 * types.ts
 * ---------------------------------------------------------------------------
 * Tipos compartilhados do motor de interpretação de medidas. Espelha as
 * formas de objeto usadas pelo parser.js legado (ver `legacy/js/parser.js`),
 * apenas com tipagem explícita — nenhuma regra de negócio vive aqui.
 * ---------------------------------------------------------------------------
 */

/**
 * Os seis tipos de fitamento que `parseFitamentoPhrase` pode devolver (ou
 * `null` quando o texto não menciona fita nenhuma):
 *   'none-explicit' → "não precisa fita" / "sem fita" / "só cortar"
 *   'all'           → "fita tudo" / "fitado os 4 lados"
 *   'maior-um'      → fita em uma borda do lado maior
 *   'maior-dois'    → fita nas duas bordas do lado maior
 *   'menor-um'      → fita em uma borda do lado menor
 *   'menor-dois'    → fita nas duas bordas do lado menor
 */
export type FitamentoType = 'none-explicit' | 'all' | 'maior-um' | 'maior-dois' | 'menor-um' | 'menor-dois';

/** Os quatro booleanos finais de fita: C1/C2 (bordas do comprimento) e L1/L2 (bordas da largura). */
export interface FitaState {
  c1: boolean;
  c2: boolean;
  l1: boolean;
  l2: boolean;
}

/** Função que devolve um novo id único por peça (fornecida por quem chama). */
export type NextIdFn = () => string;

/**
 * Material / complemento / função / fita / espessura em vigor no ponto da
 * mensagem em que uma peça aparece. O mesmo objeto também é usado como
 * "contexto" de um item de conferência (ver DiscardedItem) e pode ser
 * mutado retroativamente por analyzeText quando a informação correspondente
 * só é declarada mais abaixo na mensagem.
 */
export interface ParseContext {
  material: string;
  complemento: string;
  funcao: string;
  fitaType: FitamentoType | null;
  thicknessMm: number | null;
}

/**
 * Resultado de extractHeaderInfo: informação lida de uma linha de material
 * ("MDF ..."), antes de virar o contexto corrente.
 */
export interface HeaderInfo {
  material: string;
  fitamento: FitamentoType | null;
  thickness: number | null;
}

/**
 * Forma de uma peça ANTES de finalizePiece ser chamada: `fitaType` e
 * `customFita` ainda guardam a intenção declarada (tipo de fitamento ou
 * fita explícita colada a um número), e `fita` (os quatro booleanos finais)
 * ainda não foi calculado. `thicknessMm` pode ainda ser `null` se a
 * espessura só for declarada mais abaixo na mensagem (preenchida
 * retroativamente por analyzeText antes de finalizePiece rodar).
 *
 * `id` é preenchido pelo chamador (`nextId()`) imediatamente após a peça
 * ser construída por buildPieceFromMatch — nunca é lido antes disso.
 */
export interface RawPiece {
  id: string;
  material: string;
  complemento: string;
  funcao: string;
  qtd: number;
  compr: number;
  larg: number;
  thicknessMm: number | null;
  fitaType: FitamentoType | null;
  customFita: FitaState | null;
  isOverride: boolean;
  note: string;
}

/**
 * Forma de uma peça DEPOIS de finalizePiece: `fita` contém os quatro
 * booleanos finais (calculados a partir de `customFita` ou `fitaType`), e
 * `material` já inclui a espessura no rótulo (ex: "MDF branco 15mm").
 * `wasInverted` só existe depois de convertPieceToMm, quando a regra do
 * sentido do veio (ver grain-rule.ts) trocou comprimento e largura.
 *
 * `fitaType`, `customFita` e `thicknessMm` continuam presentes no objeto
 * (o parser legado nunca os remove, apenas os mutou nesse ponto) — daí
 * Piece estender RawPiece em vez de substituir seus campos.
 */
export interface Piece extends RawPiece {
  fita: FitaState;
  wasInverted?: boolean;
}

/** Um item que não pôde virar peça e foi para a lista de conferência. */
export interface DiscardedItem {
  text: string;
  suggested: string | null;
  context: ParseContext;
}

/** Resultado de analyzeText: peças reconhecidas, itens de conferência e um sinalizador de material mencionado. */
export interface AnalyzeResult {
  pieces: Piece[];
  discarded: DiscardedItem[];
  materialMentioned: boolean;
}
