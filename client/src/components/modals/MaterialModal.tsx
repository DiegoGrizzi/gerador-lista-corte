import { useEffect, useState } from 'react';

export interface MaterialModalProps {
  isOpen: boolean;
  onConfirm: (material: string) => void;
}

/** Quantidade mínima de letras/números (o resto — espaços, pontuação — não conta) para liberar a confirmação. */
const MIN_MATERIAL_CHARS = 4;

export function MaterialModal({ isOpen, onConfirm }: MaterialModalProps): JSX.Element {
  const [material, setMaterial] = useState('');

  // Espelha openMaterialModal() do legado, que sempre limpa o input ao abrir.
  useEffect(() => {
    if (isOpen) setMaterial('');
  }, [isOpen]);

  const canConfirm = material.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length >= MIN_MATERIAL_CHARS;

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
          <button
            className="primary"
            id="btn-material-confirm"
            disabled={!canConfirm}
            onClick={() => onConfirm(material)}
          >
            Confirmar material
          </button>
        </div>
      </div>
    </div>
  );
}
