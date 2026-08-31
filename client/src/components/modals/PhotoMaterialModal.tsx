import { useEffect, useState } from 'react';
import type { PhotoMaterialPrompt } from '../../hooks/useOcrUpload.js';

export interface PhotoMaterialModalProps {
  isOpen: boolean;
  prompt: PhotoMaterialPrompt | null;
  onConfirm: (material: string) => void;
  onInherit: () => void;
}

export function PhotoMaterialModal({ isOpen, prompt, onConfirm, onInherit }: PhotoMaterialModalProps): JSX.Element {
  const [material, setMaterial] = useState('');

  // Cada foto nova traz um `prompt` novo — limpa o campo, como
  // askMaterialForPhoto() do legado faz a cada chamada.
  useEffect(() => {
    setMaterial('');
  }, [prompt]);

  const canConfirm = material.trim().length > 0;

  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="photo-material-modal-wrap">
      <div className="modal">
        <p className="title" id="photo-material-title">
          {prompt?.title ?? 'Qual o material dessa foto?'}
        </p>
        <p className="sub" id="photo-material-sub">
          {prompt?.sub ?? 'Informe o material dessa foto para continuar.'}
        </p>
        <img
          id="photo-material-preview"
          alt="Pré-visualização da foto"
          className="photo-preview"
          src={prompt?.previewUrl ?? ''}
        />
        <label htmlFor="photo-material-input">Material</label>
        <input
          type="text"
          id="photo-material-input"
          className="modal-field"
          placeholder="Ex: branco 15mm"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm(material);
          }}
        />
        <div className="choice-row">
          <button
            className="primary"
            id="btn-photo-material-confirm"
            disabled={!canConfirm}
            onClick={() => onConfirm(material)}
          >
            Confirmar
          </button>
          <button
            className={'accent-blue' + (prompt?.isFirst === false ? '' : ' hidden')}
            id="btn-photo-material-inherit"
            onClick={onInherit}
          >
            Herdar material anterior
          </button>
        </div>
      </div>
    </div>
  );
}
