import type { DiscardedItem, Piece } from '@corte-cloud/parser';
import { PieceReviewRow } from './PieceReviewRow.js';
import { DiscardedList } from './DiscardedList.js';
import type { EditablePieceFitaField, EditablePieceTextField } from '../state/types.js';

export interface PieceReviewTableProps {
  pieces: Piece[];
  discardedItems: DiscardedItem[];
  discardErrors: Record<number, string>;
  /** Total que a lista informou, ou null. Se a soma das quantidades lidas não bater, mostra um aviso. */
  statedTotal: number | null;
  onFieldChange: (id: string, field: EditablePieceTextField, value: string) => void;
  onFitaChange: (id: string, field: EditablePieceFitaField, checked: boolean) => void;
  onRemove: (id: string) => void;
  onDiscardRetry: (index: number, editedText: string) => void;
  onGenerate: () => void;
}

export function PieceReviewTable({
  pieces,
  discardedItems,
  discardErrors,
  statedTotal,
  onFieldChange,
  onFitaChange,
  onRemove,
  onDiscardRetry,
  onGenerate,
}: PieceReviewTableProps): JSX.Element {
  return (
    <div className="card" id="preview-card">
      <h2>
        2. Conferir peças identificadas (<span id="pv-count">{pieces.length}</span>)
      </h2>
      <p className="hint">
        Edite qualquer campo antes de gerar. Linhas{' '}
        <span className="highlight-override">destacadas</span>: uma observação na mensagem original alterou a fita
        desta peça.
      </p>

      {statedTotal != null ? (
        <TotalCheck statedTotal={statedTotal} pieces={pieces} discardedCount={discardedItems.length} />
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Qtd</th>
              <th>Compr.</th>
              <th>Larg.</th>
              <th>Função</th>
              <th>C1</th>
              <th>C2</th>
              <th>L1</th>
              <th>L2</th>
              <th>Material</th>
              <th>Compl.</th>
              <th>Obs.</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="pv-body">
            {pieces.map((piece, index) => (
              <PieceReviewRow
                key={piece.id}
                piece={piece}
                displayNumber={index + 1}
                onFieldChange={onFieldChange}
                onFitaChange={onFitaChange}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span>
          <span className="swatch swatch-override" />
          observação da mensagem original alterou a fita
        </span>
        <span>
          <span className="swatch swatch-inverted" />
          comprimento/largura invertidos (seguindo o sentido do veio)
        </span>
        <span>
          <span className="swatch swatch-suspicious" />
          medida muito pequena — confira se não estava em metros
        </span>
      </div>

      <DiscardedList discardedItems={discardedItems} discardErrors={discardErrors} onRetry={onDiscardRetry} />

      <div className="btn-row">
        <button className="primary" id="btn-generate" onClick={onGenerate}>
          Gerar lista para o CorteCloud
        </button>
      </div>
    </div>
  );
}

function TotalCheck({
  statedTotal,
  pieces,
  discardedCount,
}: {
  statedTotal: number;
  pieces: Piece[];
  discardedCount: number;
}): JSX.Element {
  const readTotal = pieces.reduce((sum, piece) => sum + (Number(piece.qtd) || 0), 0);
  if (readTotal === statedTotal) {
    return (
      <p className="hint" id="total-check" data-ok="true">
        ✓ Confere: a lista informa {statedTotal} peças e a soma das quantidades lidas é {readTotal}.
      </p>
    );
  }
  return (
    <p className="hint" id="total-check" data-ok="false" style={{ color: 'var(--danger, #b3261e)', fontWeight: 600 }}>
      Atenção: a lista informa {statedTotal} peças no total, mas a soma das quantidades lidas é {readTotal}
      {discardedCount > 0 ? ' (há itens na conferência abaixo)' : ''}. Confira se alguma peça ficou de fora ou foi lida
      errada.
    </p>
  );
}
