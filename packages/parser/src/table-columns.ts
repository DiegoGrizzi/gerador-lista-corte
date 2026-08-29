/**
 * table-columns.ts
 * ---------------------------------------------------------------------------
 * Lógica compartilhada entre os dois formatos de tabela reconhecidos numa
 * mensagem colada — Markdown (delimitada por "|", ver markdown-table.ts) e
 * TSV (colada de uma planilha, delimitada por tabulação, ver tsv-table.ts):
 * reconhecimento do nome de cada coluna no cabeçalho e leitura de uma linha
 * de dados já com as colunas mapeadas.
 * ---------------------------------------------------------------------------
 */
import { toNumber } from './numbers.js';
import { extractHeaderInfo } from './header.js';
import type { FitaState } from './types.js';

const QTY_HEADER_ALIASES = ['quantidade', 'qtd', 'qtde', 'quant'];
const COMPR_HEADER_ALIASES = ['comprimento', 'compr', 'comp'];
const LARG_HEADER_ALIASES = ['largura', 'larg'];
const FUNCAO_HEADER_ALIASES = ['peça', 'peca', 'peças', 'pecas', 'item', 'nome', 'descrição', 'descricao', 'função', 'funcao'];
const MATERIAL_HEADER_ALIASES = ['material'];
const FITA_C1_HEADER_ALIASES = ['fita c1', 'c1'];
const FITA_C2_HEADER_ALIASES = ['fita c2', 'c2'];
const FITA_L1_HEADER_ALIASES = ['fita l1', 'l1'];
const FITA_L2_HEADER_ALIASES = ['fita l2', 'l2'];

/** Índice (na linha, já dividida em células) de cada coluna reconhecida no cabeçalho. */
export interface TableColumns {
  qtyIdx: number;
  comprIdx: number;
  largIdx: number;
  /** Coluna com o nome/descrição da peça (ex: "Pilares verticais") ou a própria Função (ex: "TRAV") — `null` se a tabela não tiver essa coluna. */
  funcaoIdx: number | null;
  /** Coluna com o material da linha (ex: "MDF 25mm") — `null` se a tabela não tiver essa coluna. */
  materialIdx: number | null;
  /** Colunas de fita explícita por lado (✓/-) — `null` cada uma se a tabela não tiver essa coluna específica. */
  c1Idx: number | null;
  c2Idx: number | null;
  l1Idx: number | null;
  l2Idx: number | null;
}

/** Uma linha de dados já interpretada, pronta para virar peça via buildPieceFromDimensionFirstMatch. */
export interface TableRow {
  qty: number;
  compr: number;
  larg: number;
  funcao: string | null;
  material: string | null;
  thicknessMm: number | null;
  /** Só vem preenchido quando a tabela tem pelo menos uma coluna de fita (Fita C1/C2/L1/L2) — nesse caso, representa o estado explícito e completo dessa linha (coluna ausente = lado não fitado). */
  customFita: FitaState | null;
}

/**
 * Normaliza uma célula de cabeçalho antes de comparar com os nomes
 * conhecidos de coluna: remove anotação de unidade entre parênteses (ex:
 * "Comprimento (mm)" -> "comprimento") e pontuação solta (ex: "Quant." ->
 * "quant").
 */
function normalizeHeaderCell(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[.]/g, '')
    .trim();
}

/**
 * Tenta mapear as células de uma linha de cabeçalho (já divididas pelo
 * delimitador do formato específico — "|" ou tabulação) para o índice de
 * cada coluna reconhecida. Devolve null se não tiver as três colunas
 * obrigatórias (Quantidade, Comprimento, Largura).
 */
export function matchTableColumns(cells: string[]): TableColumns | null {
  if (cells.length < 3) return null;

  const normalized = cells.map(normalizeHeaderCell);
  const qtyIdx = normalized.findIndex((cell) => QTY_HEADER_ALIASES.includes(cell));
  const comprIdx = normalized.findIndex((cell) => COMPR_HEADER_ALIASES.includes(cell));
  const largIdx = normalized.findIndex((cell) => LARG_HEADER_ALIASES.includes(cell));
  if (qtyIdx === -1 || comprIdx === -1 || largIdx === -1) return null;

  const funcaoIdx = normalized.findIndex((cell) => FUNCAO_HEADER_ALIASES.includes(cell));
  const materialIdx = normalized.findIndex((cell) => MATERIAL_HEADER_ALIASES.includes(cell));
  const c1Idx = normalized.findIndex((cell) => FITA_C1_HEADER_ALIASES.includes(cell));
  const c2Idx = normalized.findIndex((cell) => FITA_C2_HEADER_ALIASES.includes(cell));
  const l1Idx = normalized.findIndex((cell) => FITA_L1_HEADER_ALIASES.includes(cell));
  const l2Idx = normalized.findIndex((cell) => FITA_L2_HEADER_ALIASES.includes(cell));
  return {
    qtyIdx,
    comprIdx,
    largIdx,
    funcaoIdx: funcaoIdx === -1 ? null : funcaoIdx,
    materialIdx: materialIdx === -1 ? null : materialIdx,
    c1Idx: c1Idx === -1 ? null : c1Idx,
    c2Idx: c2Idx === -1 ? null : c2Idx,
    l1Idx: l1Idx === -1 ? null : l1Idx,
    l2Idx: l2Idx === -1 ? null : l2Idx,
  };
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
 * Lê uma linha de dados (já dividida em células) usando o mapeamento de
 * colunas lido do cabeçalho. Devolve null se não tiver células
 * suficientes, ou a quantidade/comprimento/largura não forem números
 * válidos (> 0) — nesse caso a linha cai para o tratamento padrão de "não
 * reconhecida" em analyzeText, indo para a conferência.
 */
export function buildTableRow(cells: string[], columns: TableColumns): TableRow | null {
  const maxIdx = Math.max(columns.qtyIdx, columns.comprIdx, columns.largIdx);
  if (cells.length <= maxIdx) return null;

  const qty = toNumber(cells[columns.qtyIdx]!);
  const compr = toNumber(cells[columns.comprIdx]!);
  const larg = toNumber(cells[columns.largIdx]!);
  if (isNaN(qty) || isNaN(compr) || isNaN(larg)) return null;

  const funcaoCell = columns.funcaoIdx != null ? cells[columns.funcaoIdx] : null;

  // "MDF 25mm" -> material "MDF", espessura 25 - mesma leitura usada por um
  // cabeçalho "MDF ..." de bloco (ver header.ts).
  const materialCell = columns.materialIdx != null ? cells[columns.materialIdx] : null;
  const materialInfo = materialCell ? extractHeaderInfo(materialCell) : null;

  const hasFitaColumn = columns.c1Idx != null || columns.c2Idx != null || columns.l1Idx != null || columns.l2Idx != null;
  const customFita: FitaState | null = hasFitaColumn
    ? {
        c1: columns.c1Idx != null ? isFitaCellChecked(cells[columns.c1Idx] ?? '') : false,
        c2: columns.c2Idx != null ? isFitaCellChecked(cells[columns.c2Idx] ?? '') : false,
        l1: columns.l1Idx != null ? isFitaCellChecked(cells[columns.l1Idx] ?? '') : false,
        l2: columns.l2Idx != null ? isFitaCellChecked(cells[columns.l2Idx] ?? '') : false,
      }
    : null;

  return {
    qty,
    compr,
    larg,
    funcao: funcaoCell || null,
    material: materialInfo?.material || null,
    thicknessMm: materialInfo?.thickness ?? null,
    customFita,
  };
}
