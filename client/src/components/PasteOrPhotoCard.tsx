import { useRef } from 'react';

export interface PasteOrPhotoCardProps {
  rawText: string;
  onRawTextChange: (text: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
  photoStatus: string;
  photoStatusIsError: boolean;
  photoInputKey: number;
  onFilesSelected: (fileList: FileList | null) => void;
}

const PLACEHOLDER = `MDF (titânio de 15mm fitado um lado maior)
2=47/47
2=56'5/42
...`;

export function PasteOrPhotoCard({
  rawText,
  onRawTextChange,
  onAnalyze,
  onClear,
  photoStatus,
  photoStatusIsError,
  photoInputKey,
  onFilesSelected,
}: PasteOrPhotoCardProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card">
      <h2>1. Colar mensagem ou enviar foto</h2>
      <p className="hint">
        Reconhece blocos de material (linhas com &quot;MDF&quot;) e peças no formato{' '}
        <code>quantidade=comprimento/largura</code>. As demais informações ficará na lista de conferência.
      </p>

      <div className="field">
        <label htmlFor="raw-text">Mensagem</label>
        <textarea
          id="raw-text"
          placeholder={PLACEHOLDER}
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button className="primary" id="btn-analyze" onClick={onAnalyze}>
          Analisar mensagem
        </button>
        <button className="ghost" id="btn-clear-input" onClick={onClear}>
          Limpar
        </button>
        <span className="divider-v" />
        <button className="ghost" id="btn-send-photo" onClick={() => fileInputRef.current?.click()}>
          <strong>Enviar foto</strong>
        </button>
        <input
          key={photoInputKey}
          ref={fileInputRef}
          type="file"
          id="photo-input"
          accept="image/*"
          multiple
          className="visually-hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <span className={'photo-status' + (photoStatusIsError ? ' error' : '')}>{photoStatus}</span>
      </div>
    </div>
  );
}
