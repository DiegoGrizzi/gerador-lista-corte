/**
 * native-table-reconstruct.ts
 * ---------------------------------------------------------------------------
 * Reconstrói a tabela de "Lista de Cortes" de um PDF com texto real (ver
 * native-pdf-words.ts) — formato exportado pelo Cortecloud Central
 * (revenda.cortecloud.com.br), colunas: Função da peça, Qtde, Cliente,
 * Chapa, C, L, Girar, Fita, C1, C2, L1, L2, Usinar.
 *
 * Duas diferenças reais em relação à reconstrução via OCR (ver
 * table-reconstruct.ts), que motivam um módulo separado em vez de
 * reaproveitar aquele:
 *
 *  1. O cabeçalho da 1ª coluna quebra em duas linhas de verdade ("Função
 *     da" / "peça", cada uma numa altura Y diferente) — a exigência de
 *     "cabeçalho é um bloco contíguo numa linha só" da reconstrução via OCR
 *     não vale aqui. Em vez disso, procura cada palavra-chave de cabeçalho
 *     em qualquer lugar ACIMA da primeira linha de dados de verdade, sem
 *     exigir que fiquem todas juntas.
 *
 *  2. Cada linha de peça quebra em várias linhas visuais (nome da peça,
 *     chapa e fita compridos quebram em 2-3 linhas) — a altura de cada
 *     linha de peça VARIA (não dá pra agrupar por uma tolerância vertical
 *     fixa, como faz clusterIntoRows). Em vez disso, usa a própria medida
 *     "C L" (sempre um par de números com exatamente uma casa decimal, ex:
 *     "2200.0 550.0" — não existe mais nenhum outro valor com essa forma
 *     em nenhuma outra coluna) como a "espinha" de cada linha: a primeira
 *     linha visual de cada peça é sempre a que tem esse par. Da espinha de
 *     uma peça até a espinha da PRÓXIMA (sem incluir), todo esse intervalo
 *     vertical pertence à mesma peça — reagrupando as linhas quebradas
 *     automaticamente, sem precisar adivinhar uma altura de linha.
 *
 * A coluna Fita, em vez de um texto livre, marca o lado com fita através
 * de dois círculos empilhados por coluna (C1/C2/L1/L2) — "●"/"○" — onde só
 * o de CIMA carrega informação de verdade (confirmado com dados reais: o
 * de baixo é SEMPRE "○", em toda peça, das 50 testadas) - então "tem ●
 * nessa coluna, nessa peça" (não importa em qual dos dois círculos) já
 * basta para decidir "tem fita nesse lado".
 * ---------------------------------------------------------------------------
 */
import type { OcrWord } from './table-reconstruct.js';

const MEASURE_RE = /^\d+[.,]\d+$/;
/**
 * Ruído do rodapé de página (ex: "https://revenda.cortecloud.com.br/#/",
 * data/hora, "N/total") — sem nenhuma "espinha" própria (não tem duas
 * medidas do lado), esse texto cai sempre logo ABAIXO da última peça da
 * página, então some dentro do intervalo dela (ver o comentário sobre
 * "espinha até a próxima espinha" mais abaixo) e vazava pro nome da função
 * — confirmado com um PDF real (Cortecloud Central).
 */
const PAGE_FOOTER_NOISE_RE = /^https?:|cortecloud\.com/i;
/** Tolerância vertical (em pontos do PDF) pra duas palavras contarem como a mesma linha visual — bem menor que a distância entre linhas de peças diferentes. */
const LINE_TOLERANCE_PX = 4;
/** Espaço horizontal máximo entre os dois números da "espinha" (C e L) pra contar como o mesmo par — evita casar um "C" de uma peça com o "L" de outra por coincidência de altura. */
const MAX_ANCHOR_GAP_PX = 150;

const FUNCAO_LABELS = new Set(['peça', 'peca', 'função', 'funcao']);
const QTDE_LABELS = new Set(['qtde', 'qtd', 'quantidade']);
const CLIENTE_LABELS = new Set(['cliente']);
const CHAPA_LABELS = new Set(['chapa']);
const GIRAR_LABELS = new Set(['girar']);
const FITA_LABELS = new Set(['fita']);
const C1_LABELS = new Set(['c1']);
const C2_LABELS = new Set(['c2']);
const L1_LABELS = new Set(['l1']);
const L2_LABELS = new Set(['l2']);
const USINAR_LABELS = new Set(['usinar']);

function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[.:]/g, '');
}

interface Line {
  top: number;
  words: OcrWord[];
}

