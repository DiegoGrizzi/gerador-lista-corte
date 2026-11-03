import { useEffect, useState } from 'react';
import { copyText } from '../../lib/copyText.js';

export interface UpdateProgressModalProps {
  isOpen: boolean;
  isError: boolean;
  updating: boolean;
  errorMessage: string;
  /** Versão instalada (sha curto), incluída no texto copiado para suporte. */
  version?: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Modal bloqueante mostrado enquanto a atualização roda ("updating"/
 * "restarting" em useAutoUpdate) — sem botão de fechar nesse meio tempo,
 * de propósito: a orientação é só clicar em "Atualizar agora" fora do meio
 * de uma lista, então trava a tela até terminar, evitando qualquer ação no
 * sistema no meio do processo. Só em caso de erro aparece um jeito de
 * sair (fechar ou tentar de novo) e de copiar o erro completo para mandar
 * ao suporte.
 */
export function UpdateProgressModal({
  isOpen,
  isError,
  updating,
  errorMessage,
  version,
  onRetry,
  onClose,
}: UpdateProgressModalProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isError) setCopied(false);
  }, [isError]);

  const handleCopy = (): void => {
    const header = version ? 'Versão: ' + version + '\n' : '';
    void copyText(header + errorMessage).then((ok) => setCopied(ok));
  };

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="update-progress-modal-wrap">
      <div className="modal">
        {isError ? (
          <>
            <p className="title">Não consegui atualizar</p>
            <pre
              className="sub"
              id="update-error-text"
              style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', userSelect: 'text', textAlign: 'left' }}
            >
              {errorMessage}
            </pre>
            <div className="choice-row">
              <button className="primary" onClick={onRetry}>
                Tentar novamente
              </button>
              <button id="btn-copy-update-error" onClick={handleCopy}>
                {copied ? 'Copiado ✓' : 'Copiar erro'}
              </button>
              <button className="ghost" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="title">Atualizando o sistema</p>
            <p className="sub">
              {updating
                ? 'Baixando e instalando a versão mais recente — não feche nem recarregue a página.'
                : 'Quase lá — reiniciando o servidor. A página vai recarregar sozinha em instantes.'}
            </p>
            <div className="update-spinner" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}
