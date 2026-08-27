/**
 * useAutoUpdate.ts
 * ---------------------------------------------------------------------------
 * Verifica periodicamente se há uma versão mais nova publicada no GitHub e
 * expõe um botão para aplicar a atualização sem precisar rodar o instalador
 * manualmente — o próprio servidor roda git pull + npm install + npm run
 * build e reinicia sozinho (ver POST /api/update/apply em
 * server/src/routes/update.ts).
 *
 * Enquanto atualiza ("updating"/"restarting"), a interface trava num modal
 * bloqueante (ver UpdateProgressModal) — a orientação é só clicar em
 * "Atualizar agora" fora do meio de uma lista, então não há necessidade de
 * proteger um trabalho em andamento: assim que o servidor volta a
 * responder, a página recarrega sozinha. Só uma falha (status "error")
 * mantém o modal aberto até o usuário fechar ou tentar de novo.
 * ---------------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyUpdate, checkForUpdate, pingUntilBackOnline } from '../lib/api/update.js';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos

export type AutoUpdateStatus = 'idle' | 'available' | 'updating' | 'restarting' | 'error';

export interface UseAutoUpdateResult {
  status: AutoUpdateStatus;
  latestSummary: string;
  errorMessage: string;
  applyNow: () => void;
  dismissError: () => void;
}

export function useAutoUpdate(): UseAutoUpdateResult {
  const [status, setStatus] = useState<AutoUpdateStatus>('idle');
  const [latestSummary, setLatestSummary] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // Só transiciona pra "available" a partir de "idle" — evita que uma
  // checagem periódica concorrente reabra o aviso enquanto já está
  // atualizando/reiniciando/com erro.
  const statusRef = useRef<AutoUpdateStatus>('idle');
  statusRef.current = status;

  const runCheck = useCallback(async () => {
    const result = await checkForUpdate();
    if (result.updateAvailable && statusRef.current === 'idle') {
      setLatestSummary(result.latestSummary || '');
      setStatus('available');
    }
  }, []);

  useEffect(() => {
    void runCheck();
    const interval = setInterval(() => void runCheck(), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runCheck]);

  const applyNow = useCallback(() => {
    setStatus('updating');
    setErrorMessage('');
    void (async () => {
      const result = await applyUpdate();
      if (!result.ok) {
        setStatus('error');
        setErrorMessage(result.error || 'Não consegui atualizar.');
        return;
      }

      setStatus('restarting');
      const backOnline = await pingUntilBackOnline();
      if (backOnline) {
        // Atualizado com sucesso e a orientação é só clicar em "Atualizar
        // agora" fora do meio de uma lista — recarrega direto, sem exigir
        // mais um clique.
        window.location.reload();
      } else {
        setStatus('error');
        setErrorMessage(
          'A atualização parece ter concluído, mas o servidor não voltou a responder — feche e abra o atalho de novo.',
        );
      }
    })();
  }, []);

  const dismissError = useCallback(() => {
    setStatus('idle');
    setErrorMessage('');
  }, []);

  return { status, latestSummary, errorMessage, applyNow, dismissError };
}
