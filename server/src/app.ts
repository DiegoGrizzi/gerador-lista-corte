import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express, { type Express } from 'express';

import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { createOcrRouter, type OcrRouteDeps } from './routes/ocr.js';
import { createUpdateRouter, type UpdateRouteDeps } from './routes/update.js';

/**
 * Build do client (Vite), gerado por `npm run build --workspace=client`.
 * Em desenvolvimento (`npm run dev`) essa pasta não existe — o client roda
 * no próprio servidor do Vite, que faz proxy de /api para cá (ver
 * client/vite.config.ts) — então servir estático fica condicionado à pasta
 * existir, sem afetar o fluxo de desenvolvimento.
 */
const CLIENT_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/**
 * Fábrica do app Express, separada de index.ts para que os testes possam
 * importar o app (via supertest) sem abrir uma porta real.
 */
export function createApp(ocrRouteDeps?: OcrRouteDeps, updateRouteDeps?: UpdateRouteDeps): Express {
  const app = express();

  app.use(express.json({ limit: config.bodyLimit }));
  app.use(cors({ origin: config.clientOrigin }));

  app.use('/api', createOcrRouter(ocrRouteDeps));
  app.use('/api/update', createUpdateRouter(updateRouteDeps));

  // Quando existe um build do client, o próprio servidor Express serve a
  // interface — um único processo, uma única porta, sem depender do Vite
  // dev server. É o modo usado em produção (ver npm run serve na raiz).
  if (existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
  }

  app.use(errorHandler);

  return app;
}