/** Agrupa palavras em linhas visuais por proximidade vertical (tolerância bem menor que a reconstrução via OCR — aqui a fonte é texto real, sem o ruído que exige uma margem maior). */
function clusterIntoLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Line[] = [];
  for (const word of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(word.top - last.top) <= LINE_TOLERANCE_PX) {
      last.words.push(word);
      last.words.sort((a, b) => a.left - b.left);
      continue;
    }
    lines.push({ top: word.top, words: [word] });
  }
  return lines;
}

interface AnchorMatch {
  compr: OcrWord;
  larg: OcrWord;
}

/** Acha o par "C L" (dois números com uma casa decimal, lado a lado) numa linha — a "espinha" que identifica o início de uma peça. `null` se a linha não tiver esse par. */
function findAnchorInLine(line: Line): AnchorMatch | null {
  const measures = line.words.filter((w) => MEASURE_RE.test(w.text));
  for (let i = 0; i < measures.length - 1; i++) {
    const a = measures[i]!;
    const b = measures[i + 1]!;
    if (b.left - (a.left + a.width) <= MAX_ANCHOR_GAP_PX) {
      return { compr: a, larg: b };
    }
  }
  return null;
}

function findLabelPosition(words: OcrWord[], labels: Set<string>): OcrWord | null {
  return words.find((w) => labels.has(normalizeWord(w.text))) ?? null;
}

interface ColumnBounds {
  funcaoEnd: number;
  qtdeStart: number;
  qtdeEnd: number;
  chapaStart: number;
  chapaEnd: number;
  fitaStart: number;
  fitaEnd: number;
  c1Start: number;
  c1End: number;
  c2Start: number;
  c2End: number;
  l1Start: number;
  l1End: number;
  l2Start: number;
  l2End: number;
}

/**
 * Localiza os limites de cada coluna a partir das palavras de cabeçalho
 * conhecidas, procurando em QUALQUER lugar acima da primeira "espinha" de
 * dados (não exige que fiquem todas na mesma linha visual — ver comentário
 * no topo do arquivo). `null` se faltar algum cabeçalho essencial.
 */
function findColumnBounds(headerWords: OcrWord[]): ColumnBounds | null {
  const qtde = findLabelPosition(headerWords, QTDE_LABELS);
  const cliente = findLabelPosition(headerWords, CLIENTE_LABELS);
  const chapa = findLabelPosition(headerWords, CHAPA_LABELS);
  const girar = findLabelPosition(headerWords, GIRAR_LABELS);
  const fita = findLabelPosition(headerWords, FITA_LABELS);
  const c1 = findLabelPosition(headerWords, C1_LABELS);
  const c2 = findLabelPosition(headerWords, C2_LABELS);
  const l1 = findLabelPosition(headerWords, L1_LABELS);
  const l2 = findLabelPosition(headerWords, L2_LABELS);
  const usinar = findLabelPosition(headerWords, USINAR_LABELS);

  if (!qtde || !cliente || !chapa || !girar || !fita || !c1 || !c2 || !l1 || !l2) return null;

  return {
    funcaoEnd: qtde.left,
    qtdeStart: qtde.left,
    qtdeEnd: cliente.left,
    chapaStart: chapa.left,
    chapaEnd: girar.left,
    fitaStart: fita.left,
    fitaEnd: c1.left,
    c1Start: c1.left,
    c1End: c2.left,
    c2Start: c2.left,
    c2End: l1.left,
    l1Start: l1.left,
    l1End: l2.left,
    l2Start: l2.left,
    l2End: usinar ? usinar.left : Infinity,
  };
}

function wordsInRange(words: OcrWord[], start: number, end: number): OcrWord[] {
  return words.filter((w) => w.left >= start && w.left < end);
}

