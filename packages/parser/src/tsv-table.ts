/**
 * tsv-table.ts
 * ---------------------------------------------------------------------------
 * Reconhecimento de uma tabela colada direto de uma planilha (Excel/Google
 * Sheets) — cada célula fica separada por um caractere de tabulação real
 * (\t), sem nenhuma marcação visual como a tabela em Markdown (ver
 * markdown-table.ts): só uma linha de cabeçalho, seguida direto pelas
 * linhas de dados, sem linha separadora nenhuma:
 *
 *   Quantidade	Comprimento	Largura	Função	Fita C1	Fita C2	Fita L1	Fita L2	Material
 *   2	1700	970	LAT	✓	✓	✓	✓	MDF 25mm
 *
 * A leitura das colunas em si é compartilhada com o formato Markdown
 * através de table-columns.ts — a única diferença entre os dois formatos é
 * o delimitador (tabulação vs "|") e a ausência de linha separadora aqui.
 * ---------------------------------------------------------------------------
 */
import { matchTableColumns, buildTableRow } from './table-columns.js';
import type { TableColumns, TableRow } from './table-columns.js';

export type { TableColumns as TsvTableColumns, TableRow as TsvTableRow };

/** Verdadeiro só quando a linha tem pelo menos uma tabulação de verdade — o delimitador desse formato. */
function splitTsvCells(line: string): string[] | null {
  if (line.indexOf('\t') === -1) return null;
  return line.split('\t').map((cell) => cell.trim());
}

/**
 * Tenta ler a linha de cabeçalho de uma tabela TSV, devolvendo o índice de
 * cada coluna reconhecida. Devolve null se a linha não tiver tabulação
 * nenhuma, ou não tiver as três colunas obrigatórias (Quantidade,
 * Comprimento, Largura).
 */
export function parseTsvTableHeader(line: string): TableColumns | null {
  const cells = splitTsvCells(line);
  if (!cells) return null;
  return matchTableColumns(cells);
}

/**
 * Tenta ler uma linha de dados da tabela TSV usando o mapeamento de
 * colunas já lido do cabeçalho. Devolve null se a linha não tiver
 * tabulação nenhuma, não tiver células suficientes, ou a quantidade/
 * comprimento/largura não forem números válidos (> 0) — nesse caso a linha
 * cai para o tratamento padrão de "não reconhecida" em analyzeText, indo
 * para a conferência.
 */
export function parseTsvTableRow(line: string, columns: TableColumns): TableRow | null {
  const cells = splitTsvCells(line);
  if (!cells) return null;
  return buildTableRow(cells, columns);
}
