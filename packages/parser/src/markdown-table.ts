/**
 * markdown-table.ts
 * ---------------------------------------------------------------------------
 * Reconhecimento de uma tabela em formato Markdown colada na mensagem (ex:
 * copiada de um documento ou planilha), com colunas de Quantidade,
 * Comprimento e Largura (a ordem das colunas pode variar, e uma coluna
 * opcional de nome da peça vira a Função):
 *
 *   | Quantidade | Comprimento | Largura | Peça               |
 *   | ---------: | ----------: | ------: | ------------------ |
 *   |          4 |        1700 |     100 | Pilares verticais  |
 *
 * Precisa de tratamento de bloco (não dá pra reconhecer uma linha de dados
 * sozinha, sem saber antes qual coluna é qual) — por isso analyzeText
 * guarda o mapeamento de colunas lido do cabeçalho como estado entre
 * linhas, do mesmo jeito que já faz para material/fita/espessura
 * pendentes.
 * ---------------------------------------------------------------------------
 */
import { toNumber } from './numbers.js';

const QTY_HEADER_ALIASES = ['quantidade', 'qtd', 'qtde', 'quant'];
const COMPR_HEADER_ALIASES = ['comprimento', 'compr', 'comp'];
const LARG_HEADER_ALIASES = ['largura', 'larg'];
const FUNCAO_HEADER_ALIASES = ['peça', 'peca', 'peças', 'pecas', 'item', 'nome', 'descrição', 'descricao'];

/** Índice (na linha, já dividida por "|") de cada coluna reconhecida no cabeçalho. */
export interface MarkdownTableColumns {
  qtyIdx: number;
  comprIdx: number;
  largIdx: number;
  /** Coluna com o nome/descrição da peça (ex: "Pilares verticais") — vira a Função. `null` se a tabela não tiver essa coluna. */
  funcaoIdx: number | null;
}

/** Uma linha de dados já interpretada, pronta para virar peça via buildPieceFromDimensionFirstMatch. */
export interface MarkdownTableRow {
  qty: number;
  compr: number;
  larg: number;
  funcao: string | null;
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
 * Tenta ler a linha de cabeçalho de uma tabela Markdown, devolvendo o
 * índice de cada coluna reconhecida. Devolve null se a linha não tiver o
 * formato de tabela, ou não tiver as três colunas obrigatórias
 * (Quantidade, Comprimento, Largura).
 */
export function parseMarkdownTableHeader(line: string): MarkdownTableColumns | null {
  const cells = splitTableCells(line);
  if (!cells || cells.length < 3) return null;

  const normalized = cells.map((cell) => cell.toLowerCase());
  const qtyIdx = normalized.findIndex((cell) => QTY_HEADER_ALIASES.includes(cell));
  const comprIdx = normalized.findIndex((cell) => COMPR_HEADER_ALIASES.includes(cell));
  const largIdx = normalized.findIndex((cell) => LARG_HEADER_ALIASES.includes(cell));
  if (qtyIdx === -1 || comprIdx === -1 || largIdx === -1) return null;

  const funcaoIdx = normalized.findIndex((cell) => FUNCAO_HEADER_ALIASES.includes(cell));
  return { qtyIdx, comprIdx, largIdx, funcaoIdx: funcaoIdx === -1 ? null : funcaoIdx };
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
  return { qty, compr, larg, funcao: funcaoCell || null };
}
