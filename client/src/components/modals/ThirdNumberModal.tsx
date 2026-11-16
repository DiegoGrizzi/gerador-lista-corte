export interface ThirdNumberModalProps {
  isOpen: boolean;
  onAnswered: (choice: 'quantity' | 'thickness') => void;
}

/**
 * Pergunta disparada quando a lista tem linhas "230x25x4" em que o terceiro
 * número pode ser a quantidade ou a espessura da chapa (todos os valores
 * seriam espessuras plausíveis, ver resolveThreeNumberLines em
 * @corte-cloud/parser). Só aparece nesse caso; quando algum valor não pode
 * ser espessura (1, 2, 4, 5...), o leitor decide sozinho. A resposta vale para
 * todas as linhas desse formato na lista.
 */
export function ThirdNumberModal({ isOpen, onAnswered }: ThirdNumberModalProps): JSX.Element {
  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="third-number-modal-wrap">
      <div className="modal">
        <p className="title">O terceiro número é a quantidade ou a espessura?</p>
        <p className="sub">
          Em linhas como "230x25x4" não dá para saber. Qual é o caso? Vale para todas as linhas
          escritas assim nesta lista.
        </p>
        <div className="choice-row">
          <button
            className="primary"
            id="btn-third-number-quantity"
            onClick={() => onAnswered('quantity')}
          >
            Quantidade (4 peças)
          </button>
          <button
            className="primary"
            id="btn-third-number-thickness"
            onClick={() => onAnswered('thickness')}
          >
            Espessura (4mm, 1 peça)
          </button>
        </div>
      </div>
    </div>
  );
}
