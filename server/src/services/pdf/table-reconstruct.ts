/**
 * table-reconstruct.ts
 * ---------------------------------------------------------------------------
 * Reconstrói a estrutura de uma tabela (linhas e colunas) a partir da lista
 * de palavras reconhecidas pelo OCR de uma página de PDF, cada uma com sua
 * posição (ver table-ocr.ts) — o Tesseract só devolve texto solto com
 * posição, não sabe nada sobre linhas/colunas de tabela.
 *
 * Função pura, sem nenhuma chamada de OCR/arquivo — só geometria (posição
 * das palavras na página), o que a deixa fácil de testar com dados falsos
 * (ver o teste correspondente). Não faz nenhuma interpretação de "o que
 * cada coluna significa" (isso é trabalho do packages/parser, do outro
 * lado, que já lê tabelas por nome de cabeçalho — ver table-columns.ts) —
 * só devolve um bloco de texto separado por tabulação, exatamente como se
 * alguém tivesse copiado a tabela de uma planilha e colado na mensagem. Se
 * a página não tiver uma tabela reconhecível (ex: só o desenho do plano de
 * corte), devolve null — a página é ignorada em silêncio, sem erro.
 * ---------------------------------------------------------------------------
 */

export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Espaço horizontal (em pixels) acima do qual duas palavras contam como
 * blocos de texto separados, não a mesma linha de tabela (ex: "Cliente:
 * ... Chapa 10" à esquerda e "Projeto: ..." à direita, na mesma altura da
 * página por coincidência). Valor FIXO de propósito, não uma fração da
 * largura da página: testado de verdade — usar uma fração fazia o limite
 * variar de acordo com QUALQUER palavra da página (mesmo longe da tabela),
 * cortando até espaços legítimos entre colunas largas da própria tabela em
 * páginas sem muito conteúdo por perto. Calibrado para a resolução de
 * renderização usada em pdf-renderer.ts (RENDER_SCALE = 3) — a maior
 * lacuna real já vista dentro de um cabeçalho de verdade, nessa escala, foi
 * de ~530px; a menor lacuna de uma falsa fusão de blocos não relacionados
 * foi de ~1500px.
 */
const MAX_ROW_GAP_PX = 600;
/** Quantidade mínima de palavras (no mesmo bloco contíguo) para uma linha ser considerada candidata a cabeçalho de tabela. */
const MIN_HEADER_WORDS = 6;
/** Fração da largura da página que o bloco candidato a cabeçalho precisa ocupar — o cabeçalho de uma tabela de corte real ocupa quase a largura inteira; blocos de metadados (Cliente/Projeto/Acabamento etc.) ficam confinados a uma faixa estreita. */
const MIN_HEADER_WIDTH_FRACTION = 0.5;
/** Quantidade mínima de palavras do bloco candidato que precisam bater com um nome de coluna conhecido — sem isso, o desenho do plano de corte (com muitos números/rótulos espalhados) pode gerar falsos positivos. */
const MIN_KEYWORD_MATCHES = 2;

/**
 * Nomes de coluna conhecidos (mesmo universo aceito por
 * packages/parser/src/table-columns.ts) — usados aqui só para RECONHECER
 * qual linha da página é o cabeçalho de verdade em meio a outros textos
 * (ex: "Cliente:", "Projeto:", números soltos do desenho do plano de
 * corte), nunca para decidir o que cada coluna significa — essa parte
 * continua sendo trabalho exclusivo do parser, do lado do cliente.
 */
const KNOWN_HEADER_KEYWORDS = new Set([
  'descrição',
  'descricao',
  'observação',
  'observacao',
  'largura',
  'altura',
  'comprimento',
  'compr',
  'dimensão',
  'dimensao',
  'qt',
  'qtd',
  'quantidade',
  'peça',
  'peca',
  'nome',
  'borda',
  'material',
]);

/** Remove ruído de linha de borda da tabela colado na palavra pelo OCR (ex: um "|" grudado em "|Descrição", perto da borda de uma célula) — nunca é parte de um nome de coluna nem de conteúdo real. */
function cleanBorderNoise(text: string): string {
  return text.replace(/^[|_]+|[|_]+$/g, '').trim();
}

/** Verdadeiro para uma "palavra" que é só ruído de borda isolado (ex: "-", "_", "|") — não é nome de coluna nem conteúdo real de célula. */
function isBorderNoiseOnly(text: string): boolean {
  return /^[|_\-.,:;]+$/.test(text);
}

/**
 * Agrupa as palavras em linhas pela posição vertical (centro Y de cada
 * palavra), com tolerância baseada na altura média das palavras já
 * agrupadas — palavras de tamanhos de fonte diferentes na mesma "linha
 * visual" (ex: um cabeçalho maior ou um sobrescrito) ainda contam como a
 * mesma linha, dentro de uma margem razoável.
 */
function clusterIntoRows(words: OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2));
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    const centerY = word.top + word.height / 2;
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const lastCenterY = lastRow.reduce((sum, w) => sum + w.top + w.height / 2, 0) / lastRow.length;
      const avgHeight = lastRow.reduce((sum, w) => sum + w.height, 0) / lastRow.length;
      if (Math.abs(centerY - lastCenterY) <= avgHeight * 0.6) {
        lastRow.push(word);
        continue;
      }
    }
    rows.push([word]);
  }
  rows.forEach((row) => row.sort((a, b) => a.left - b.left));
  return rows;
}

