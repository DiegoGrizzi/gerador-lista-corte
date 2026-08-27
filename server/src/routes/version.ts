import { Router } from 'express';

import { resolveProjectRoot } from '../services/update/project-root.js';
import { getLocalSha } from '../services/update/version.js';

export interface VersionRouteDeps {
  resolveProjectRoot: typeof resolveProjectRoot;
  getLocalSha: typeof getLocalSha;
}

const defaultDeps: VersionRouteDeps = { resolveProjectRoot, getLocalSha };

/**
 * Rota separada de /api/update de propósito: mostrar a versão instalada não
 * deve depender de internet (ao contrário de /api/update/check, que
 * consulta o GitHub) nem de AUTO_UPDATE_ENABLED — é só uma informação de
 * diagnóstico ("o que está rodando agora"), útil até quando o auto-update
 * está desligado ou sem conexão.
 */
export function createVersionRouter(deps: VersionRouteDeps = defaultDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    void (async () => {
      try {
        const projectRoot = deps.resolveProjectRoot();
        const sha = await deps.getLocalSha(projectRoot);
        res.status(200).json({ sha });
      } catch {
        // Instalação sem git (zip) ou algo assim - não é um erro pro
        // usuário, só não tem como saber a versão.
        res.status(200).json({ sha: null });
      }
    })();
  });

  return router;
}
