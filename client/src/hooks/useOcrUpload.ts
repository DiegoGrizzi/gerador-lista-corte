/**
 * useOcrUpload.ts
 * ---------------------------------------------------------------------------
 * Porta o fluxo de fotos/OCR do vision.js legado para um hook React. Duas
 * diferenças estruturais em relação ao legado (comportamento observável
 * idêntico):
 *
 *   1. O handoff final não escreve direto no DOM (`el('raw-text').value =`)
 *      — despacha `RAW_TEXT_APPENDED` no reducer compartilhado.
 *   2. A fila de arquivos / pré-visualização / índice atual é estado LOCAL
 *      deste hook (não do reducer principal) — é orquestração assíncrona
 *      sequencial (uma Promise por foto, resolvida quando o usuário responde
 *      o modal de material daquela foto), não uma transição de estado
 *      síncrona; ver nota em state/types.ts.
 *
 * Continua processando os arquivos um de cada vez, na ordem selecionada
 * (nunca em paralelo), com as mesmas mensagens de status por foto do
 * legado.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useRef, useState, type Dispatch } from 'react';
import { requestOcr } from '../lib/api/ocr.js';
import { buildMaterialHeader, reformatTableText } from '../lib/vision/reformat-table-text.js';
import type { CutListAction } from '../state/types.js';

export interface PhotoMaterialPrompt {
  previewUrl: string;
  title: string;
  sub: string;
  /** Só a partir da 2ª foto é possível herdar o material da anterior. */
  isFirst: boolean;
}

export interface UseOcrUploadResult {
  /** Chave a passar em `key` no <input type="file">, incrementada a cada seleção
   * para forçar a remontagem do elemento (permite reselecionar os mesmos arquivos). */
  inputKey: number;
  /** Handler para o evento `change` do <input type="file">. */
  handleFilesSelected: (fileList: FileList | null) => void;
  /** Prompt de material da foto atual, ou null quando nenhuma pergunta está pendente. */
  prompt: PhotoMaterialPrompt | null;
  /** Confirma o material digitado para a foto atual (ignora se vazio, como o legado). */
  confirmMaterial: (material: string) => void;
  /** Herda o material da foto anterior (só disponível a partir da 2ª foto). */
  inheritMaterial: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

export function useOcrUpload(dispatch: Dispatch<CutListAction>): UseOcrUploadResult {
  const [inputKey, setInputKey] = useState(0);
  const [prompt, setPrompt] = useState<PhotoMaterialPrompt | null>(null);
  const resolveMaterialRef = useRef<((material: string) => void) | null>(null);

  const askMaterialForPhoto = useCallback(
    async (file: File, index: number, total: number): Promise<string> => {
      const dataUrl = await readFileAsDataUrl(file);
      const isFirst = index === 0;

      return new Promise<string>((resolve) => {
        resolveMaterialRef.current = resolve;
        setPrompt({
          previewUrl: dataUrl,
          title: total > 1 ? `Qual o material da foto ${index + 1} de ${total}?` : 'Qual o material dessa foto?',
          sub: isFirst
            ? 'Informe o material dessa foto para continuar.'
            : 'Informe o material dessa foto, ou clique em "Herdar material anterior" para usar o mesmo material da foto anterior.',
          isFirst,
        });
        dispatch({ type: 'PHOTO_MATERIAL_MODAL_OPENED' });
      });
    },
    [dispatch],
  );

  const finishPrompt = useCallback(
    (material: string) => {
      const resolve = resolveMaterialRef.current;
      resolveMaterialRef.current = null;
      setPrompt(null);
      dispatch({ type: 'PHOTO_MATERIAL_MODAL_CLOSED' });
      resolve?.(material);
    },
    [dispatch],
  );

  const confirmMaterial = useCallback(
    (material: string) => {
      const trimmed = material.trim();
      if (!trimmed) return;
      finishPrompt(trimmed);
    },
    [finishPrompt],
  );

  const inheritMaterial = useCallback(() => {
    finishPrompt('');
  }, [finishPrompt]);

  const processFiles = useCallback(
    async (files: File[]) => {
      const blocks: string[] = [];
      let hadError = false;

      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        const material = await askMaterialForPhoto(file, index, files.length);

        dispatch({
          type: 'PHOTO_STATUS_CHANGED',
          message: `Lendo foto ${index + 1} de ${files.length}...`,
          isError: false,
        });

        try {
          const base64 = await readFileAsBase64(file);
          const { text } = await requestOcr(base64);
          const reformatted = reformatTableText(text);

          if (!reformatted) {
            hadError = true;
            dispatch({
              type: 'PHOTO_STATUS_CHANGED',
              message: `Não consegui reconhecer peças na foto ${index + 1} de ${files.length}.`,
              isError: true,
            });
          } else {
            blocks.push(buildMaterialHeader(material) + reformatted);
          }
        } catch (err) {
          hadError = true;
          const message = err instanceof Error ? err.message : 'falha desconhecida';
          dispatch({
            type: 'PHOTO_STATUS_CHANGED',
            message: `Erro na foto ${index + 1} de ${files.length}: ${message}`,
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
    [askMaterialForPhoto, dispatch],
  );

  const handleFilesSelected = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList || []);
      // Remonta o input (nova key) para permitir selecionar os mesmos
      // arquivos de novo depois — inputs de arquivo controlados pelo React
      // não aceitam ter `value` limpo programaticamente do jeito usual.
      setInputKey((k) => k + 1);
      if (files.length === 0) return;
      void processFiles(files);
    },
    [processFiles],
  );

  return { inputKey, handleFilesSelected, prompt, confirmMaterial, inheritMaterial };
}