/** Divide uma linha (já ordenada da esquerda pra direita) em blocos contíguos, cortando onde o espaço horizontal é grande demais pra ser a mesma tabela. */
function splitByGap(row: OcrWord[], maxGapPx: number): OcrWord[][] {
  const segments: OcrWord[][] = [];
  let current: OcrWord[] = [row[0]!];
  for (let i = 1; i < row.length; i++) {
    const prevWord = row[i - 1]!;
    const gap = row[i]!.left - (prevWord.left + prevWord.width);
    if (gap > maxGapPx) {
      segments.push(current);
      current = [];
    }
    current.push(row[i]!);
  }
  segments.push(current);
  return segments;
}

function segmentWidth(segment: OcrWord[]): number {
  const last = segment[segment.length - 1]!;
  return last.left + last.width - segment[0]!.left;
}

function countKeywordMatches(segment: OcrWord[]): number {
  return segment.filter((w) => KNOWN_HEADER_KEYWORDS.has(w.text.toLowerCase().replace(/[.:]/g, ''))).length;
}

interface HeaderMatch {
  headerRow: OcrWord[];
  rowIndex: number;
}

/**
 * Acha a primeira linha (de cima pra baixo) cujo bloco contíguo de
 * palavras satisfaz TODAS as condições ao mesmo tempo: palavras
 * suficientes, largura ocupando a maior parte da página, e pelo menos
 * algumas palavras batendo com nomes de coluna conhecidos. As três juntas
 * distinguem de forma confiável o cabeçalho de verdade de blocos de
 * metadados (Cliente/Chapa/Projeto/Acabamento etc., que têm bastante texto
 * mas ficam confinados a uma faixa estreita da página) e de ruído do
 * desenho do plano de corte (números/rótulos espalhados, sem nenhuma
 * palavra batendo com os nomes de coluna conhecidos).
 */
function findHeaderRow(rows: OcrWord[][], pageWidth: number): HeaderMatch | null {
  for (let i = 0; i < rows.length; i++) {
    const segments = splitByGap(rows[i]!, MAX_ROW_GAP_PX);
    for (const segment of segments) {
      if (
        segment.length >= MIN_HEADER_WORDS &&
        segmentWidth(segment) >= pageWidth * MIN_HEADER_WIDTH_FRACTION &&
        countKeywordMatches(segment) >= MIN_KEYWORD_MATCHES
      ) {
        return { headerRow: segment, rowIndex: i };
      }
    }
  }
  return null;
}

interface ColumnBound {
  text: string;
  start: number;
  end: number;
}

/** Usa a posição de cada palavra do cabeçalho como o início da coluna correspondente, e o início da próxima palavra do cabeçalho como o fim — a última coluna vai até o fim da página. */
function buildColumnBounds(headerRow: OcrWord[]): ColumnBound[] {
  return headerRow.map((word, i) => {
    const nextWord = headerRow[i + 1];
    return { text: word.text, start: word.left, end: nextWord ? nextWord.left : Infinity };
  });
}

/**
 * Agrupa as palavras de uma linha de dados nas colunas já definidas pelo
 * cabeçalho. Usa a borda ESQUERDA de cada palavra (não o centro): colunas
 * nessas tabelas são alinhadas à esquerda, e um valor mais largo que a
 * palavra do cabeçalho daquela coluna (ex: "Inferior" sob o cabeçalho
 * "Borda", mais curto) faria o CENTRO vazar pra coluna seguinte, mesmo a
 * palavra pertencendo à coluna correta — confirmado testando com dados
 * reais.
 */
function mapRowToColumns(row: OcrWord[], columnBounds: ColumnBound[]): string[] {
  const cells: OcrWord[][] = columnBounds.map(() => []);
  for (const word of row) {
    let colIndex = columnBounds.findIndex((col) => word.left >= col.start && word.left < col.end);
    if (colIndex === -1) colIndex = columnBounds.length - 1;
    cells[colIndex]!.push(word);
  }
  return cells.map((cellWords) => cellWords.map((w) => w.text).join(' '));
}

/**
 * Reconstrói a tabela de uma página a partir das palavras reconhecidas
 * pelo OCR (com posição), devolvendo um bloco de texto separado por
 * tabulação (cabeçalho na primeira linha, uma peça por linha depois) —
 * pronto para ser interpretado pelo parser (ver
 * packages/parser/src/tsv-table.ts) como se fosse uma tabela colada de
 * planilha.
 *
 * Devolve null se a página não tiver uma linha que pareça o cabeçalho de
 * uma tabela de corte (ex: uma página só com o desenho do plano de corte,
 * sem lista nenhuma) — nesse caso a página é ignorada, sem erro.
 */
export function reconstructTableText(rawWords: OcrWord[]): string | null {
  const words = rawWords
    .map((w) => ({ ...w, text: cleanBorderNoise(w.text) }))
    .filter((w) => w.text.length > 0 && !isBorderNoiseOnly(w.text));
  if (words.length === 0) return null;

  const pageWidth = Math.max(...words.map((w) => w.left + w.width));
  const rows = clusterIntoRows(words);
  const found = findHeaderRow(rows, pageWidth);
  if (!found) return null;

  const columnBounds = buildColumnBounds(found.headerRow);
  const dataRows = rows.slice(found.rowIndex + 1);

  const lines = [columnBounds.map((c) => c.text).join('\t')];
  for (const row of dataRows) {
    lines.push(mapRowToColumns(row, columnBounds).join('\t'));
  }
  return lines.join('\n');
}
