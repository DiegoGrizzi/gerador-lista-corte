import type { Piece } from '@corte-cloud/parser';
import type { EditablePieceFitaField, EditablePieceTextField } from '../state/types.js';

export interface PieceReviewRowProps {
  piece: Piece;
  displayNumber: number;
  onFieldChange: (id: string, field: EditablePieceTextField, value: string) => void;
  onFitaChange: (id: string, field: EditablePieceFitaField, checked: boolean) => void;
  onRemove: (id: string) => void;
}

export function PieceReviewRow({
  piece,
  displayNumber,
  onFieldChange,
  onFitaChange,
  onRemove,
}: PieceReviewRowProps): JSX.Element {
  const notes: string[] = [];
  if (piece.note) notes.push(piece.note);
  if (piece.wasInverted) notes.push('comprimento/largura invertidos (fitamento ajustado)');

  const rowClassName = piece.wasInverted ? 'inverted' : piece.isOverride ? 'override' : '';

  return (
    <tr className={rowClassName} data-id={piece.id}>
      <td className="note-tag" data-label="#">
        {displayNumber}
      </td>
      <td data-label="Qtd">
        <input
          type="text"
          className="col-qty"
          value={piece.qtd}
          onChange={(e) => onFieldChange(piece.id, 'qtd', e.target.value)}
        />
      </td>
      <td data-label="Compr.">
        <input
          type="text"
          className="col-dim"
          value={piece.compr}
          onChange={(e) => onFieldChange(piece.id, 'compr', e.target.value)}
        />
      </td>
      <td data-label="Larg.">
        <input
          type="text"
          className="col-dim"
          value={piece.larg}
          onChange={(e) => onFieldChange(piece.id, 'larg', e.target.value)}
        />
      </td>
      <td data-label="Função">
        <input
          type="text"
          className="col-funcao"
          value={piece.funcao}
          onChange={(e) => onFieldChange(piece.id, 'funcao', e.target.value)}
        />
      </td>
      <td className="check-cell" data-label="C1">
        <input
          type="checkbox"
          checked={piece.fita.c1}
          onChange={(e) => onFitaChange(piece.id, 'c1', e.target.checked)}
        />
      </td>
      <td className="check-cell" data-label="C2">
        <input
          type="checkbox"
          checked={piece.fita.c2}
          onChange={(e) => onFitaChange(piece.id, 'c2', e.target.checked)}
        />
      </td>
      <td className="check-cell" data-label="L1">
        <input
          type="checkbox"
          checked={piece.fita.l1}
          onChange={(e) => onFitaChange(piece.id, 'l1', e.target.checked)}
        />
      </td>
      <td className="check-cell" data-label="L2">
        <input
          type="checkbox"
          checked={piece.fita.l2}
          onChange={(e) => onFitaChange(piece.id, 'l2', e.target.checked)}
        />
      </td>
      <td className="mat-cell" data-label="Material">
        <input type="text" value={piece.material} onChange={(e) => onFieldChange(piece.id, 'material', e.target.value)} />
      </td>
      <td className="mat-cell" data-label="Compl.">
        <input
          type="text"
          value={piece.complemento}
          onChange={(e) => onFieldChange(piece.id, 'complemento', e.target.value)}
        />
      </td>
      <td className="note-tag obs-cell" data-label="Obs.">
        {notes.join(' — ')}
      </td>
      <td data-label="">
        <button className="danger-ghost" onClick={() => onRemove(piece.id)}>
          remover
        </button>
      </td>
    </tr>
  );
}
