import { useEffect, useState } from 'react';

export interface MmUnitModalProps {
  isOpen: boolean;
  onAnswered: (factor: number) => void;
}

const UNIT_OPTIONS = [
  { value: 10, label: 'Centímetros (cm)' },
  { value: 1000, label: 'Metros (m)' },
];

export function MmUnitModal({ isOpen, onAnswered }: MmUnitModalProps): JSX.Element {
  const [showUnitStep, setShowUnitStep] = useState(false);
  const [unit, setUnit] = useState(UNIT_OPTIONS[0]!.value);

  // Toda vez que o modal (re)abre, volta pro passo 1 — mesmo comportamento
  // de openMmModal() no legado, que sempre reseta os passos ao abrir.
  useEffect(() => {
    if (isOpen) {
      setShowUnitStep(false);
      setUnit(UNIT_OPTIONS[0]!.value);
    }
  }, [isOpen]);

  // Ouvinte no document, em vez de onKeyDown no próprio modal: os botões
  // "Sim"/"Não" não recebem foco sozinhos ao abrir (nenhum autoFocus), então
  // um onKeyDown local dependia do usuário já ter clicado dentro do modal
  // antes de apertar Enter (o evento só propaga a partir de quem está com
  // foco) - na prática o Enter simplesmente não fazia nada.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Enter confirma a etapa atual - "Sim, já em mm" (passo 1) ou
      // "Converter para mm" (passo 2, se o usuário já escolheu "Não").
      if (e.key !== 'Enter') return;
      if (showUnitStep) {
        onAnswered(unit);
      } else {
        onAnswered(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showUnitStep, unit, onAnswered]);

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="mm-modal-wrap">
      <div className="modal">
        <p className="title">As medidas já estão em milímetros (mm)?</p>
        <p className="sub">Confira antes de revisar as peças — evita peças cortadas na medida errada.</p>

        <div id="mm-modal-step1" className={'choice-row' + (showUnitStep ? ' hidden' : '')}>
          <button className="primary" id="btn-mm-sim" onClick={() => onAnswered(1)}>
            Sim, já em mm
          </button>
          <button id="btn-mm-nao" onClick={() => setShowUnitStep(true)}>
            Não
          </button>
        </div>

        <div id="mm-modal-step2" className={showUnitStep ? '' : 'hidden'}>
          <label htmlFor="unit-select">Em qual unidade estão as medidas?</label>
          <select
            id="unit-select"
            className="modal-field"
            value={unit}
            onChange={(e) => setUnit(Number(e.target.value))}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="primary btn-block" id="btn-convert" onClick={() => onAnswered(unit)}>
            Converter para mm e continuar
          </button>
        </div>
      </div>
    </div>
  );
}
