/**
 * types.ts
 * ---------------------------------------------------------------------------
 * Forma do estado do reducer e das ações que o transformam. Espelha as 8
 * variáveis de módulo do app.js legado (pieces, discardedItems, idCounter,
 * materialAsked, materialFallback, mmAsked, mmFactor, pendingRescuedPiece),
 * mais campos "só de UI" (activeModal, errorMessage, previewVisible,
 * resultVisible, discardErrors, photoStatus) que no legado viviam como
 * estado direto do DOM (classes CSS `hidden`/`open`).
 *
 * O fluxo de foto/OCR (fila de arquivos, pré-visualização, índice atual)
 * fica de propósito FORA deste estado — ver useOcrUpload — porque é
 * orquestração assíncrona sequencial (uma Promise por foto, como no
 * vision.js legado), não uma transição de estado síncrona. O reducer só
 * recebe o resultado final de cada etapa (status, bloco de texto pronto,
 * abrir modal de material da foto).
 * ---------------------------------------------------------------------------
 */

import type { DiscardedItem, FitamentoType, Piece } from '@corte-cloud/parser';

export type ActiveModal = 'none' | 'mm' | 'threeLados' | 'fitaMissing' | 'material' | 'photoMaterial' | 'error';

export type EditablePieceTextField = 'qtd' | 'compr' | 'larg' | 'material' | 'complemento' | 'funcao';
export type EditablePieceFitaField = 'c1' | 'c2' | 'l1' | 'l2';

export interface CutListState {
  /** Texto colado pelo usuário na textarea (também recebe os blocos transcritos por OCR). */
  rawText: string;

  /** Peças atualmente na tabela de conferência (editáveis pelo usuário). */
  pieces: Piece[];

  /** Linhas que não puderam ser interpretadas como peça, aguardando correção. */
  discardedItems: DiscardedItem[];

  /** Mensagem de erro inline por item descartado (por índice atual em discardedItems). */
  discardErrors: Record<number, string>;

  /** Contador simples para dar um id único a cada peça criada na sessão (nunca reiniciado). */
  idCounter: number;

  /** Se o usuário já foi perguntado sobre o material nesta mensagem (confirmado ou pulado). */
  materialAsked: boolean;

  /** Material informado manualmente pelo usuário via pop-up, aplicado a peças sem material. */
  materialFallback: string;

  /** Se a pergunta "já está em mm?" já foi respondida nesta mensagem. */
  mmAsked: boolean;

  /** Fator de conversão confirmado (1 = já em mm, 10 = cm→mm, 1000 = m→mm). */
  mmFactor: number;

  /**
   * Se a pergunta sobre peças com código de fita ambíguo ("3L": 3 dos 4
   * lados, ver Piece.pendingThreeLados) já foi respondida nesta mensagem.
   */
  threeLadosAsked: boolean;

  /**
   * Se a pergunta sobre peças sem NENHUMA informação de fita (ver
   * Piece.fitaUnknown) já foi respondida nesta mensagem.
   */
  fitaAsked: boolean;

  /**
   * Peça resgatada da conferência enquanto a pergunta de mm ainda não tinha
   * sido feita (só acontece se a primeira peça válida da sessão vier de um
   * resgate, não da análise inicial) — fica guardada aqui até o modal de mm
   * ser respondido, para então ser convertida e adicionada.
   */
  pendingRescuedPiece: Piece | null;

  /** Qual modal está aberto no momento (só um por vez, como no legado). */
  activeModal: ActiveModal;

  /** Mensagem exibida pelo modal de erro (substitui alert() do legado). */
  errorMessage: string;

  /**
   * Visibilidade dos cards "2. Conferir peças" e "3. Lista pronta" — no
   * legado são dois booleanos INDEPENDENTES (classe `hidden` removida por
   * `renderPreview`/`renderResult`, adicionada de volta só por
   * `handleClearInput`/`handleNewList`), não uma única etapa exclusiva:
   * depois de gerar a lista, o card de conferência continua visível e
   * editável (o usuário pode ajustar uma peça e clicar em "Gerar lista"
   * de novo, atualizando o resultado sem escondê-lo).
   */
  previewVisible: boolean;
  resultVisible: boolean;

  /** Mensagem de status exibida ao lado do botão "Enviar foto" (fluxo de OCR). */
  photoStatus: string;

  /** Se `photoStatus` representa um erro (classe .error no legado). */
  photoStatusIsError: boolean;
}

export type CutListAction =
  | { type: 'RAW_TEXT_CHANGED'; text: string }
  | {
      type: 'ANALYZE_SUCCEEDED';
      pieces: Piece[];
      discarded: DiscardedItem[];
      materialMentioned: boolean;
      idCounter: number;
    }
  | { type: 'SHOW_ERROR'; message: string }
  | { type: 'ERROR_MODAL_CLOSED' }
  | { type: 'CLEAR_INPUT' }
  | { type: 'MM_ANSWERED'; factor: number }
  | { type: 'THREE_LADOS_ANSWERED'; choice: 'maior' | 'menor' }
  | { type: 'FITA_MISSING_ANSWERED'; fitaType: FitamentoType }
  | { type: 'MATERIAL_CONFIRMED'; material: string }
  | { type: 'DISCARD_RETRY_FAILED'; index: number; message: string }
  | { type: 'DISCARD_RETRY_SUCCEEDED_AS_PENDING'; index: number; rescued: Piece; idCounter: number }
  | { type: 'DISCARD_RETRY_SUCCEEDED'; index: number; rescued: Piece; idCounter: number }
  | { type: 'PIECE_FIELD_EDITED'; id: string; field: EditablePieceTextField; value: string }
  | { type: 'PIECE_FITA_EDITED'; id: string; field: EditablePieceFitaField; checked: boolean }
  | { type: 'PIECE_REMOVED'; id: string }
  | { type: 'GENERATE_SUCCEEDED' }
  | { type: 'NEW_LIST' }
  | { type: 'PHOTO_MATERIAL_MODAL_OPENED' }
  | { type: 'PHOTO_MATERIAL_MODAL_CLOSED' }
  | { type: 'PHOTO_STATUS_CHANGED'; message: string; isError: boolean }
  | { type: 'RAW_TEXT_APPENDED'; block: string };
