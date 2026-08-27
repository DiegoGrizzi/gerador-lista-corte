/**
 * project-root.ts
 * ---------------------------------------------------------------------------
 * Descobre a raiz do monorepo em runtime, a partir do próprio arquivo
 * compilado (server/dist/services/update/project-root.js) — mesmo padrão já
 * usado em app.ts para achar client/dist: robusto independente de
 * process.cwd(), que muda conforme quem inicia o processo (o launcher de
 * produção seta cwd = server/, mas `npm run dev`/testes rodam de outros
 * diretórios).
 * ---------------------------------------------------------------------------
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Confere a presença do próprio repositório git como sanity check — se
 * algum dia a profundidade de pastas mudar (build reorganizado), falha alto
 * e cedo com uma mensagem clara, em vez de rodar git/npm silenciosamente no
 * lugar errado. Também cobre o caso de uma instalação feita via zip (sem
 * git) — auto-atualização não tem como funcionar nela.
 */
export function resolveProjectRoot(): string {
  const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  if (!existsSync(path.join(candidate, '.git')) || !existsSync(path.join(candidate, 'package.json'))) {
    throw new Error('Esta instalação não tem um repositório git válido — a atualização automática não está disponível.');
  }
  return candidate;
}
