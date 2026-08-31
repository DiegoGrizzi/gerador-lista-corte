/**
 * usePdfUpload.ts
 * ---------------------------------------------------------------------------
 * Fluxo de importação de PDF ("Enviar PDF"), no mesmo espírito de
 * useOcrUpload.ts (foto): lê o(s) arquivo(s), manda pro servidor extrair o
 * texto da tabela via OCR (ver server/src/routes/pdf.ts) e junta o
 * resultado na mensagem para o usuário revisar antes de "Analisar
 * mensagem" — nunca confia no texto extraído automaticamente, mesmo com a
 * extração validada com PDFs reais.
 *
 * Mais simples que o fluxo de foto: o servidor já devolve o texto pronto
 * pra colar (uma tabela por página reconhecida, com cabeçalho); não há
 * pergunta de material por página (o material, quando presente na tabela,
 * já vem numa coluna própria — ver packages/parser/src/table-columns.ts;
 * quando ausente, o modal de material obrigatório já cobre isso na hora de
 * analisar).
 * ---------------------------------------------------------------------------
 */

import { useCallback, useState, type Dispatch } from 'react';
import { requestPdfText } from '../lib/api/pdf.js';
import type { CutListAction } from '../state/types.js';

export interface UsePdfUploadResult {
  /** Chave a passar em `key` no <input type="file">, incrementada a cada seleção
   * para forçar a remontagem do elemento (permite reselecionar os mesmos arquivos). */
  inputKey: number;
  /** Handler para o evento `change` do <input type="file">. */
  handleFilesSelected: (fileList: FileList | null) => void;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

export function usePdfUpload(dispatch: Dispatch<CutListAction>): UsePdfUploadResult {
  const [inputKey, setInputKey] = useState(0);

  const processFiles = useCallback(
    async (files: File[]) => {
      const blocks: string[] = [];
      let hadError = false;

      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        dispatch({
          type: 'PHOTO_STATUS_CHANGED',
          message:
            files.length > 1
              ? `Lendo PDF ${index + 1} de ${files.length} (pode levar alguns minutos)...`
              : 'Lendo PDF (pode levar alguns minutos)...',
          isError: false,
        });

        try {
          const base64 = await readFileAsBase64(file);
          const { text } = await requestPdfText(base64);

          if (text.trim()) {
            blocks.push(text.trim());
          } else {
            hadError = true;
            dispatch({
              type: 'PHOTO_STATUS_CHANGED',
              message: `Não encontrei nenhuma tabela de "Lista de Cortes" reconhecível no PDF${files.length > 1 ? ` ${index + 1} de ${files.length}` : ''}.`,
              isError: true,
            });
          }
        } catch (err) {
          hadError = true;
          const message = err instanceof Error ? err.message : 'falha desconhecida';
          dispatch({
            type: 'PHOTO_STATUS_CHANGED',
            message: `Erro no PDF${files.length > 1 ? ` ${index + 1} de ${files.length}` : ''}: ${message}`,
            isError: true,
          });
        }
      }

      if (blocks.length > 0) {
        dispatch({ type: 'RAW_TEXT_APPENDED', block: blocks.join('\n\n') });
        if (!hadError) {
          dispatch({
            type: 'PHOTO_STATUS_CHANGED',
            message: 'Transcrito! Confira o texto antes de clicar em "Analisar mensagem".',
            isError: false,
          });
        }
      }
    },
    [dispatch],
  );

  const handleFilesSelected = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList || []);
      // Remonta o input (nova key) para permitir selecionar os mesmos
      // arquivos de novo depois — mesmo motivo de useOcrUpload.ts.
      setInputKey((k) => k + 1);
      if (files.length === 0) return;
      void processFiles(files);
    },
    [processFiles],
  );

  return { inputKey, handleFilesSelected };
}
