/**
 * markdown-table.ts
 * ---------------------------------------------------------------------------
 * Reconhecimento de uma tabela em formato Markdown colada na mensagem (ex:
 * copiada de um documento), delimitada por "|", com colunas de Quantidade,
 * Comprimento e Largura (a ordem das colunas pode variar), e colunas
 * opcionais de nome da peça (vira a Função) e fita explícita por lado
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
 * pendentes. A leitura das colunas em si é compartilhada com o formato TSV
 * (colado de planilha, ver tsv-table.ts) através de table-columns.ts — a
 * única diferença entre os dois é o delimitador ("|" vs tabulação) e a
 * linha separadora extra que só o Markdown tem.
 * ---------------------------------------------------------------------------
 */
import { matchTableColumns, buildTableRow } from './table-columns.js';
import type { TableColumns, TableRow } from './table-columns.js';

export type { TableColumns as MarkdownTableColumns, TableRow as MarkdownTableRow };

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
export function parseMarkdownTableHeader(line: string): TableColumns | null {
  const cells = splitTableCells(line);
  if (!cells) return null;
  return matchTableColumns(cells);
}

/**
 * Tenta ler uma linha de dados da tabela usando o mapeamento de colunas já
 * lido do cabeçalho. Devolve null se a linha não tiver formato de tabela,
 * não tiver células suficientes, ou a quantidade/comprimento/largura não
 * forem números válidos (> 0) — nesse caso a linha cai para o tratamento
 * padrão de "não reconhecida" em analyzeText, indo para a conferência.
 */
export function parseMarkdownTableRow(line: string, columns: TableColumns): TableRow | null {
  const cells = splitTableCells(line);
  if (!cells) return null;
  return buildTableRow(cells, columns);
}
