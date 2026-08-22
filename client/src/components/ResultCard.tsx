import type { Ref } from 'react';
import type { Piece } from '@corte-cloud/parser';
import { RESULT_COLUMNS } from '../state/cutListReducer.js';

export interface ResultCardProps {
  pieces: Piece[];
  copied: boolean;
  onCopy: () => void;
  onNewList: () => void;
  containerRef: Ref<HTMLDivElement>;
}

function pieceToCells(piece: Piece): string[] {
  return [
    String(piece.qtd),
    String(piece.compr),
    String(piece.larg),
    piece.funcao,
    piece.fita.c1 ? 'X' : '',
    piece.fita.c2 ? 'X' : '',
    piece.fita.l1 ? 'X' : '',
    piece.fita.l2 ? 'X' : '',
    piece.material,
    piece.complemento,
  ];
}

export function ResultCard({ pieces, copied, onCopy, onNewList, containerRef }: ResultCardProps): JSX.Element {
  return (
    <div className="card" id="result-card" ref={containerRef}>
      <div className="result-header">
        <h2>3. Lista pronta</h2>
        <span className="badge-ok">medidas em mm</span>
      </div>
      <p className="hint">Clique em copiar e cole direto no CorteCloud.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr id="result-head">
              {RESULT_COLUMNS.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody id="result-body">
            {pieces.map((piece) => (
              <tr key={piece.id}>
                {pieceToCells(piece).map((cell, i) => (
                  <td key={RESULT_COLUMNS[i]} data-label={RESULT_COLUMNS[i]}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btn-row">
        <button className="primary" id="btn-copy" onClick={onCopy}>
          Copiar para Excel
        </button>
        <span className="copy-feedback" id="copy-feedback" style={{ display: copied ? 'inline' : 'none' }}>
          Copiado ✓
        </span>
        <button className="ghost" id="btn-new-list" onClick={onNewList}>
          Começar nova lista
        </button>
      </div>
    </div>
  );
}
