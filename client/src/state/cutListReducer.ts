/**
 * cutListReducer.ts
 * ---------------------------------------------------------------------------
 * Máquina de estados da tela, portada de app.js legado (ver
 * `legacy/js/app.js`) para um reducer puro e testável. Cada função
 * `handleX` do legado tem uma ação correspondente aqui; a lógica de negócio
 * (quando abrir qual modal, quando aplicar o material de fallback) é a
 * mesma, só que expressa como transições de estado em vez de mutação de
 * variáveis de módulo + chamadas diretas de renderização.
 *
 * `convertPieceToMm` (de @corte-cloud/parser) MUTA a peça recebida — para
 * preservar a imutabilidade que o React espera do estado, sempre clonamos a
 * peça (e seu objeto `fita`) antes de chamá-la, e usamos o clone daí em
 * diante.
 * ---------------------------------------------------------------------------
 */

import { convertPieceToMm, looksLikeNoMaterial, resolveFitaFromType, resolveThreeLadosFita, toNumber } from '@corte-cloud/parser';
import type { Piece } from '@corte-cloud/parser';
import type { CutListAction, CutListState } from './types.js';

export const MSG_EMPTY_TEXT = 'Cole a mensagem com as medidas antes de clicar em "Analisar mensagem".';
export const MSG_NO_PIECES_FOUND =
  'Não encontrei nenhuma peça nessa mensagem. Confira se o texto colado está no formato esperado.';
export const MSG_DISCARD_RETRY_FAILED =
  'Ainda não consegui interpretar esta linha. Confira o formato (ex: 2=25,2x30,5).';
export const MSG_GENERATE_EMPTY = 'Adicione ao menos uma peça antes de gerar a lista.';

export const RESULT_COLUMNS = [
  'Quantidade',
  'Comprimento',
  'Largura',
  'Função',
  'Fita C1',
  'Fita C2',
  'Fita L1',
  'Fita L2',
  'Material',
  'Complemento',
] as const;

export function createInitialState(): CutListState {
  return {
    rawText: '',
    pieces: [],
    discardedItems: [],
    discardErrors: {},
    idCounter: 0,
    materialAsked: false,
    materialFallback: '',
    mmAsked: false,
    mmFactor: 1,
    threeLadosAsked: false,
    fitaAsked: false,
    pendingRescuedPiece: null,
    activeModal: 'none',
    errorMessage: '',
    previewVisible: false,
    resultVisible: false,
    photoStatus: '',
    photoStatusIsError: false,
  };
}

/**
 * Fábrica de `nextId` (ver NextIdFn em @corte-cloud/parser) semeada a partir
 * do `idCounter` atual do estado. `analyzeText`/`quickParseLine` chamam
 * `nextId()` de forma síncrona, várias vezes, ANTES que qualquer ação seja
 * despachada — por isso o contador vive num closure local (não num ref/state
 * do React) durante a chamada, e o valor final é lido com `getIdCounter()`
 * para ir junto na ação que reporta o resultado ao reducer (ver
 * ANALYZE_SUCCEEDED / DISCARD_RETRY_SUCCEEDED*), que então persiste esse
 * valor em `state.idCounter` — a mesma função de `nextId` do app.js legado,
 * só que sem variável de módulo mutável.
 */
export function createNextId(seed: number): { nextId: () => string; getIdCounter: () => number } {
  let counter = seed;
  return {
    nextId: () => 'p' + counter++,
    getIdCounter: () => counter,
  };
}

// Reexportado por conveniência - antes vivia só aqui, movido pra
// @corte-cloud/parser pra poder ser reaproveitado por analyzeText também
// (ver comentário em finalize.ts sobre materialMentioned).
export { looksLikeNoMaterial };

function clonePiece(piece: Piece): Piece {
  return { ...piece, fita: { ...piece.fita } };
}

/** Versão imutável de applyMaterialFallback do legado: devolve uma NOVA peça (ou a mesma, se nada muda). */
function applyMaterialFallback(piece: Piece, materialFallback: string): Piece {
  if (!materialFallback || !looksLikeNoMaterial(piece.material)) return piece;
  const material = piece.material ? materialFallback + ' ' + piece.material : materialFallback;
  return { ...piece, material };
}

/** Clona, converte para mm (mutando o clone) e devolve a peça já convertida. */
function convertedClone(piece: Piece, factor: number): Piece {
  const clone = clonePiece(piece);
  convertPieceToMm(clone, factor);
  return clone;
}

