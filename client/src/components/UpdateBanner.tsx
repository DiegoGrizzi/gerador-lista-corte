import type { AutoUpdateStatus } from '../hooks/useAutoUpdate.js';

export interface UpdateBannerProps {
  status: AutoUpdateStatus;
  latestSummary: string;
  errorMessage: string;
  onApply: () => void;
}

/**
 * Balão de aviso de atualização, no topo da página — só aparece quando há
 * de fato uma versão nova disponível (status !== 'idle'). Ver
 * useAutoUpdate.ts para a máquina de estados completa.
 */
export function UpdateBanner({ status, latestSummary, errorMessage, onApply }: UpdateBannerProps): JSX.Element | null {
  if (status === 'idle') return null;

  return (
    <div className="update-banner" role="status">
      {status === 'available' ? (
        <>
          <p className="update-banner-text">
            <strong>Nova atualização disponível</strong>
            {latestSummary ? <span className="update-banner-summary"> — {latestSummary}</span> : null}
          </p>
          <button className="primary" onClick={onApply}>
            Atualizar agora
          </button>
        </>
      ) : null}

      {status === 'updating' ? <p className="update-banner-text">Atualizando o sistema, aguarde um instante...</p> : null}

      {status === 'restarting' ? (
        <p className="update-banner-text">Atualização concluída — reiniciando o servidor...</p>
      ) : null}

      {status === 'ready' ? (
        <>
          <p className="update-banner-text">
            <strong>Atualização concluída!</strong> Recarregue a página para usar a versão nova.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Recarregar agora
          </button>
        </>
      ) : null}

      {status === 'error' ? (
        <>
          <p className="update-banner-text update-banner-error">Não consegui atualizar: {errorMessage}</p>
          <button className="ghost" onClick={onApply}>
            Tentar novamente
          </button>
        </>
      ) : null}
    </div>
  );
}
