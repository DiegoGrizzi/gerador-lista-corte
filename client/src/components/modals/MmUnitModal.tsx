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
