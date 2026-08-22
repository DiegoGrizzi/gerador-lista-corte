import { useRef } from 'react';
import type { DiscardedItem } from '@corte-cloud/parser';

export interface DiscardedItemRowProps {
  item: DiscardedItem;
  index: number;
  error?: string;
  onRetry: (index: number, editedText: string) => void;
}

export function DiscardedItemRow({ item, index, error, onRetry }: DiscardedItemRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const prefillValue = item.suggested || item.text;

  return (
    <div className="discard-item" data-idx={index}>
      {item.suggested ? (
        <p className="discard-suggestion">
          Original: <span className="mono">{item.text}</span> — parece um erro de digitação. Confirme a correção
          abaixo:
        </p>
      ) : null}
      <div className="discard-item-row">
        <input type="text" className="discard-edit" defaultValue={prefillValue} ref={inputRef} />
        <button className="ghost" onClick={() => onRetry(index, inputRef.current?.value ?? '')}>
          Tentar novamente
        </button>
      </div>
      <div className="discard-error" style={{ display: error ? 'block' : 'none' }}>
        {error}
      </div>
    </div>
  );
}
