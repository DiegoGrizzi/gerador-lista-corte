import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

/**
 * Tenta escutar a porta, com algumas tentativas se ela estiver ocupada
 * (EADDRINUSE). Isso cobre a auto-atualização (ver services/update/
 * run-update.ts): o processo novo é lançado ANTES do antigo liberar a
 * porta, então uma corrida de poucos milissegundos é esperada — sem o
 * retry, essa corrida derrubaria o processo novo em vez de só esperar.
 */
function listen(retriesLeft = 10): void {
  const server = app.listen(config.port, () => {
    console.log(`Gerador de Lista de Corte rodando em http://localhost:${config.port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
      setTimeout(() => listen(retriesLeft - 1), 500);
      return;
    }
    console.error('Erro ao iniciar o servidor:', err);
    process.exit(1);
  });
}

listen();
