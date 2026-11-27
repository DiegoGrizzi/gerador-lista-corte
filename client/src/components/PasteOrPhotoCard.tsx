import { useEffect, useRef } from 'react';

import { getPastedFiles, toFileList } from '../pasted-files.js';

export interface PasteOrPhotoCardProps {
  rawText: string;
  onRawTextChange: (text: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
  photoStatus: string;
  photoStatusIsError: boolean;
  photoInputKey: number;
  onFilesSelected: (fileList: FileList | null) => void;
  pdfInputKey: number;
  onPdfFilesSelected: (fileList: FileList | null) => void;
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
  pdfInputKey,
  onPdfFilesSelected,
}: PasteOrPhotoCardProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+V com um PDF (ou foto/print) na área de transferência faz o mesmo que
  // os botões "Enviar PDF" / "Enviar foto". Vale em qualquer lugar da página;
  // colar texto continua colando texto (ver pasted-files.ts).
  const onFilesSelectedRef = useRef(onFilesSelected);
  const onPdfFilesSelectedRef = useRef(onPdfFilesSelected);
  onFilesSelectedRef.current = onFilesSelected;
  onPdfFilesSelectedRef.current = onPdfFilesSelected;
  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      const pasted = getPastedFiles(event.clipboardData);
      if (!pasted) return;
      event.preventDefault();
      if (pasted.pdfs.length > 0) onPdfFilesSelectedRef.current(toFileList(pasted.pdfs));
      if (pasted.images.length > 0) onFilesSelectedRef.current(toFileList(pasted.images));
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  return (
    <div className="card">
      <h2>1. Colar mensagem ou enviar foto</h2>
      <p className="hint">
        Reconhece blocos de material (linhas com &quot;MDF&quot;) e peças no formato{' '}
        <code>quantidade=comprimento/largura</code>. As demais informações ficará na lista de conferência.{' '}
        Também dá para copiar um PDF ou uma foto e colar aqui com <strong>Ctrl+V</strong>, sem usar os botões.
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
          Enviar foto
        </button>
        <input
          key={`photo-${photoInputKey}`}
          ref={fileInputRef}
          type="file"
          id="photo-input"
          accept="image/*"
          multiple
          className="visually-hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <button className="ghost" id="btn-send-pdf" onClick={() => pdfInputRef.current?.click()}>
          Enviar PDF
        </button>
        <input
          key={`pdf-${pdfInputKey}`}
          ref={pdfInputRef}
          type="file"
          id="pdf-input"
          accept="application/pdf"
          multiple
          className="visually-hidden"
          onChange={(e) => onPdfFilesSelected(e.target.files)}
        />
        <span className={'photo-status' + (photoStatusIsError ? ' error' : '')}>{photoStatus}</span>
      </div>
    </div>
  );
}
