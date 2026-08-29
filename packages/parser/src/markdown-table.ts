/**
 * markdown-table.ts
 * ---------------------------------------------------------------------------
 * Reconhecimento de uma tabela em formato Markdown colada na mensagem (ex:
 * copiada de um documento ou planilha), com colunas de Quantidade,
 * Comprimento e Largura (a ordem das colunas pode variar), e duas colunas
 * opcionais: nome da peça (vira a Função) e fita explícita por lado
 * (Fita C1/C2/L1/L2, marcada com "✓" ou "-"):
 *
 *   | Quant. | Comprimento | Largura | Peça               | Fita C1 | Fita C2 | Fita L1 | Fita L2 |
 *   | -----: | ----------: | ------: | ------------------ | :-----: | :-----: | :-----: | :-----: |
 *   |      4 |        1700 |     100 | Pilares verticais  |    ✓    |    -    |    ✓    |    -    |
 *
 * Precisa de tratamento de bloco (não dá pra reconhecer uma linha de dados
 * sozinha, sem saber antes qual coluna é qual) — por isso analyzeText
 * guarda o mapeamento de colunas lido do cabeçalho como estado entre
 * linhas, do mesmo jeito que já faz para material/fita/espessura
 * pendentes.
 * ---------------------------------------------------------------------------
 */
import { toNumber } from './numbers.js';
import type { FitaState } from './types.js';

const QTY_HEADER_ALIASES = ['quantidade', 'qtd', 'qtde', 'quant'];
const COMPR_HEADER_ALIASES = ['comprimento', 'compr', 'comp'];
const LARG_HEADER_ALIASES = ['largura', 'larg'];
const FUNCAO_HEADER_ALIASES = ['peça', 'peca', 'peças', 'pecas', 'item', 'nome', 'descrição', 'descricao'];
const FITA_C1_HEADER_ALIASES = ['fita c1', 'c1'];
const FITA_C2_HEADER_ALIASES = ['fita c2', 'c2'];
const FITA_L1_HEADER_ALIASES = ['fita l1', 'l1'];
const FITA_L2_HEADER_ALIASES = ['fita l2', 'l2'];

/** Índice (na linha, já dividida por "|") de cada coluna reconhecida no cabeçalho. */
export interface MarkdownTableColumns {
  qtyIdx: number;
  comprIdx: number;
  largIdx: number;
  /** Coluna com o nome/descrição da peça (ex: "Pilares verticais") — vira a Função. `null` se a tabela não tiver essa coluna. */
  funcaoIdx: number | null;
  /** Colunas de fita explícita por lado (✓/-) — `null` cada uma se a tabela não tiver essa coluna específica. */
  c1Idx: number | null;
  c2Idx: number | null;
  l1Idx: number | null;
  l2Idx: number | null;
}

/** Uma linha de dados já interpretada, pronta para virar peça via buildPieceFromDimensionFirstMatch. */
export interface MarkdownTableRow {
  qty: number;
  compr: number;
  larg: number;
  funcao: string | null;
  /** Só vem preenchido quando a tabela tem pelo menos uma coluna de fita (Fita C1/C2/L1/L2) — nesse caso, representa o estado explícito e completo dessa linha (coluna ausente = lado não fitado). */
  customFita: FitaState | null;
}

/**
 * Divide uma linha de tabela Markdown em células — só conta como tal se
 * começar E terminar com "|" (senão poderia ser qualquer texto contendo
 * "|" à toa, ex: uma frase com "e/ou").
 */
function splitTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/** Verdadeiro para a linha separadora do cabeçalho Markdown (ex: "| ---------: | ------: |"). */
export function isMarkdownTableSeparatorLine(line: string): boolean {
  const cells = splitTableCells(line);
  if (!cells || cells.length === 0) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Verdadeiro quando a célula marca o lado como fitado — aceita o "✓"
 * (padrão), "x"/"X" e "sim". Qualquer outra coisa (ex: "-", vazio, "não")
 * conta como não fitado.
 */
function isFitaCellChecked(cell: string): boolean {
  const normalized = cell.trim().toLowerCase();
  return normalized === '✓' || normalized === 'x' || normalized === 'sim';
}

/**
 * Tenta ler a linha de cabeçalho de uma tabela Markdown, devolvendo o
 * índice de cada coluna reconhecida. Devolve null se a linha não tiver o
 * formato de tabela, ou não tiver as três colunas obrigatórias
 * (Quantidade, Comprimento, Largura).
 */
export function parseMarkdownTableHeader(line: string): MarkdownTableColumns | null {
  const cells = splitTableCells(line);
  if (!cells || cells.length < 3) return null;

  // Remove anotação de unidade entre parênteses (ex: "Comprimento (mm)" ->
  // "comprimento") e pontuação solta (ex: "Quant." -> "quant") antes de
  // comparar com os nomes conhecidos de coluna.
  const normalized = cells.map((cell) =>
    cell
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[.]/g, '')
      .trim(),
  );
  const qtyIdx = normalized.findIndex((cell) => QTY_HEADER_ALIASES.includes(cell));
  const comprIdx = normalized.findIndex((cell) => COMPR_HEADER_ALIASES.includes(cell));
  const largIdx = normalized.findIndex((cell) => LARG_HEADER_ALIASES.includes(cell));
  if (qtyIdx === -1 || comprIdx === -1 || largIdx === -1) return null;

  const funcaoIdx = normalized.findIndex((cell) => FUNCAO_HEADER_ALIASES.includes(cell));
  const c1Idx = normalized.findIndex((cell) => FITA_C1_HEADER_ALIASES.includes(cell));
  const c2Idx = normalized.findIndex((cell) => FITA_C2_HEADER_ALIASES.includes(cell));
  const l1Idx = normalized.findIndex((cell) => FITA_L1_HEADER_ALIASES.includes(cell));
  const l2Idx = normalized.findIndex((cell) => FITA_L2_HEADER_ALIASES.includes(cell));
  return {
    qtyIdx,
    comprIdx,
    largIdx,
    funcaoIdx: funcaoIdx === -1 ? null : funcaoIdx,
    c1Idx: c1Idx === -1 ? null : c1Idx,
    c2Idx: c2Idx === -1 ? null : c2Idx,
    l1Idx: l1Idx === -1 ? null : l1Idx,
    l2Idx: l2Idx === -1 ? null : l2Idx,
  };
}

/**
 * Tenta ler uma linha de dados da tabela usando o mapeamento de colunas já
 * lido do cabeçalho. Devolve null se a linha não tiver formato de tabela,
 * não tiver células suficientes, ou a quantidade/comprimento/largura não
 * forem números válidos (> 0) — nesse caso a linha cai para o tratamento
 * padrão de "não reconhecida" em analyzeText, indo para a conferência.
 */
export function parseMarkdownTableRow(line: string, columns: MarkdownTableColumns): MarkdownTableRow | null {
  const cells = splitTableCells(line);
  if (!cells) return null;

  const maxIdx = Math.max(columns.qtyIdx, columns.comprIdx, columns.largIdx);
  if (cells.length <= maxIdx) return null;

  const qty = toNumber(cells[columns.qtyIdx]!);
  const compr = toNumber(cells[columns.comprIdx]!);
  const larg = toNumber(cells[columns.largIdx]!);
  if (isNaN(qty) || isNaN(compr) || isNaN(larg)) return null;

  const funcaoCell = columns.funcaoIdx != null ? cells[columns.funcaoIdx] : null;

  const hasFitaColumn = columns.c1Idx != null || columns.c2Idx != null || columns.l1Idx != null || columns.l2Idx != null;
  const customFita: FitaState | null = hasFitaColumn
    ? {
        c1: columns.c1Idx != null ? isFitaCellChecked(cells[columns.c1Idx] ?? '') : false,
        c2: columns.c2Idx != null ? isFitaCellChecked(cells[columns.c2Idx] ?? '') : false,
        l1: columns.l1Idx != null ? isFitaCellChecked(cells[columns.l1Idx] ?? '') : false,
        l2: columns.l2Idx != null ? isFitaCellChecked(cells[columns.l2Idx] ?? '') : false,
      }
    : null;

  return { qty, compr, larg, funcao: funcaoCell || null, customFita };
}
