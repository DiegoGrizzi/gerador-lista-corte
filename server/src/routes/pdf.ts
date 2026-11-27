import { Router } from 'express';

import { config } from '../config/index.js';
import { describeError, formatBytes, logEvent } from '../services/event-log.js';
import { createDefaultPdfTableExtractorDeps, extractPdfTableText, type PdfTableExtractorDeps } from '../services/pdf/pdf-table-extractor.js';

const DATA_URL_PREFIX_RE = /^data:application\/pdf;base64,/;

export interface PdfRouteDeps {
  extractPdfTableText: typeof extractPdfTableText;
  createExtractorDeps: () => PdfTableExtractorDeps;
}

const defaultDeps: PdfRouteDeps = {
  extractPdfTableText,
  createExtractorDeps: () => createDefaultPdfTableExtractorDeps(config.tesseract.path, config.tesseract.lang),
};

/**
 * Cria o router de importação de PDF. Aceita dependências injetáveis
 * (deps) para que os testes possam substituir a extração real por um
 * dublê, sem tocar em PDF/Tesseract de verdade — mesmo padrão de
 * routes/ocr.ts.
 */
export function createPdfRouter(deps: PdfRouteDeps = defaultDeps): Router {
  const router = Router();

  router.post('/pdf', (req, res, next) => {
    void (async () => {
      const body: unknown = req.body;
      const pdf = body && typeof body === 'object' && 'pdf' in body ? (body as { pdf?: unknown }).pdf : undefined;

      if (typeof pdf !== 'string' || pdf.trim().length === 0) {
        res.status(400).json({ error: 'Nenhum PDF recebido.' });
        return;
      }

      // Nome do arquivo (opcional): no SCM CutPlan a cor do material só aparece nele.
      const rawName = body && typeof body === 'object' && 'fileName' in body ? (body as { fileName?: unknown }).fileName : undefined;
      const fileName = typeof rawName === 'string' ? rawName.slice(0, 255) : undefined;

      const base64Data = pdf.replace(DATA_URL_PREFIX_RE, '');
      if (!base64Data) {
        res.status(400).json({ error: 'Nenhum PDF recebido.' });
        return;
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = Buffer.from(base64Data, 'base64');
      } catch {
        res.status(400).json({ error: 'PDF em base64 inválido.' });
        return;
      }

      if (pdfBuffer.byteLength === 0) {
        res.status(400).json({ error: 'PDF em base64 inválido.' });
        return;
      }

      logEvent('info', 'pdf', `PDF recebido: ${formatBytes(pdfBuffer.byteLength)}.`);
      const startedAt = Date.now();

      try {
        const text = await deps.extractPdfTableText(pdfBuffer, deps.createExtractorDeps(), { fileName });
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        logEvent('info', 'pdf', `PDF lido em ${seconds}s: ${text.trim().length} caracteres.`);
        res.status(200).json({ text });
      } catch (error) {
        logEvent('error', 'pdf', `Falha ao ler o PDF: ${describeError(error)}`);
        next(error);
      }
    })();
  });

  return router;
}
