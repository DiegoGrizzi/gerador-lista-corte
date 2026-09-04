/**
 * native-pdf-words.ts
 * ---------------------------------------------------------------------------
 * Extrai as palavras de um PDF que JÁ TEM uma camada de texto real (ex:
 * exportado por um programa/site, como "Cortecloud Central") — sem OCR
 * nenhum, direto da estrutura interna do PDF, com a posição de cada palavra
 * na página. Diferente de pdf-renderer.ts + table-ocr.ts (que rasterizam a
 * página em imagem e usam Tesseract), usado quando o PDF NÃO tem texto
 * selecionável (ex: gerado por "Imprimir para PDF" a partir de uma tela,
 * como o "Corte Certo") — ver pdf-table-extractor.ts para a lógica que
 * decide qual das duas usar.
 *
 * Usa pdfjs-dist diretamente (não a API de conveniência do pdf-parse, que
 * só devolve texto já concatenado em ordem de leitura, sem posição) — mesma
 * forma `OcrWord` de table-reconstruct.ts, para poder reaproveitar as
 * mesmas ideias de reconstrução geométrica.
 * ---------------------------------------------------------------------------
 */
import type { OcrWord } from './table-reconstruct.js';

export interface NativePdfPage {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  words: OcrWord[];
}

/**
 * Verdadeiro quando o PDF tem uma camada de texto real aproveitável — pelo
 * menos uma palavra de verdade (não vazia) em pelo menos uma página. PDFs
 * gerados por "Imprimir para PDF" a partir de uma tela (sem nenhum texto
 * selecionável) devolvem zero palavras aqui, mesmo tendo alguma extração
 * de texto sem sentido, então essa checagem é sobre TER palavras, não
 * sobre o resultado "fazer sentido" como tabela.
 */
export function hasUsableText(pages: NativePdfPage[]): boolean {
  return pages.some((page) => page.words.length > 0);
}

/**
 * Divide um item de texto do pdf.js em "palavras" (separadas por espaço) —
 * o pdf.js às vezes agrupa mais de uma palavra visual num item só quando
 * elas ficam próximas o bastante na mesma operação de desenho de texto
 * (confirmado com um PDF real: "Função da" saiu como um item único, com um
 * espaço no meio). Cada palavra resultante herda a MESMA posição vertical
 * do item original e uma posição horizontal proporcional à posição do
 * caractere dentro do texto — aproximação simples (não teríamos a largura
 * exata de cada palavra sem remedir cada caractere), mas suficiente pra
 * decidir em qual coluna cada uma cai.
 */
function splitItemIntoWords(text: string, left: number, top: number, width: number, height: number): OcrWord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return [{ text: trimmed, left, top, width, height }];

  const charsTotal = trimmed.length;
  const widthPerChar = charsTotal > 0 ? width / charsTotal : 0;
  let consumedChars = 0;
  const words: OcrWord[] = [];
  let searchFrom = 0;
  for (const part of parts) {
    const startInTrimmed = trimmed.indexOf(part, searchFrom);
    searchFrom = startInTrimmed + part.length;
    const wordLeft = left + startInTrimmed * widthPerChar;
    const wordWidth = part.length * widthPerChar;
    words.push({ text: part, left: wordLeft, top, width: wordWidth, height });
    consumedChars += part.length;
  }
  void consumedChars;
  return words;
}

/**
 * Extrai as palavras (com posição) de cada página de um PDF com texto
 * selecionável, usando pdfjs-dist diretamente — a API de conveniência do
 * pdf-parse (getText) só devolve texto já concatenado em ordem de leitura,
 * sem a posição de cada palavra, que é o que a reconstrução de tabela
 * precisa.
 *
 * Coordenada Y invertida de propósito: o pdf.js usa a convenção matemática
 * (Y cresce pra CIMA, origem no canto inferior esquerdo da página) — as
 * mesmas funções de reconstrução geométrica usadas para OCR (ver
 * table-reconstruct.ts) esperam a convenção de imagem/tela (Y cresce pra
 * BAIXO, origem no canto superior esquerdo), a mesma que o Tesseract já
 * devolve. Inverter aqui, uma vez, evita ter duas versões da lógica de
 * reconstrução — uma para cada convenção.
 */
export async function extractNativePdfWords(pdfBuffer: Buffer): Promise<NativePdfPage[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;

  try {
    const pages: NativePdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const words: OcrWord[] = [];
      for (const item of textContent.items) {
        if (!('str' in item) || !('transform' in item)) continue;
        const text = item.str;
        if (!text || !text.trim()) continue;
        const x = item.transform[4] as number;
        const yBaseline = item.transform[5] as number;
        const height = item.height || 8;
        const width = item.width || 0;
        // top-esquerda em convenção de imagem: inverte Y (viewport.height -
        // yBaseline) e recua pela altura do texto (o Y do pdf.js marca a
        // linha de base, não o topo do texto).
        const top = viewport.height - yBaseline - height;
        words.push(...splitItemIntoWords(text, x, top, width, height));
      }

      pages.push({ pageNumber, pageWidth: viewport.width, pageHeight: viewport.height, words });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
