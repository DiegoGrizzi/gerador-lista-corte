/**
 * pdf-table-extractor.ts
 * ---------------------------------------------------------------------------
 * Ponto de entrada do fluxo de importação de PDF: renderiza cada página
 * como imagem, corrige a rotação se necessário, faz OCR com posição de
 * palavra e reconstrói a tabela de cada página — devolvendo um único bloco
 * de texto com todas as tabelas encontradas. Páginas sem tabela
 * reconhecível (ex: as que só têm o desenho do plano de corte) são
 * ignoradas em silêncio, do mesmo jeito que uma linha não reconhecida numa
 * mensagem colada é ignorada pelo parser.
 *
 * Tudo injetado (deps) para os testes substituírem por dublês, sem tocar
 * em PDF/Tesseract/arquivo de verdade — mesmo padrão de
 * ../ocr/ocr-orchestrator.ts.
 * ---------------------------------------------------------------------------
 */
import sharp from 'sharp';

import { cleanupTempFile, writeTempImage } from '../temp-file.js';
import { renderPdfPages, type RenderedPage } from './pdf-renderer.js';
import { detectRotation, recognizeWords } from './table-ocr.js';
import { reconstructTableText, type OcrWord } from './table-reconstruct.js';

export interface PdfTableExtractorDeps {
  renderPdfPages: (pdfBuffer: Buffer) => Promise<RenderedPage[]>;
  detectRotation: (tesseractPath: string, imagePath: string) => Promise<number>;
  recognizeWords: (tesseractPath: string, lang: string, imagePath: string, psm: number) => Promise<OcrWord[]>;
  reconstructTableText: (words: OcrWord[]) => string | null;
  rotateImage: (imagePath: string, degrees: number) => Promise<string>;
  tesseractPath: string;
  lang: string;
}

/**
 * Modos de segmentação de página tentados, em ordem — ver o comentário no
 * topo de table-ocr.ts: psm 3 (automático) costuma ler o cabeçalho
 * corretamente na maioria das páginas; psm 6 ("bloco único de texto") só
 * entra como segunda tentativa, para os casos raros de cabeçalho com fundo
 * colorido que psm 3 não reconhece.
 */
const PSM_ATTEMPTS = [3, 6];

async function defaultRotateImage(imagePath: string, degrees: number): Promise<string> {
  const rotatedPath = imagePath.replace(/(\.[^.]+)$/, `-rotated$1`);
  await sharp(imagePath).rotate(degrees).toFile(rotatedPath);
  return rotatedPath;
}

export function createDefaultPdfTableExtractorDeps(tesseractPath: string, lang: string): PdfTableExtractorDeps {
  return {
    renderPdfPages,
    detectRotation,
    recognizeWords,
    reconstructTableText,
    rotateImage: defaultRotateImage,
    tesseractPath,
    lang,
  };
}

/**
 * Extrai o texto das tabelas de "Lista de Cortes" de um PDF (via OCR — ver
 * comentário no topo do arquivo). Devolve string vazia se nenhuma página
 * tiver uma tabela reconhecível — não é um erro, só significa que o PDF
 * não tinha nada aproveitável (ex: só desenhos, ou nenhuma página de
 * lista).
 */
export async function extractPdfTableText(pdfBuffer: Buffer, deps: PdfTableExtractorDeps): Promise<string> {
  const pages = await deps.renderPdfPages(pdfBuffer);
  const tableBlocks: string[] = [];

  for (const page of pages) {
    const imagePath = await writeTempImage(page.imageBuffer, '.png');
    let correctedPath = imagePath;
    try {
      const rotation = await deps.detectRotation(deps.tesseractPath, imagePath);
      if (rotation !== 0) {
        correctedPath = await deps.rotateImage(imagePath, rotation);
      }
      for (const psm of PSM_ATTEMPTS) {
        const words = await deps.recognizeWords(deps.tesseractPath, deps.lang, correctedPath, psm);
        const tableText = deps.reconstructTableText(words);
        if (tableText) {
          tableBlocks.push(tableText);
          break;
        }
      }
    } finally {
      await cleanupTempFile(imagePath);
      if (correctedPath !== imagePath) await cleanupTempFile(correctedPath);
    }
  }

  return tableBlocks.join('\n\n');
}