function joinText(words: OcrWord[]): string {
  return words
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verdadeiro se houver pelo menos um "●" na faixa — ver comentário no topo sobre os dois círculos empilhados por coluna (só o de cima importa, mas basta achar qualquer um marcado). */
function hasFilledCircle(words: OcrWord[]): boolean {
  return words.some((w) => w.text.includes('●'));
}

export interface NativeTableRow {
  funcao: string;
  qtde: string;
  chapa: string;
  compr: string;
  larg: string;
  fita: string;
  c1: boolean;
  c2: boolean;
  l1: boolean;
  l2: boolean;
}

/**
 * Reconstrói a lista de peças de uma página a partir das palavras
 * posicionadas (ver native-pdf-words.ts). Devolve `null` se a página não
 * tiver o cabeçalho esperado nem nenhuma "espinha" de dados reconhecível
 * (ex: uma página de outro relatório, ou algo inesperado) — mesmo
 * tratamento de "página sem tabela" usado na reconstrução via OCR.
 */
export function reconstructNativeTableRows(rawWords: OcrWord[]): NativeTableRow[] | null {
  const words = rawWords.filter((w) => !PAGE_FOOTER_NOISE_RE.test(w.text));
  if (words.length === 0) return null;

  const lines = clusterIntoLines(words);
  const anchorByLineIndex = new Map<number, AnchorMatch>();
  lines.forEach((line, index) => {
    const anchor = findAnchorInLine(line);
    if (anchor) anchorByLineIndex.set(index, anchor);
  });
  if (anchorByLineIndex.size === 0) return null;

  const spineIndexes = [...anchorByLineIndex.keys()].sort((a, b) => a - b);
  const headerWords = lines.slice(0, spineIndexes[0]!).flatMap((l) => l.words);
  const columns = findColumnBounds(headerWords);
  if (!columns) return null;

  const rows: NativeTableRow[] = [];
  for (let i = 0; i < spineIndexes.length; i++) {
    const startIdx = spineIndexes[i]!;
    const endIdx = i + 1 < spineIndexes.length ? spineIndexes[i + 1]! : lines.length;
    const rowLines = lines.slice(startIdx, endIdx);
    const anchor = anchorByLineIndex.get(startIdx)!;

    // Todas as palavras da peça, MENOS as duas da própria "espinha" (C e L
    // já extraídos à parte) - senão vazariam pro balde de alguma coluna
    // (provavelmente "chapa", por ficarem à esquerda de "Girar").
    const rowWords = rowLines.flatMap((l) => l.words).filter((w) => w !== anchor.compr && w !== anchor.larg);

    const funcaoWords = wordsInRange(rowWords, 0, columns.funcaoEnd).filter((w) => !/^\d+$/.test(w.text));
    const qtdeWords = wordsInRange(rowWords, columns.qtdeStart, columns.qtdeEnd);
    const chapaWords = wordsInRange(rowWords, columns.chapaStart, columns.chapaEnd);
    const fitaWords = wordsInRange(rowWords, columns.fitaStart, columns.fitaEnd);
    const c1Words = wordsInRange(rowWords, columns.c1Start, columns.c1End);
    const c2Words = wordsInRange(rowWords, columns.c2Start, columns.c2End);
    const l1Words = wordsInRange(rowWords, columns.l1Start, columns.l1End);
    const l2Words = wordsInRange(rowWords, columns.l2Start, columns.l2End);

    rows.push({
      funcao: joinText(funcaoWords),
      qtde: joinText(qtdeWords),
      chapa: joinText(chapaWords),
      compr: anchor.compr.text,
      larg: anchor.larg.text,
      fita: joinText(fitaWords),
      c1: hasFilledCircle(c1Words),
      c2: hasFilledCircle(c2Words),
      l1: hasFilledCircle(l1Words),
      l2: hasFilledCircle(l2Words),
    });
  }

  return rows;
}

/**
 * Converte as linhas reconstruídas num bloco de texto separado por
 * tabulação, com cabeçalho, pronto pro parser interpretar (mesmo caminho
 * já usado pela reconstrução via OCR — ver table-columns.ts do lado do
 * cliente, que já entende "Fita C1/C2/L1/L2" como colunas desde a lista
 * NAVAL_BR_FITA_CODES). "✓"/"" em vez de "true"/"false" porque é isso que
 * isFitaCellChecked (table-columns.ts) já reconhece como fitado.
 */
export function nativeTableRowsToText(rows: NativeTableRow[]): string {
  // "Comprimento"/"Largura"/"Chapa" (não "C"/"L") de propósito - o parser
  // do lado do cliente (table-columns.ts) só reconhece nomes de coluna
  // completos/abreviados conhecidos; "C"/"L" sozinhos seriam genéricos
  // demais pra virar alias ali (risco de bater com coisa não relacionada
  // em outras tabelas). "Chapa" já é reconhecido como material.
  const header = ['Peça', 'Qtde', 'Chapa', 'Comprimento', 'Largura', 'Fita', 'C1', 'C2', 'L1', 'L2'].join('\t');
  const lines = rows.map((row) =>
    [
      row.funcao,
      row.qtde,
      row.chapa,
      row.compr,
      row.larg,
      row.fita,
      row.c1 ? '✓' : '',
      row.c2 ? '✓' : '',
      row.l1 ? '✓' : '',
      row.l2 ? '✓' : '',
    ].join('\t'),
  );
  return [header, ...lines].join('\n');
}
