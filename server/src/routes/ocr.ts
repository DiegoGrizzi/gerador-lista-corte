import { Router } from 'express';

import { config } from '../config/index.js';
import { runOcrWithFallback, type OcrOrchestratorProviders } from '../services/ocr/ocr-orchestrator.js';
import { OcrSpaceProvider } from '../services/ocr/ocr-space-provider.js';
import { TesseractOcrProvider } from '../services/ocr/tesseract-provider.js';
import { OcrFailureError } from '../services/ocr/types.js';

const DATA_URL_PREFIX_RE = /^data:image\/\w+;base64,/;

export interface OcrRouteDeps {
  runOcr: typeof runOcrWithFallback;
  createProviders: () => OcrOrchestratorProviders;
}

function defaultCreateProviders(): OcrOrchestratorProviders {
  return {
    primary: new TesseractOcrProvider({ tesseractPath: config.tesseract.path, lang: config.tesseract.lang }),
    fallback: new OcrSpaceProvider({ apiKey: config.ocrSpace.apiKey, endpoint: config.ocrSpace.endpoint }),
  };
}

const defaultDeps: OcrRouteDeps = {
  runOcr: runOcrWithFallback,
  createProviders: defaultCreateProviders,
};

/**
 * Cria o router de OCR. Aceita dependências injetáveis (deps) para que os
 * testes possam substituir os providers reais e a função de orquestração
 * por dublês, sem tocar em Tesseract ou rede.
 */
export function createOcrRouter(deps: OcrRouteDeps = defaultDeps): Router {
  const router = Router();

  router.post('/ocr', (req, res, next) => {
    void (async () => {
      const body: unknown = req.body;
      const image =
        body && typeof body === 'object' && 'image' in body ? (body as { image?: unknown }).image : undefined;

      if (typeof image !== 'string' || image.trim().length === 0) {
        res.status(400).json({ error: 'Nenhuma imagem recebida.' });
        return;
      }

      const base64Data = image.replace(DATA_URL_PREFIX_RE, '');
      if (!base64Data) {
        res.status(400).json({ error: 'Nenhuma imagem recebida.' });
        return;
      }

      let imageBuffer: Buffer;
      try {
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch {
        res.status(400).json({ error: 'Imagem em base64 inválida.' });
        return;
      }

      if (imageBuffer.byteLength === 0) {
        res.status(400).json({ error: 'Imagem em base64 inválida.' });
        return;
      }

      try {
        const providers = deps.createProviders();
        const result = await deps.runOcr(imageBuffer, providers, {
          minUsefulChars: config.ocrFallback.minUsefulChars,
        });
        res.status(200).json({ text: result.text, engine: result.engine });
      } catch (error) {
        if (error instanceof OcrFailureError) {
          res.status(502).json({ error: error.message });
          return;
        }
        next(error);
      }
    })();
  });

  return router;
}
