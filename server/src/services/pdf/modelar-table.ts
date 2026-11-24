/**
 * modelar-table.ts
 * ---------------------------------------------------------------------------
 * Limpa a tabela reconstruída de um PDF "Lista de Corte Simplificada" (o
 * programa Modelar). A tabela dele tem colunas Descrição, Quantidade,
 * Dimensão ("2262 x 525 x 15" = comprimento x largura x espessura), Borda (um
 * desenho da peça com as bordas marcadas), Descrição da fita de borda, Veio,
 * Matéria-prima e Obs.
 *
 * O OCR lê as medidas e as quantidades bem, mas o resto da tabela sai
 * embaralhado:
 *   - a descrição quebra em duas linhas, e o começo dela ("4930-Base") cai na
 *     coluna Obs, no fim da linha ("15 (Fixa) ... 4937-Divisória");
 *   - o desenho da Borda vira lixo de OCR ("Dm", "o T—aD") em linhas extras;
 *   - a quantidade às vezes gruda na medida ("1 483." + "x504x15").
 * Lido assim, o leitor de tabelas via cabeçalho entendia "5070" como
 * quantidade. Aqui cada peça vira uma linha limpa de uma tabela de 4 colunas
 * (Descrição, Quantidade, Dimensão, Material), que o leitor já sabe ler.
 *
 * Linha com medida mas sem quantidade legível (ex: o OCR leu "É" no lugar do
 * "1") NÃO é adivinhada: sai com "?" na quantidade, o leitor não a reconhece
 * e ela vai para a conferência, em vez de entrar com a quantidade errada.
 * ---------------------------------------------------------------------------
 */

const NUM = '\\d+(?:[.,]\\d+)?';
const LETTERS = 'A-Za-zÀ-ÿ';

/** "<descrição> <qtd> <comp> x <larg> x <espessura>" — o ponto depois do comprimento ("483.") é ruído do OCR. */
const ROW_RE = new RegExp(
  `^(.*?)\\s(\\d{1,3})\\s+(${NUM})\\.?\\s*[x×]\\s*(${NUM})\\s*[x×]\\s*(\\d{1,2})(?!\\d)`,
);
/** Só a medida, para achar a linha sem quantidade legível. */
const DIMENSION_ONLY_RE = new RegExp(
  `(${NUM})\\.?\\s*[x×]\\s*(${NUM})\\s*[x×]\\s*(\\d{1,2})(?!\\d)`,
);
/** Início da descrição quebrada, no fim da linha (coluna Obs): "4930-Base", "4904-Lateral". */
const TRAILING_DESCRIPTION_CODE_RE = new RegExp(`\\s(\\d{3,6})-([${LETTERS}][${LETTERS} ]*?)\\s*$`);
/** Código na frente da descrição: "5070-Lateral 15 (Dir)". */
const LEADING_CODE_RE = /^\d{3,6}-\s*/;
/** Linha só com a continuação da descrição: "(Móvel)". */
const DESCRIPTION_TAIL_RE = new RegExp(`^\\([${LETTERS} ]+\\)$`);
/** "Cores.Branco MDF", "Duratex.Essencial Wood.Cumaru MDF", "Duratex.Trama.Grafite MDF" — o material vem como "Marca.Linha.Cor MDF". */
const MATERIAL_RE = new RegExp(`([${LETTERS}]{3,}\\.\\s*[^\\t\\n]*?)\\s+MDF\\b`);

const THICKNESS_MIN_MM = 3;
const THICKNESS_MAX_MM = 60;

export function isModelarTableHeader(headerLine: string): boolean {
  return /mat[eé]ria-?prima/i.test(headerLine) && /dimens[aã]o/i.test(headerLine);
}

/** "Cores.Branco" -> "Branco"; "Duratex.Essencial Wood.Cumaru" -> "Duratex Essencial Wood Cumaru". */
function materialName(raw: string): string {
  return raw
    .replace(/^Cores\.\s*/i, '')
    .replace(/\.\s*/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMaterial(rest: string, thicknessMm: number): string {
  const match = MATERIAL_RE.exec(rest);
  if (!match) return '';
  return 'MDF ' + materialName(match[1]!) + ' ' + thicknessMm + 'mm';
}

/** Junta o começo da descrição (coluna Obs) com o resto dela, sem o código de peça: "4937-Divisória" + "15 (Fixa)" = "Divisória 15 (Fixa)". */
function buildDescription(beforeQuantity: string, rest: string): string {
  const head = beforeQuantity.replace(LEADING_CODE_RE, '').trim();
  const trailing = TRAILING_DESCRIPTION_CODE_RE.exec(rest);
  return trailing ? (trailing[2]! + ' ' + head).replace(/\s+/g, ' ').trim() : head;
}

/**
 * Se o texto de uma página for a tabela do Modelar, devolve ela limpa; senão
 * devolve null (o texto segue como veio).
 */
export function cleanModelarTable(tableText: string): string | null {
  const lines = tableText.split('\n');
  if (!isModelarTableHeader(lines[0] ?? '')) return null;

  const out = ['Descrição\tQuantidade\tDimensão\tMaterial'];
  let lastRowIndex = -1;
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const row = ROW_RE.exec(line);
    if (row) {
      const thicknessMm = Number(row[5]);
      if (thicknessMm >= THICKNESS_MIN_MM && thicknessMm <= THICKNESS_MAX_MM) {
        const rest = line.slice(row[0].length);
        const dimension = row[3] + ' x ' + row[4] + ' x ' + row[5];
        out.push(
          [
            buildDescription(row[1]!, rest),
            row[2],
            dimension,
            findMaterial(rest, thicknessMm),
          ].join('\t'),
        );
        lastRowIndex = out.length - 1;
        continue;
      }
    }

    const dimensionOnly = DIMENSION_ONLY_RE.exec(line);
    if (dimensionOnly) {
      // Quantidade 0: o leitor de tabelas recusa a peça e manda a linha para a conferência (sem
      // encerrar a tabela, o que faria as linhas seguintes perderem as colunas), em vez de entrar
      // com uma quantidade adivinhada.
      const description = line.slice(0, dimensionOnly.index).replace(LEADING_CODE_RE, '').trim();
      out.push(['QUANTIDADE NÃO LIDA: ' + description, '0', dimensionOnly[0], ''].join('\t'));
      lastRowIndex = -1;
      continue;
    }

    // "(Móvel)" sozinho na linha de baixo é o fim da descrição da peça anterior.
    if (lastRowIndex > 0 && DESCRIPTION_TAIL_RE.test(line)) {
      const cells = out[lastRowIndex]!.split('\t');
      cells[0] = (cells[0] + ' ' + line).trim();
      out[lastRowIndex] = cells.join('\t');
      lastRowIndex = -1;
    }
  }

  return out.length > 1 ? out.join('\n') : null;
}
