import { useEffect, useState } from 'react';
import type { FitamentoType } from '@corte-cloud/parser';

export interface FitaMissingModalProps {
  isOpen: boolean;
  onAnswered: (fitaType: FitamentoType) => void;
}

const SIDE_OPTIONS: { value: FitamentoType; label: string }[] = [
  { value: 'all', label: 'Todos os 4 lados' },
  { value: 'maior-um', label: '1 lado maior' },
  { value: 'maior-dois', label: '2 lados maiores' },
  { value: 'menor-um', label: '1 lado menor' },
  { value: 'menor-dois', label: '2 lados menores' },
];

/**
 * Pergunta disparada quando alguma peça chegou ao fim da mensagem sem
 * NENHUMA informação de fita (ver Piece.fitaUnknown em @corte-cloud/parser)
 * — diferente do modal de "3L" (ambíguo entre dois casos específicos),
 * aqui não se sabe nada, então pergunta primeiro SE vai ter fita, e só
 * depois QUAIS lados. A resposta se aplica a TODAS as peças sem fita
 * nesta mensagem (mesma convenção usada no resto da lista — ver
 * ThreeLadosModal/MaterialModal).
 */
export function FitaMissingModal({ isOpen, onAnswered }: FitaMissingModalProps): JSX.Element {
  const [showSidesStep, setShowSidesStep] = useState(false);

  // Toda vez que o modal (re)abre, volta pro passo 1 — mesmo comportamento
  // do MmUnitModal.
  useEffect(() => {
    if (isOpen) setShowSidesStep(false);
  }, [isOpen]);

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="fita-missing-modal-wrap">
      <div className="modal">
        <p className="title">Não encontrei fita em algumas peças</p>
        <p className="sub">
          Essas peças vão ter fitamento? Vale para todas as peças sem nenhuma informação de fita nesta lista (você
          ainda pode ajustar linha por linha depois).
        </p>

        <div id="fita-missing-step1" className={'choice-row' + (showSidesStep ? ' hidden' : '')}>
          <button className="primary" id="btn-fita-missing-sim" onClick={() => setShowSidesStep(true)}>
            Sim, vai ter fita
          </button>
          <button id="btn-fita-missing-nao" onClick={() => onAnswered('none-explicit')}>
            Não, sem fita
          </button>
        </div>

        <div id="fita-missing-step2" className={showSidesStep ? '' : 'hidden'}>
          <p className="sub">Em quais lados?</p>
          <div className="choice-row">
            {SIDE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className="primary"
                id={`btn-fita-missing-${option.value}`}
                onClick={() => onAnswered(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
