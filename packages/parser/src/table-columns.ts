/**
 * table-columns.ts
 * ---------------------------------------------------------------------------
 * Lógica compartilhada entre os formatos de tabela reconhecidos numa
 * mensagem colada — Markdown (delimitada por "|", ver markdown-table.ts),
 * TSV (colada de uma planilha ou reconstruída a partir de um PDF, ver
 * tsv-table.ts): reconhecimento do nome de cada coluna no cabeçalho e
 * leitura de uma linha de dados já com as colunas mapeadas.
 * ---------------------------------------------------------------------------
 */
import { toNumber } from './numbers.js';
import { extractHeaderInfo } from './header.js';
import type { FitaState } from './types.js';

const QTY_HEADER_ALIASES = ['quantidade', 'qtd', 'qtde', 'quant', 'qt'];
const COMPR_HEADER_ALIASES = ['comprimento', 'compr', 'comp', 'altura'];
const LARG_HEADER_ALIASES = ['largura', 'larg'];
// "item" de propósito NÃO está aqui: numa tabela real de PDF (ver
// PDF_TABLE_WITH_COMBINED_DIMENSAO nos testes), "Item" é uma coluna de
// código/id (ex: "14.AZ", "1.BF"), separada de "Descrição" - incluir "item"
// aqui fazia essa coluna de código vencer a de descrição de verdade,
// quando as duas colunas existem juntas na mesma tabela.
const FUNCAO_HEADER_ALIASES = ['peça', 'peca', 'peças', 'pecas', 'nome', 'descrição', 'descricao', 'função', 'funcao'];
const MATERIAL_HEADER_ALIASES = ['material', 'chapa'];
const COMPLEMENTO_HEADER_ALIASES = ['observação', 'observacao', 'ambiente'];
/** Coluna com as 3 medidas já juntas numa célula só (ex: "1700 x 70 x 15") — alternativa a ter Comprimento/Largura em colunas separadas, comum em listas exportadas de programas de otimização de corte. */
const DIMENSAO_HEADER_ALIASES = ['dimensão', 'dimensao', 'medidas'];
const FITA_C1_HEADER_ALIASES = ['fita c1', 'c1'];
const FITA_C2_HEADER_ALIASES = ['fita c2', 'c2'];
const FITA_L1_HEADER_ALIASES = ['fita l1', 'l1'];
const FITA_L2_HEADER_ALIASES = ['fita l2', 'l2'];

/** "1700 x 70 x 15" -> [1700, 70, 15] (comprimento, largura, espessura), na ordem em que aparecem na célula. Aceita "x" ou "×" (sinal de multiplicação de verdade). */
const COMBINED_DIMENSION_RE = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i;

/** Índice (na linha, já dividida em células) de cada coluna reconhecida no cabeçalho. */
export interface TableColumns {
  /** `null` quando a tabela não tem coluna de quantidade — cada linha conta como 1 peça (comum em listas onde peças repetidas viram linhas duplicadas, sem quantidade nenhuma). */
  qtyIdx: number | null;
  /** `null` quando a medida vem combinada numa única coluna "Dimensão" (ver `dimensaoIdx`) em vez de colunas separadas. */
  comprIdx: number | null;
  largIdx: number | null;
  /** Coluna com as 3 medidas juntas ("1700 x 70 x 15") — alternativa a `comprIdx`/`largIdx` separados. `null` se a tabela usa colunas separadas. */
  dimensaoIdx: number | null;
  /** Coluna com o nome/descrição da peça (ex: "Pilares verticais") ou a própria Função (ex: "TRAV") — `null` se a tabela não tiver essa coluna. */
  funcaoIdx: number | null;
  /** Coluna com o ambiente/complemento (ex: "SALA") — `null` se a tabela não tiver essa coluna. */
  complementoIdx: number | null;
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
  complemento: string | null;
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
 * cada coluna reconhecida. Devolve null se não tiver Comprimento+Largura
 * (separados) NEM Dimensão (combinada) — essas são as únicas colunas
 * realmente obrigatórias; Quantidade é opcional (linha sem ela vale 1 peça).
 */
export function matchTableColumns(cells: string[]): TableColumns | null {
  if (cells.length < 2) return null;

  const normalized = cells.map(normalizeHeaderCell);
  const qtyIdx = normalized.findIndex((cell) => QTY_HEADER_ALIASES.includes(cell));
  const comprIdx = normalized.findIndex((cell) => COMPR_HEADER_ALIASES.includes(cell));
  const largIdx = normalized.findIndex((cell) => LARG_HEADER_ALIASES.includes(cell));
  const dimensaoIdx = normalized.findIndex((cell) => DIMENSAO_HEADER_ALIASES.includes(cell));

  const hasSeparateDimensions = comprIdx !== -1 && largIdx !== -1;
  if (!hasSeparateDimensions && dimensaoIdx === -1) return null;

  const funcaoIdx = normalized.findIndex((cell) => FUNCAO_HEADER_ALIASES.includes(cell));
  const complementoIdx = normalized.findIndex((cell) => COMPLEMENTO_HEADER_ALIASES.includes(cell));
  const materialIdx = normalized.findIndex((cell) => MATERIAL_HEADER_ALIASES.includes(cell));
  const c1Idx = normalized.findIndex((cell) => FITA_C1_HEADER_ALIASES.includes(cell));
  const c2Idx = normalized.findIndex((cell) => FITA_C2_HEADER_ALIASES.includes(cell));
  const l1Idx = normalized.findIndex((cell) => FITA_L1_HEADER_ALIASES.includes(cell));
  const l2Idx = normalized.findIndex((cell) => FITA_L2_HEADER_ALIASES.includes(cell));
  return {
    qtyIdx: qtyIdx === -1 ? null : qtyIdx,
    comprIdx: hasSeparateDimensions ? comprIdx : null,
    largIdx: hasSeparateDimensions ? largIdx : null,
    dimensaoIdx: hasSeparateDimensions ? null : dimensaoIdx,
    funcaoIdx: funcaoIdx === -1 ? null : funcaoIdx,
    complementoIdx: complementoIdx === -1 ? null : complementoIdx,
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
  const requiredIdxs = [columns.qtyIdx, columns.comprIdx, columns.largIdx, columns.dimensaoIdx].filter(
    (idx): idx is number => idx != null,
  );
  const maxIdx = Math.max(...requiredIdxs);
  if (cells.length <= maxIdx) return null;

  const qty = columns.qtyIdx != null ? toNumber(cells[columns.qtyIdx]!) : 1;

  let compr: number;
  let larg: number;
  let dimensionThickness: number | null = null;
  if (columns.dimensaoIdx != null) {
    const dimensionMatch = COMBINED_DIMENSION_RE.exec(cells[columns.dimensaoIdx]!.trim());
    if (!dimensionMatch) return null;
    compr = toNumber(dimensionMatch[1]!);
    larg = toNumber(dimensionMatch[2]!);
    dimensionThickness = toNumber(dimensionMatch[3]!);
  } else {
    compr = toNumber(cells[columns.comprIdx!]!);
    larg = toNumber(cells[columns.largIdx!]!);
  }
  if (isNaN(qty) || isNaN(compr) || isNaN(larg)) return null;

  const funcaoCell = columns.funcaoIdx != null ? cells[columns.funcaoIdx] : null;
  const complementoCell = columns.complementoIdx != null ? cells[columns.complementoIdx] : null;

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
    complemento: complementoCell || null,
    material: materialInfo?.material || null,
    thicknessMm: materialInfo?.thickness ?? dimensionThickness,
    customFita,
  };
}
