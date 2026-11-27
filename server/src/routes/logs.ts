import { Router } from 'express';

import { getLogEntries } from '../services/event-log.js';

/**
 * GET /api/logs — o que alimenta a aba "Log" da interface. Devolve o
 * registro em memória das últimas leituras (ver services/event-log.ts).
 */
export function createLogsRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ entries: getLogEntries() });
  });

  return router;
}
