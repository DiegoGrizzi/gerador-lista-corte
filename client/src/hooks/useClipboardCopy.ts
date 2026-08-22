/**
 * useClipboardCopy.ts
 * ---------------------------------------------------------------------------
 * Copia a lista final para a área de transferência, como texto separado por
 * tabulação (sem cabeçalho) — mesmo formato que `copyResultToClipboard` do
 * app.js legado, mas construído diretamente a partir do array de peças (e da
 * mesma lista de colunas usada para renderizar a tabela) em vez de ler o
 * texto de volta do DOM já renderizado.
 *
 * `navigator.clipboard.writeText` é o método principal; se a API não
 * estiver disponível, cai para o truque legado de textarea oculta +
 * `document.execCommand('copy')`.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useRef, useState } from 'react';
import type { Piece } from '@corte-cloud/parser';

const COPY_FEEDBACK_DURATION_MS = 2200;

function pieceToRow(piece: Piece): string[] {
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

function buildTsv(pieces: Piece[]): string {
  return pieces.map((piece) => pieceToRow(piece).join('\t')).join('\n');
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // navegador sem suporte a execCommand
  }
  document.body.removeChild(textarea);
}

export interface UseClipboardCopyResult {
  /** Verdadeiro por ~2200ms depois de uma cópia bem-sucedida (mostra "Copiado ✓"). */
  copied: boolean;
  copy: (pieces: Piece[]) => Promise<void>;
}

export function useClipboardCopy(): UseClipboardCopyResult {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (pieces: Piece[]) => {
    const tsv = buildTsv(pieces);

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(tsv);
      } catch {
        fallbackCopy(tsv);
      }
    } else {
      fallbackCopy(tsv);
    }

    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  }, []);

  return { copied, copy };
}
