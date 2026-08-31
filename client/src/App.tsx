/**
 * App.tsx
 * ---------------------------------------------------------------------------
 * Componente raiz: liga o reducer compartilhado (useCutList) aos 3 cards e
 * 4 modais da página, e contém os handlers que espelham as funções `handleX`
 * do app.js legado — a diferença é que aqui eles só chamam `analyzeText` /
 * `quickParseLine` (efeitos síncronos) e despacham o resultado para o
 * reducer, em vez de mutar variáveis de módulo e chamar renderização direta.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useRef } from 'react';
import { analyzeText, quickParseLine } from '@corte-cloud/parser';
import { useCutList } from './state/cutListContext.js';
import {
  createNextId,
  MSG_DISCARD_RETRY_FAILED,
  MSG_EMPTY_TEXT,
  MSG_GENERATE_EMPTY,
  MSG_NO_PIECES_FOUND,
} from './state/cutListReducer.js';
import type { EditablePieceFitaField, EditablePieceTextField } from './state/types.js';
import { Header } from './components/Header.js';
import { PasteOrPhotoCard } from './components/PasteOrPhotoCard.js';
import { PieceReviewTable } from './components/PieceReviewTable.js';
import { ResultCard } from './components/ResultCard.js';
import { MmUnitModal } from './components/modals/MmUnitModal.js';
import { ThreeLadosModal } from './components/modals/ThreeLadosModal.js';
import { MaterialModal } from './components/modals/MaterialModal.js';
import { PhotoMaterialModal } from './components/modals/PhotoMaterialModal.js';
import { ErrorModal } from './components/modals/ErrorModal.js';
import { UpdateProgressModal } from './components/modals/UpdateProgressModal.js';
import { useOcrUpload } from './hooks/useOcrUpload.js';
import { usePdfUpload } from './hooks/usePdfUpload.js';
import { useClipboardCopy } from './hooks/useClipboardCopy.js';
import { useAutoUpdate } from './hooks/useAutoUpdate.js';
import { useCurrentVersion } from './hooks/useCurrentVersion.js';
import { UpdateBanner } from './components/UpdateBanner.js';

export function App(): JSX.Element {
  const { state, dispatch } = useCutList();
  const ocr = useOcrUpload(dispatch);
  const pdf = usePdfUpload(dispatch);
  const { copied, copy } = useClipboardCopy();
  const autoUpdate = useAutoUpdate();
  const currentVersion = useCurrentVersion();
  const resultCardRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = useCallback(() => {
    if (!state.rawText.trim()) {
      dispatch({ type: 'SHOW_ERROR', message: MSG_EMPTY_TEXT });
      return;
    }

    const { nextId, getIdCounter } = createNextId(state.idCounter);
    const result = analyzeText(state.rawText, nextId);

    if (result.pieces.length === 0 && result.discarded.length === 0) {
      dispatch({ type: 'SHOW_ERROR', message: MSG_NO_PIECES_FOUND });
      return;
    }

    dispatch({
      type: 'ANALYZE_SUCCEEDED',
      pieces: result.pieces,
      discarded: result.discarded,
      materialMentioned: result.materialMentioned,
      idCounter: getIdCounter(),
    });
  }, [state.rawText, state.idCounter, dispatch]);

  const handleClear = useCallback(() => {
    dispatch({ type: 'CLEAR_INPUT' });
  }, [dispatch]);

  const handleNewList = useCallback(() => {
    dispatch({ type: 'NEW_LIST' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dispatch]);

  const handleGenerate = useCallback(() => {
    if (state.pieces.length === 0) {
      dispatch({ type: 'SHOW_ERROR', message: MSG_GENERATE_EMPTY });
      return;
    }
    dispatch({ type: 'GENERATE_SUCCEEDED' });
    // Espera o próximo frame (depois que o React já montou/atualizou o
    // result-card) antes de rolar até ele — mesmo efeito de
    // `el('result-card').scrollIntoView(...)` no fim de renderResult().
    requestAnimationFrame(() => {
      resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [state.pieces.length, dispatch]);

  const handleDiscardRetry = useCallback(
    (index: number, editedText: string) => {
      const item = state.discardedItems[index];
      if (!item) return;

      const { nextId, getIdCounter } = createNextId(state.idCounter);
      const rescued = quickParseLine(editedText, item.context, nextId);

      if (!rescued) {
        dispatch({ type: 'DISCARD_RETRY_FAILED', index, message: MSG_DISCARD_RETRY_FAILED });
        return;
      }

      if (!state.mmAsked) {
        // Primeira peça válida da sessão vinda de um resgate — pergunta
        // sobre mm antes de finalizar (ver DISCARD_RETRY_SUCCEEDED_AS_PENDING).
        dispatch({ type: 'DISCARD_RETRY_SUCCEEDED_AS_PENDING', index, rescued, idCounter: getIdCounter() });
      } else {
        dispatch({ type: 'DISCARD_RETRY_SUCCEEDED', index, rescued, idCounter: getIdCounter() });
      }
    },
    [state.discardedItems, state.idCounter, state.mmAsked, dispatch],
  );

  const handleFieldChange = useCallback(
    (id: string, field: EditablePieceTextField, value: string) => {
      dispatch({ type: 'PIECE_FIELD_EDITED', id, field, value });
    },
    [dispatch],
  );

  const handleFitaChange = useCallback(
    (id: string, field: EditablePieceFitaField, checked: boolean) => {
      dispatch({ type: 'PIECE_FITA_EDITED', id, field, checked });
    },
    [dispatch],
  );

  const handleRemove = useCallback((id: string) => dispatch({ type: 'PIECE_REMOVED', id }), [dispatch]);

  return (
    <div className="wrap">
      <UpdateBanner status={autoUpdate.status} onApply={autoUpdate.applyNow} />

      <Header />

      <PasteOrPhotoCard
        rawText={state.rawText}
        onRawTextChange={(text) => dispatch({ type: 'RAW_TEXT_CHANGED', text })}
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        photoStatus={state.photoStatus}
        photoStatusIsError={state.photoStatusIsError}
        photoInputKey={ocr.inputKey}
        onFilesSelected={ocr.handleFilesSelected}
        pdfInputKey={pdf.inputKey}
        onPdfFilesSelected={pdf.handleFilesSelected}
      />

      {state.previewVisible ? (
        <PieceReviewTable
          pieces={state.pieces}
          discardedItems={state.discardedItems}
          discardErrors={state.discardErrors}
          onFieldChange={handleFieldChange}
          onFitaChange={handleFitaChange}
          onRemove={handleRemove}
          onDiscardRetry={handleDiscardRetry}
          onGenerate={handleGenerate}
        />
      ) : null}

      <MmUnitModal
        isOpen={state.activeModal === 'mm'}
        onAnswered={(factor) => dispatch({ type: 'MM_ANSWERED', factor })}
      />
      <ThreeLadosModal
        isOpen={state.activeModal === 'threeLados'}
        onAnswered={(choice) => dispatch({ type: 'THREE_LADOS_ANSWERED', choice })}
      />
      <MaterialModal
        isOpen={state.activeModal === 'material'}
        onConfirm={(material) => dispatch({ type: 'MATERIAL_CONFIRMED', material })}
      />
      <PhotoMaterialModal
        isOpen={state.activeModal === 'photoMaterial'}
        prompt={ocr.prompt}
        onConfirm={ocr.confirmMaterial}
        onInherit={ocr.inheritMaterial}
      />
      <ErrorModal
        isOpen={state.activeModal === 'error'}
        message={state.errorMessage}
        onClose={() => dispatch({ type: 'ERROR_MODAL_CLOSED' })}
      />
      <UpdateProgressModal
        isOpen={autoUpdate.status === 'updating' || autoUpdate.status === 'restarting' || autoUpdate.status === 'error'}
        isError={autoUpdate.status === 'error'}
        updating={autoUpdate.status === 'updating'}
        errorMessage={autoUpdate.errorMessage}
        onRetry={autoUpdate.applyNow}
        onClose={autoUpdate.dismissError}
      />

      {state.resultVisible ? (
        <ResultCard
          pieces={state.pieces}
          copied={copied}
          onCopy={() => void copy(state.pieces)}
          onNewList={handleNewList}
          containerRef={resultCardRef}
        />
      ) : null}

      <footer className="app-footer">
        <p>
          Desenvolvido por Diego Grizzi
          {currentVersion ? <span className="version-tag"> · v{currentVersion}</span> : null}
        </p>
      </footer>
    </div>
  );
}
