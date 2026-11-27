import type { NextFunction, Request, Response } from 'express';

import { describeError, logEvent } from '../services/event-log.js';

/**
 * Middleware de erro do Express (precisa ter 4 parâmetros para ser
 * reconhecido como tal). Sempre responde com JSON e nunca vaza stack
 * trace para o cliente.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error('Erro não tratado:', err);
  logEvent('error', 'servidor', `Erro não tratado em ${req.method} ${req.path}: ${describeError(err)}`);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: 'Erro interno do servidor.' });
}