export function cutListReducer(state: CutListState, action: CutListAction): CutListState {
  switch (action.type) {
    case 'RAW_TEXT_CHANGED':
      return { ...state, rawText: action.text };

    case 'SHOW_ERROR':
      return { ...state, activeModal: 'error', errorMessage: action.message };

    case 'ERROR_MODAL_CLOSED':
      return { ...state, activeModal: 'none', errorMessage: '' };

    case 'ANALYZE_SUCCEEDED': {
      const { pieces, discarded, materialMentioned } = action;
      return {
        ...state,
        pieces,
        discardedItems: discarded,
        discardErrors: {},
        idCounter: action.idCounter,
        materialAsked: materialMentioned,
        materialFallback: '',
        mmAsked: false,
        mmFactor: 1,
        threeLadosAsked: false,
        fitaAsked: false,
        pendingRescuedPiece: null,
        activeModal: pieces.length > 0 ? 'mm' : 'none',
        // Espelha handleAnalyze: só chama renderPreview() diretamente
        // quando não há peças (senão a pergunta de mm entra primeiro).
        previewVisible: pieces.length > 0 ? state.previewVisible : true,
      };
    }

    case 'CLEAR_INPUT':
      return {
        ...state,
        rawText: '',
        pieces: [],
        discardedItems: [],
        discardErrors: {},
        materialAsked: false,
        materialFallback: '',
        mmAsked: false,
        mmFactor: 1,
        threeLadosAsked: false,
        fitaAsked: false,
        pendingRescuedPiece: null,
        previewVisible: false,
        resultVisible: false,
        activeModal: 'none',
        photoStatus: '',
        photoStatusIsError: false,
      };

    case 'MM_ANSWERED': {
      const factor = action.factor;
      let pieces = state.pieces.map((piece) => convertedClone(piece, factor));

      if (state.pendingRescuedPiece) {
        const rescued = applyMaterialFallback(convertedClone(state.pendingRescuedPiece, factor), state.materialFallback);
        pieces = [...pieces, rescued];
      }

      // pendingThreeLados e fitaUnknown só podem ser resolvidos com a
      // medida FINAL (já em mm) — a comparação maior/menor de
      // resolveFitaFromType/resolveThreeLadosFita depende disso — por isso
      // as perguntas correspondentes vêm depois desta, nunca antes (ver
      // THREE_LADOS_ANSWERED e FITA_MISSING_ANSWERED).
      const needsThreeLados = !state.threeLadosAsked && pieces.some((piece) => piece.pendingThreeLados);
      const needsFitaMissing = !needsThreeLados && !state.fitaAsked && pieces.some((piece) => piece.fitaUnknown);
      const openMaterialModal = !needsThreeLados && !needsFitaMissing && !state.materialAsked && pieces.length > 0;
      const activeModal = needsThreeLados
        ? 'threeLados'
        : needsFitaMissing
          ? 'fitaMissing'
          : openMaterialModal
            ? 'material'
            : 'none';

      return {
        ...state,
        mmAsked: true,
        mmFactor: factor,
        pieces,
        pendingRescuedPiece: null,
        activeModal,
        previewVisible: activeModal === 'none' ? true : state.previewVisible,
      };
    }

    case 'THREE_LADOS_ANSWERED': {
      const pieces = state.pieces.map((piece) => {
        if (!piece.pendingThreeLados) return piece;
        const next = clonePiece(piece);
        next.fita = resolveThreeLadosFita(piece.compr, piece.larg, action.choice);
        next.pendingThreeLados = false;
        return next;
      });
      const needsFitaMissing = !state.fitaAsked && pieces.some((piece) => piece.fitaUnknown);
      const openMaterialModal = !needsFitaMissing && !state.materialAsked && pieces.length > 0;
      const activeModal = needsFitaMissing ? 'fitaMissing' : openMaterialModal ? 'material' : 'none';
      return {
        ...state,
        threeLadosAsked: true,
        pieces,
        activeModal,
        previewVisible: activeModal === 'none' ? true : state.previewVisible,
      };
    }

    case 'FITA_MISSING_ANSWERED': {
      const pieces = state.pieces.map((piece) => {
        if (!piece.fitaUnknown) return piece;
        const next = clonePiece(piece);
        next.fita = resolveFitaFromType(action.fitaType, piece.compr, piece.larg);
        next.fitaType = action.fitaType;
        next.fitaUnknown = false;
        return next;
      });
      const openMaterialModal = !state.materialAsked && pieces.length > 0;
      return {
        ...state,
        fitaAsked: true,
        pieces,
        activeModal: openMaterialModal ? 'material' : 'none',
        previewVisible: openMaterialModal ? state.previewVisible : true,
      };
    }

    case 'MATERIAL_CONFIRMED': {
      const material = action.material.trim();
      if (!material) {
        return { ...state, materialAsked: true, activeModal: 'none', previewVisible: true };
      }
      const pieces = state.pieces.map((piece) => applyMaterialFallback(piece, material));
      return {
        ...state,
        materialFallback: material,
        materialAsked: true,
        pieces,
        activeModal: 'none',
        previewVisible: true,
      };
    }

    case 'DISCARD_RETRY_FAILED':
      return {
        ...state,
        discardErrors: { ...state.discardErrors, [action.index]: action.message },
      };

    case 'DISCARD_RETRY_SUCCEEDED_AS_PENDING': {
      const discardedItems = state.discardedItems.filter((_, i) => i !== action.index);
      const discardErrors = reindexDiscardErrors(state.discardErrors, action.index);
      return {
        ...state,
        discardedItems,
        discardErrors,
        idCounter: action.idCounter,
        pendingRescuedPiece: action.rescued,
        activeModal: 'mm',
      };
    }

    case 'DISCARD_RETRY_SUCCEEDED': {
      const discardedItems = state.discardedItems.filter((_, i) => i !== action.index);
      const discardErrors = reindexDiscardErrors(state.discardErrors, action.index);
      const rescued = applyMaterialFallback(convertedClone(action.rescued, state.mmFactor), state.materialFallback);
      const pieces = [...state.pieces, rescued];
      const openMaterialModal = !state.materialAsked && looksLikeNoMaterial(rescued.material);
      return {
        ...state,
        discardedItems,
        discardErrors,
        idCounter: action.idCounter,
        pieces,
        activeModal: openMaterialModal ? 'material' : state.activeModal,
        previewVisible: true,
      };
    }

    case 'PIECE_FIELD_EDITED': {
      const pieces = state.pieces.map((piece) => {
        if (piece.id !== action.id) return piece;
        const next = clonePiece(piece);
        switch (action.field) {
          case 'qtd':
            next.qtd = parseInt(action.value, 10) || 0;
            break;
          case 'compr':
            next.compr = toNumber(action.value) || 0;
            break;
          case 'larg':
            next.larg = toNumber(action.value) || 0;
            break;
          case 'material':
            next.material = action.value;
            break;
          case 'complemento':
            next.complemento = action.value;
            break;
          case 'funcao':
            next.funcao = action.value;
            break;
        }
        return next;
      });
      return { ...state, pieces };
    }

    case 'PIECE_FITA_EDITED': {
      const pieces = state.pieces.map((piece) => {
        if (piece.id !== action.id) return piece;
        const next = clonePiece(piece);
        next.fita[action.field] = action.checked;
        return next;
      });
      return { ...state, pieces };
    }

    case 'PIECE_REMOVED':
      return { ...state, pieces: state.pieces.filter((p) => p.id !== action.id) };

    case 'GENERATE_SUCCEEDED':
      return { ...state, resultVisible: true };

    case 'NEW_LIST':
      return {
        ...createInitialState(),
        idCounter: state.idCounter,
      };

    case 'PHOTO_MATERIAL_MODAL_OPENED':
      return { ...state, activeModal: 'photoMaterial' };

    case 'PHOTO_MATERIAL_MODAL_CLOSED':
      return { ...state, activeModal: 'none' };

    case 'PHOTO_STATUS_CHANGED':
      return { ...state, photoStatus: action.message, photoStatusIsError: action.isError };

    case 'RAW_TEXT_APPENDED': {
      const existing = state.rawText.trim();
      const rawText = existing ? existing + '\n\n' + action.block : action.block;
      return { ...state, rawText };
    }

    default:
      return state;
  }
}

/** Remove a entrada de erro do índice removido e desloca os índices seguintes uma posição para trás,
 * para continuar alinhado com `discardedItems` depois de um splice. */
function reindexDiscardErrors(errors: Record<number, string>, removedIndex: number): Record<number, string> {
  const next: Record<number, string> = {};
  Object.entries(errors).forEach(([key, value]) => {
    const idx = Number(key);
    if (idx === removedIndex) return;
    next[idx > removedIndex ? idx - 1 : idx] = value;
  });
  return next;
}
