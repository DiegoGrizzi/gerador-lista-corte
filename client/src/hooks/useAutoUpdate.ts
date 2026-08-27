/**
 * useAutoUpdate.ts
 * ---------------------------------------------------------------------------
 * Verifica se há uma versão mais nova publicada no GitHub e expõe um botão
 * para aplicar a atualização sem precisar rodar o instalador manualmente —
 * o próprio servidor roda git pull + npm install (se precisar) + npm run
 * build e reinicia sozinho (ver POST /api/update/apply em
 * server/src/routes/update.ts).
 *
 * A checagem roda sozinha, sem o usuário precisar apertar F5 — ele não tem
 * como saber que isso ajudaria: ao montar, a cada CHECK_INTERVAL_MS
 * (enquanto a aba fica aberta e visível o tempo todo) e, mais importante na
 * prática, toda vez que a aba VOLTA a ficar visível (troca de aba, janela
 * minimizada, tela que apagou) — o momento mais comum em que alguém volta
 * pra usar o sistema depois de um tempo parado, exatamente quando vale a
 * pena conferir de novo.
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

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
// Evita que uma sequência rápida de trocas de aba (várias vezes em poucos
// segundos) dispare uma checagem a cada troca — no mínimo esse intervalo
// entre duas checagens via "aba voltou a ficar visível".
const MIN_MS_BETWEEN_VISIBILITY_CHECKS = 30 * 1000;

export type AutoUpdateStatus = 'idle' | 'available' | 'updating' | 'restarting' | 'error';

export interface UseAutoUpdateResult {
  status: AutoUpdateStatus;
  errorMessage: string;
  applyNow: () => void;
  dismissError: () => void;
}

export function useAutoUpdate(): UseAutoUpdateResult {
  const [status, setStatus] = useState<AutoUpdateStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Só transiciona pra "available" a partir de "idle" — evita que uma
  // checagem periódica concorrente reabra o aviso enquanto já está
  // atualizando/reiniciando/com erro.
  const statusRef = useRef<AutoUpdateStatus>('idle');
  statusRef.current = status;

  const lastCheckAtRef = useRef(0);

  const runCheck = useCallback(async () => {
    lastCheckAtRef.current = Date.now();
    const result = await checkForUpdate();
    if (result.updateAvailable && statusRef.current === 'idle') {
      setStatus('available');
    }
  }, []);

  useEffect(() => {
    void runCheck();
    const interval = setInterval(() => void runCheck(), CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckAtRef.current < MIN_MS_BETWEEN_VISIBILITY_CHECKS) return;
      void runCheck();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

  return { status, errorMessage, applyNow, dismissError };
}
