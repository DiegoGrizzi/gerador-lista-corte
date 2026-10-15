import { useEffect, useState } from 'react';

export interface MaterialColorModalProps {
  isOpen: boolean;
  /** Rótulo do material que está sem cor, ex: "MDF 6mm". */
  material: string;
  onConfirm: (color: string) => void;
  onSkip: () => void;
}

/** Mínimo de letras para liberar a confirmação (evita confirmar sem querer um "b" digitado pela metade). */
const MIN_COLOR_CHARS = 3;

/**
 * Pergunta disparada quando um material aparece só como "MDF" (com ou sem a
 * espessura, ex: "MDF 6") — reconhecido como material, mas sem cor. Vale só
 * para as peças DESSE material, diferente do modal "não encontrei o material",
 * que vale para a lista toda.
 */
export function MaterialColorModal({ isOpen, material, onConfirm, onSkip }: MaterialColorModalProps): JSX.Element {
  const [color, setColor] = useState('');

  useEffect(() => {
    if (isOpen) setColor('');
  }, [isOpen, material]);

  const canConfirm = color.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length >= MIN_COLOR_CHARS;

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="material-color-modal-wrap">
      <div className="modal">
        <p className="title">Qual a cor do {material}?</p>
        <p className="sub">
          O material "{material}" veio sem a cor. A cor informada será aplicada às peças desse material (você ainda
          pode ajustar linha por linha depois).
        </p>
        <label htmlFor="material-color-input">Cor</label>
        <input
          type="text"
          id="material-color-input"
          className="modal-field"
          placeholder="Ex: Branco"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm(color);
          }}
        />
        <div className="choice-row">
          <button className="primary" id="btn-material-color-confirm" disabled={!canConfirm} onClick={() => onConfirm(color)}>
            Confirmar cor
          </button>
          <button id="btn-material-color-skip" onClick={onSkip}>
            Deixar sem cor
          </button>
        </div>
      </div>
    </div>
  );
}
