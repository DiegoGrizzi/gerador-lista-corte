import type { DiscardedItem } from '@corte-cloud/parser';
import { DiscardedItemRow } from './DiscardedItemRow.js';

export interface DiscardedListProps {
  discardedItems: DiscardedItem[];
  discardErrors: Record<number, string>;
  onRetry: (index: number, editedText: string) => void;
}

export function DiscardedList({ discardedItems, discardErrors, onRetry }: DiscardedListProps): JSX.Element {
  if (discardedItems.length === 0) {
    return <div className="discard-box" id="discard-box">Nenhuma linha descartada.</div>;
  }

  return (
    <div className="discard-box" id="discard-box">
      <strong>Linhas descartadas ({discardedItems.length}):</strong>
      <p className="discard-hint">Parecem ter medidas, mas não consegui interpretar. Confira e tente novamente.</p>
      {discardedItems.map((item, index) => (
        <DiscardedItemRow
          key={`${index}-${item.text}-${item.suggested ?? ''}`}
          item={item}
          index={index}
          error={discardErrors[index]}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
