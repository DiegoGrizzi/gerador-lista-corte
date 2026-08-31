/**
 * pdf-renderer.ts
 * ---------------------------------------------------------------------------
 * Renderiza cada página de um PDF como uma imagem PNG — usado quando o PDF
 * não tem camada de texto de verdade (comum em PDFs gerados pela
 * impressora "Microsoft Print to PDF", confirmado em dois exemplos reais
 * do usuário), precisando de OCR igual a uma foto (ver table-ocr.ts).
 *
 * Usa só `pdf-parse` (puro JavaScript) de propósito — não depende de
 * nenhum programa externo instalado na máquina (ex: poppler/ghostscript),
 * ao contrário de outras formas comuns de renderizar PDF. Isso importa
 * especialmente aqui: o instalador deste sistema já teve mais de um
 * problema real com dependências nativas/de sistema no Windows (Tesseract
 * via winget pouco confiável, binário nativo do Rollup corrompido) — uma
 * biblioteca puramente em JavaScript evita repetir esse tipo de problema
 * pra essa feature.
 * ---------------------------------------------------------------------------
 */
import { PDFParse } from 'pdf-parse';

export interface RenderedPage {
  pageNumber: number;
  imageBuffer: Buffer;
}

/**
 * Resolução de renderização. "3" já se mostrou necessário pra tabelas com
 * texto pequeno terem uma precisão de OCR aceitável — testado de verdade:
 * em resolução mais baixa, dígitos inteiros de uma medida podiam sumir na
 * leitura (ex: "1700" virando "700").
 */
const RENDER_SCALE = 3;

/** Renderiza todas as páginas de um PDF como PNG, na ordem em que aparecem no documento. */
export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const shot = await parser.getScreenshot({ scale: RENDER_SCALE });
    return shot.pages.map((page, index) => ({
      pageNumber: index + 1,
      imageBuffer: Buffer.from(page.data),
    }));
  } finally {
    await parser.destroy();
  }
}
