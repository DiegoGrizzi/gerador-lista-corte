import type { AutoUpdateStatus } from '../hooks/useAutoUpdate.js';

export interface UpdateBannerProps {
  status: AutoUpdateStatus;
  onApply: () => void;
}

/**
 * Balão de aviso no topo da página — só aparece quando há de fato uma
 * versão nova disponível (status === 'available'). A partir do clique em
 * "Atualizar agora", quem assume é o UpdateProgressModal (bloqueante) — ver
 * useAutoUpdate.ts para a máquina de estados completa.
 */
export function UpdateBanner({ status, onApply }: UpdateBannerProps): JSX.Element | null {
  if (status !== 'available') return null;

  return (
    <div className="update-banner" role="status">
      <p className="update-banner-text">
        <strong>Nova atualização disponível</strong>
      </p>
      <button className="primary" onClick={onApply}>
        Atualizar agora
      </button>
    </div>
  );
}
