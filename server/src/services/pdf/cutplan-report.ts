/**
 * cutplan-report.ts
 * ---------------------------------------------------------------------------
 * Lê o PDF do SCM CutPlan (programa de otimização de corte da serra), que traz
 * a lista de peças em dois formatos, os dois com texto de verdade (sem OCR):
 *
 *  1) "Relatório" — uma tabela só, em várias páginas:
 *       Peças cortadas
 *       Esquema  Cant  Base  Altura  Observación
 *                2     380   370
 *     Cant = quantidade, Base = comprimento, Altura = largura. Termina em
 *     "Total de peças cortadas : 92". As tabelas "Lista de placas usadas"
 *     (chapas inteiras) e "Lista de cortes utilizáveis" (sobras) também têm
 *     colunas Cant/Base/Altura, mas NÃO são peças: só vale o que vem depois de
 *     "Peças cortadas".
 *
 *  2) "Plano de corte" — uma página por chapa, com o desenho e, ao lado das
 *     sobras, a tabela das peças daquela chapa:
 *       Peças cortadas        Sobras de Recortes
 *       T  Ref.  Qtde.  Comp.  Largura  Detalhe   (U1) 1 de 1447 x 15.8
 *          (2)   1      784    2200
 *     A mesma peça (Ref.) aparece em mais de uma chapa e as quantidades somam.
 *     Só vale o lado esquerdo (antes de "Sobras de Recortes"). A linha
 *     "2 de 2744.2 x 1834.2 Chapa Inteira" só diz quantas chapas inteiras o
 *     plano usou: não muda a quantidade das peças, que fica como está na tabela.
 *
 * O material vem no título da página ("MDF UNICOLOR 15MM"). A saída é uma
 * tabela de 4 colunas (Quantidade, Comprimento, Largura, Material) que o leitor
 * de tabelas já sabe ler.
 * ---------------------------------------------------------------------------
 */
import type { OcrWord } from './table-reconstruct.js';

export interface CutPlanPage {
  /** Linhas de tabela (já em TSV, sem cabeçalho). */
  rows: string[];
  /** Total de peças que o próprio relatório informa ("Total de peças cortadas : 92"), se houver. */
  statedTotal: number | null;
}

const NUM = '\\d+(?:[.,]\\d+)?';
/** "380 370" depois da quantidade: o primeiro número da linha é a quantidade, inteira. */
const REPORT_ROW_RE = new RegExp(`^(\\d{1,4})\\s+(${NUM})\\s+(${NUM})(?:\\s|$)`);
/** "(2) 1 784 2200": referência entre parênteses, quantidade, comprimento, largura. */
const PLAN_ROW_RE = new RegExp(`^\\(\\s*\\d+\\s*\\)\\s+(\\d{1,4})\\s+(${NUM})\\s+(${NUM})(?:\\s|$)`);
const STATED_TOTAL_RE = /total\s+de\s+pe[çc]as\s+cortadas\s*:\s*(\d+)/i;
/** Título da página: "MDF UNICOLOR 15MM" (o programa escreve a espessura colada, em maiúsculas). */
const TITLE_MATERIAL_RE = /^(.*?\S)\s+(\d{1,2}(?:[.,]\d+)?)\s*mm$/i;

interface Line {
  words: OcrWord[];
  text: string;
}

/** Junta as palavras que estão na mesma altura em linhas, da esquerda para a direita. */
function groupIntoLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: OcrWord[][] = [];
  for (const word of sorted) {
    const current = groups[groups.length - 1];
    const first = current?.[0];
    if (current && first && Math.abs(word.top - first.top) <= Math.max(2, first.height * 0.6)) {
      current.push(word);
    } else {
      groups.push([word]);
    }
  }
  return groups.map((group) => {
    const ordered = group.sort((a, b) => a.left - b.left);
    return { words: ordered, text: ordered.map((w) => w.text).join(' ') };
  });
}

/** Quebra a linha em trechos de texto onde o espaço entre duas palavras é grande (colunas diferentes). */
function splitByLargeGaps(words: OcrWord[]): string[] {
  const segments: string[][] = [];
  let previous: OcrWord | null = null;
  for (const word of words) {
    const gap = previous ? word.left - (previous.left + previous.width) : 0;
    if (!previous || gap > Math.max(20, previous.height * 3)) segments.push([word.text]);
    else segments[segments.length - 1]!.push(word.text);
    previous = word;
  }
  return segments.map((segment) => segment.join(' '));
}

/** Verdadeiro se o texto da página for do SCM CutPlan. */
export function isCutPlanPage(words: OcrWord[]): boolean {
  return words.some((w) => /^cutplan$/i.test(w.text));
}

/**
 * "MDF UNICOLOR 15MM" -> "MDF UNICOLOR 15mm". Com a cor (que não vem no título
 * do PDF): "MDF UNICOLOR BRANCO 15mm". Sem espessura no título, devolve null.
 */
