import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware de erro do Express (precisa ter 4 parâmetros para ser
 * reconhecido como tal). Sempre responde com JSON e nunca vaza stack
 * trace para o cliente.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error('Erro não tratado:', err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: 'Erro interno do servidor.' });
}
