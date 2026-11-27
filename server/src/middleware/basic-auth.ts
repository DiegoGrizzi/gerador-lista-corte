import { createHash, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export interface BasicAuthCredentials {
  user: string;
  password: string;
}

/**
 * Caminhos que respondem sem senha. Só a versão: é o que o HEALTHCHECK do
 * Docker consulta de dentro do container, e não revela nada além do código
 * do commit instalado.
 */
const OPEN_PATHS = new Set(['/api/version', '/api/version/']);

/**
 * Compara em tempo constante. O hash deixa as duas pontas com o mesmo
 * tamanho, que é o que o timingSafeEqual exige.
 */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function readCredentials(header: string | undefined): BasicAuthCredentials | undefined {
  if (!header?.startsWith('Basic ')) return undefined;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return undefined;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * Pede usuário e senha (HTTP Basic) antes de qualquer página ou rota da API.
 * O sistema não tem login próprio: isto é o que permite deixá-lo num
 * endereço público, atrás de um proxy com HTTPS. Só é ligado quando
 * BASIC_AUTH_USER e BASIC_AUTH_PASSWORD estão definidos (ver config).
 */
export function createBasicAuth(expected: BasicAuthCredentials) {
  return function basicAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' && OPEN_PATHS.has(req.path)) {
      next();
      return;
    }

    const received = readCredentials(req.headers.authorization);
    // Compara os dois campos sempre, para o tempo de resposta não dizer qual errou.
    const userOk = safeEqual(received?.user ?? '', expected.user);
    const passwordOk = safeEqual(received?.password ?? '', expected.password);
    if (received && userOk && passwordOk) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Gerador de Lista de Corte", charset="UTF-8"');
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  };
}