function materialFromTitle(lines: Line[], color: string | null): string | null {
  for (const line of lines.slice(0, 6)) {
    // O nome do cliente fica na mesma altura do título, mais à esquerda: só um
    // espaço grande separa os dois, então cada trecho é testado sozinho.
    for (const segment of splitByLargeGaps(line.words)) {
      const match = TITLE_MATERIAL_RE.exec(segment);
      if (match && /\p{L}{3,}/u.test(match[1]!)) {
        const name = match[1]!.replace(/\s+/g, ' ');
        const withColor = color && !name.toUpperCase().includes(color) ? `${name} ${color}` : name;
        return `${withColor} ${match[2]!.replace(',', '.')}mm`;
      }
    }
  }
  return null;
}

/** Palavras do nome do arquivo que não são a cor: tipo do arquivo e espessura. */
const FILE_NAME_NOISE_RE = /^(?:relat[oó]rio|plano|corte|lista|de|do|da|c[oó]pia|copia|final|novo|pdf|mm+)$/i;
/** "15mm", "15mnnnn", "6MMM": a espessura escrita à mão no nome do arquivo. */
const FILE_NAME_THICKNESS_RE = /^\d+(?:[.,]\d+)?m\w*$/i;

/**
 * A cor vem do nome do arquivo, porque o título do PDF só diz "MDF UNICOLOR":
 * "relatorio branco 15mnnnn.pdf" -> "BRANCO", "RELATORIO TITANIO 18MMM.pdf" ->
 * "TITANIO". Sem nada que sobre (ou com mais de duas palavras, que já não parece uma
 * cor), devolve null.
 */
export function colorFromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '');
  const words = base
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .split(/[\s_.\-]+/)
    .filter((word) => word !== '')
    .filter((word) => !FILE_NAME_NOISE_RE.test(word) && !FILE_NAME_THICKNESS_RE.test(word) && !/^\d+$/.test(word));
  if (words.length === 0 || words.length > 2) return null;
  if (!words.every((word) => /^\p{L}+$/u.test(word))) return null;
  return words.join(' ').toUpperCase();
}

function toRow(qty: number, compr: string, larg: string, material: string | null): string {
  return [String(qty), compr.replace(',', '.'), larg.replace(',', '.'), material ?? ''].join('\t');
}

/**
 * Lê uma página do SCM CutPlan. Devolve null só se a página não for do
 * CutPlan; uma página dele sem peças devolve a lista de linhas vazia.
 */
export function readCutPlanPage(words: OcrWord[], color: string | null = null): CutPlanPage | null {
  if (!isCutPlanPage(words)) return null;
  const lines = groupIntoLines(words);
  const material = materialFromTitle(lines, color);
  const rows: string[] = [];
  let statedTotal: number | null = null;
  // Início da tabela de peças: "Peças cortadas" seguido do cabeçalho da tabela.
  let inPieces = false;
  /** Posição (x) onde começa "Sobras de Recortes": só vale o que está à esquerda dela. */
  let leftLimit = Infinity;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const total = STATED_TOTAL_RE.exec(line.text);
    if (total) {
      statedTotal = Number(total[1]);
      inPieces = false;
      continue;
    }
    if (/^pe[çc]as\s+cortadas\b/i.test(line.text)) {
      const sobras = line.words.find((w) => /^sobras$/i.test(w.text));
      leftLimit = sobras ? sobras.left - 1 : Infinity;
      // O cabeçalho vem na linha de baixo: Cant Base Altura (relatório) ou Qtde. Comp. Largura (plano).
      const header = lines[i + 1]?.text ?? '';
      inPieces = /\bcant\b/i.test(header) || /\bqtde?\b/i.test(header);
      if (inPieces) i++;
      continue;
    }
    if (!inPieces) continue;
    if (/^(?:lista\s+de|sobra\s*=|desloc)/i.test(line.text)) {
      inPieces = false;
      continue;
    }
    const cells = line.words.filter((w) => w.left < leftLimit);
    const text = cells.map((w) => w.text).join(' ');
    const match = PLAN_ROW_RE.exec(text) ?? (leftLimit === Infinity ? REPORT_ROW_RE.exec(text) : null);
    if (match) rows.push(toRow(Number(match[1]), match[2]!, match[3]!, material));
  }

  // Página do CutPlan sem peças (ex: a última, só com a "Lista de cortes
  // utilizáveis") devolve vazio e NÃO cai no OCR: as sobras lidas por OCR
  // virariam linhas soltas na conferência.
  return { rows, statedTotal };
}

/** Junta as páginas lidas numa tabela de 4 colunas, com o cabeçalho no começo. */
export function cutPlanRowsToText(rows: string[]): string {
  return ['Quantidade\tComprimento\tLargura\tMaterial', ...rows].join('\n');
}
