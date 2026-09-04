/**
 * pdf-table-extractor.ts
 * ---------------------------------------------------------------------------
 * Ponto de entrada do fluxo de importação de PDF. Para CADA página, tenta
 * primeiro ler o texto NATIVO do PDF (sem OCR nenhum — ver
 * native-pdf-words.ts e native-table-reconstruct.ts): rápido e sem o
 * ruído/instabilidade do Tesseract, mas só funciona em PDFs exportados por
 * um programa/site que gera texto de verdade (ex: Cortecloud Central).
 * Quando a página não tem texto nativo aproveitável (ex: PDF gerado por
 * "Imprimir para PDF" a partir de uma tela, como o "Corte Certo" — sem
 * NENHUM texto selecionável) ou o texto nativo não bate com o formato de
 * tabela conhecido, cai pro caminho antigo: renderiza a página como
 * imagem, corrige a rotação se necessário, e faz OCR com posição de
 * palavra. Páginas sem tabela reconhecível em nenhum dos dois caminhos
 * (ex: as que só têm o desenho do plano de corte) são ignoradas em
 * silêncio, do mesmo jeito que uma linha não reconhecida numa mensagem
 * colada é ignorada pelo parser.
 *
 * Tudo injetado (deps) para os testes substituírem por dublês, sem tocar
 * em PDF/Tesseract/arquivo de verdade — mesmo padrão de
 * ../ocr/ocr-orchestrator.ts.
 * ---------------------------------------------------------------------------
 */
import sharp from 'sharp';

import { cleanupTempFile, writeTempImage } from '../temp-file.js';
import { extractNativePdfWords, type NativePdfPage } from './native-pdf-words.js';
import { nativeTableRowsToText, reconstructNativeTableRows, type NativeTableRow } from './native-table-reconstruct.js';
import { renderPdfPages, type RenderedPage } from './pdf-renderer.js';
import { detectRotation, recognizeWords } from './table-ocr.js';
import { reconstructTableText, type OcrWord } from './table-reconstruct.js';

export interface PdfTableExtractorDeps {
  extractNativePdfWords: (pdfBuffer: Buffer) => Promise<NativePdfPage[]>;
  reconstructNativeTableRows: (words: OcrWord[]) => NativeTableRow[] | null;
  nativeTableRowsToText: (rows: NativeTableRow[]) => string;
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
    extractNativePdfWords,
    reconstructNativeTableRows,
    nativeTableRowsToText,
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
 * Extrai o texto das tabelas de "Lista de Cortes" de um PDF — texto nativo
 * quando disponível, OCR como reserva (ver comentário no topo do arquivo).
 * Devolve string vazia se nenhuma página tiver uma tabela reconhecível —
 * não é um erro, só significa que o PDF não tinha nada aproveitável (ex:
 * só desenhos, ou nenhuma página de lista).
 */
export async function extractPdfTableText(pdfBuffer: Buffer, deps: PdfTableExtractorDeps): Promise<string> {
  const nativePages = await deps.extractNativePdfWords(pdfBuffer);
  const renderedPages = await deps.renderPdfPages(pdfBuffer);
  const tableBlocks: string[] = [];

  for (let i = 0; i < renderedPages.length; i++) {
    const page = renderedPages[i]!;

    const nativeWords = nativePages[i]?.words ?? [];
    if (nativeWords.length > 0) {
      const nativeRows = deps.reconstructNativeTableRows(nativeWords);
      if (nativeRows) {
        tableBlocks.push(deps.nativeTableRowsToText(nativeRows));
        continue; // texto nativo bastou - não precisa renderizar/OCR essa página.
      }
    }

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
