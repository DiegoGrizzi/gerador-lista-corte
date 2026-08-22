import cors from 'cors';
import express, { type Express } from 'express';

import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { createOcrRouter, type OcrRouteDeps } from './routes/ocr.js';

/**
 * Fábrica do app Express, separada de index.ts para que os testes possam
 * importar o app (via supertest) sem abrir uma porta real.
 */
export function createApp(ocrRouteDeps?: OcrRouteDeps): Express {
  const app = express();

  app.use(express.json({ limit: config.bodyLimit }));
  app.use(cors({ origin: config.clientOrigin }));

  app.use('/api', createOcrRouter(ocrRouteDeps));

  app.use(errorHandler);

  return app;
}
