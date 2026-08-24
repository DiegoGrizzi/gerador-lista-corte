export interface ThreeLadosModalProps {
  isOpen: boolean;
  onAnswered: (choice: 'maior' | 'menor') => void;
}

/**
 * Pergunta disparada quando alguma peça trouxe o código "3L" (3 dos 4 lados
 * fitados, ver Piece.pendingThreeLados em @corte-cloud/parser) — ambíguo
 * entre "2 lados maiores + 1 menor" e "2 lados menores + 1 maior", então só
 * o usuário pode decidir. A resposta se aplica a TODAS as peças com "3L"
 * nesta mensagem (mesma convenção usada no resto da lista).
 */
export function ThreeLadosModal({ isOpen, onAnswered }: ThreeLadosModalProps): JSX.Element {
  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="three-lados-modal-wrap">
      <div className="modal">
        <p className="title">Peças com "3L" — fita em 3 dos 4 lados</p>
        <p className="sub">
          Isso pode ser 2 lados maiores + 1 menor, ou 2 lados menores + 1 maior. Qual é o caso? Vale para todas as
          peças marcadas "3L" nesta lista.
        </p>
        <div className="choice-row">
          <button className="primary" id="btn-three-lados-maior" onClick={() => onAnswered('maior')}>
            2 lados maiores + 1 menor
          </button>
          <button className="primary" id="btn-three-lados-menor" onClick={() => onAnswered('menor')}>
            2 lados menores + 1 maior
          </button>
        </div>
      </div>
    </div>
  );
}
