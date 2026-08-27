export interface UpdateProgressModalProps {
  isOpen: boolean;
  isError: boolean;
  updating: boolean;
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Modal bloqueante mostrado enquanto a atualização roda ("updating"/
 * "restarting" em useAutoUpdate) — sem botão de fechar nesse meio tempo,
 * de propósito: a orientação é só clicar em "Atualizar agora" fora do meio
 * de uma lista, então trava a tela até terminar, evitando qualquer ação no
 * sistema no meio do processo. Só em caso de erro aparece um jeito de
 * sair (fechar ou tentar de novo).
 */
export function UpdateProgressModal({
  isOpen,
  isError,
  updating,
  errorMessage,
  onRetry,
  onClose,
}: UpdateProgressModalProps): JSX.Element {
  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="update-progress-modal-wrap">
      <div className="modal">
        {isError ? (
          <>
            <p className="title">Não consegui atualizar</p>
            <p className="sub">{errorMessage}</p>
            <div className="choice-row">
              <button className="primary" onClick={onRetry}>
                Tentar novamente
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
