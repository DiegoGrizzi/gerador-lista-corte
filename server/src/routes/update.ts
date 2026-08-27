import { Router, type NextFunction, type Request, type Response } from 'express';

import { config } from '../config/index.js';
import { resolveProjectRoot } from '../services/update/project-root.js';
import { getLatestCommitInfo, getLocalSha, hasUncommittedChanges } from '../services/update/version.js';
import { restartServer, runUpdateSteps } from '../services/update/run-update.js';

export interface UpdateRouteDeps {
  resolveProjectRoot: typeof resolveProjectRoot;
  getLocalSha: typeof getLocalSha;
  getLatestCommitInfo: typeof getLatestCommitInfo;
  hasUncommittedChanges: typeof hasUncommittedChanges;
  runUpdateSteps: typeof runUpdateSteps;
  restartServer: typeof restartServer;
}

const defaultDeps: UpdateRouteDeps = {
  resolveProjectRoot,
  getLocalSha,
  getLatestCommitInfo,
  hasUncommittedChanges,
  runUpdateSteps,
  restartServer,
};

/**
 * Só aceita chamadas vindas da própria máquina — este endpoint roda git/npm
 * e reinicia o servidor; mesmo o servidor já escutando em todas as
 * interfaces (uso normal na rede da loja), essa rota específica não deve
 * ficar acessível para qualquer dispositivo na mesma rede.
 */
function requireLocalhost(req: Request, res: Response, next: NextFunction): void {
  const ip = req.socket.remoteAddress || '';
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLoopback) {
    res.status(403).json({ error: 'Só disponível localmente.' });
    return;
  }
  next();
}

/**
 * Cria o router de atualização. Aceita dependências injetáveis (deps) para
 * que os testes possam substituir git/npm/rede reais por dublês — mesmo
 * padrão de createOcrRouter.
 */
export function createUpdateRouter(deps: UpdateRouteDeps = defaultDeps): Router {
  const router = Router();
  router.use(requireLocalhost);

  router.get('/check', (_req, res) => {
    void (async () => {
      if (!config.autoUpdateEnabled) {
        res.status(200).json({ updateAvailable: false });
        return;
      }
      try {
        const projectRoot = deps.resolveProjectRoot();
        const [currentSha, latest] = await Promise.all([deps.getLocalSha(projectRoot), deps.getLatestCommitInfo()]);
        res.status(200).json({
          updateAvailable: currentSha !== latest.sha,
          currentSha,
          latestSha: latest.sha,
        });
      } catch (error) {
        // Sem internet, GitHub fora do ar, instalação sem git — nunca é um
        // erro fatal, só significa "não dá pra saber agora".
        const message = error instanceof Error ? error.message : 'Não consegui verificar atualizações.';
        res.status(200).json({ updateAvailable: false, error: message });
      }
    })();
  });

  router.post('/apply', (_req, res) => {
    void (async () => {
      if (!config.autoUpdateEnabled) {
        res.status(200).json({ ok: false, error: 'Atualização automática desativada nesta instalação.' });
        return;
      }

      let projectRoot: string;
      try {
        projectRoot = deps.resolveProjectRoot();
      } catch (error) {
        res.status(200).json({ ok: false, error: error instanceof Error ? error.message : 'Falha desconhecida.' });
        return;
      }

      if (await deps.hasUncommittedChanges(projectRoot)) {
        res.status(200).json({
          ok: false,
          error: 'Há alterações não salvas na instalação local — atualização cancelada por segurança.',
        });
        return;
      }

      const result = await deps.runUpdateSteps(projectRoot);
      if (!result.ok) {
        res.status(200).json(result);
        return;
      }

      res.status(200).json({ ok: true, restarting: true });
      // Só reinicia DEPOIS de responder — ver comentário em restartServer.
      deps.restartServer(projectRoot);
    })();
  });

  return router;
}
