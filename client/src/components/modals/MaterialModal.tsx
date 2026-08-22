import { useEffect, useState } from 'react';

export interface MaterialModalProps {
  isOpen: boolean;
  onConfirm: (material: string) => void;
  onSkip: () => void;
}

export function MaterialModal({ isOpen, onConfirm, onSkip }: MaterialModalProps): JSX.Element {
  const [material, setMaterial] = useState('');

  // Espelha openMaterialModal() do legado, que sempre limpa o input ao abrir.
  useEffect(() => {
    if (isOpen) setMaterial('');
  }, [isOpen]);

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="material-modal-wrap">
      <div className="modal">
        <p className="title">Não encontrei o material na mensagem</p>
        <p className="sub">
          Qual material foi usado nessas peças? Isso será aplicado a toda a lista (você ainda pode ajustar linha por
          linha depois).
        </p>
        <label htmlFor="material-input">Material</label>
        <input
          type="text"
          id="material-input"
          className="modal-field"
          placeholder="Ex: MDF branco 15mm"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
        />
        <div className="choice-row">
          <button className="primary" id="btn-material-confirm" onClick={() => onConfirm(material)}>
            Confirmar material
          </button>
          <button className="ghost" id="btn-material-skip" onClick={onSkip}>
            Pular por enquanto
          </button>
        </div>
      </div>
    </div>
  );
}
