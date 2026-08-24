import { describe, expect, it } from 'vitest';
import type { DiscardedItem, ParseContext, Piece } from '@corte-cloud/parser';
import {
  createInitialState,
  createNextId,
  cutListReducer,
  looksLikeNoMaterial,
  MSG_EMPTY_TEXT,
} from './cutListReducer.js';
import type { CutListState } from './types.js';

function makePiece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'p0',
    material: 'MDF branco',
    complemento: '',
    funcao: '',
    qtd: 2,
    compr: 500,
    larg: 300,
    thicknessMm: 15,
    fitaType: null,
    customFita: null,
    isOverride: false,
    note: '',
    fita: { c1: false, c2: false, l1: false, l2: false },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ParseContext> = {}): ParseContext {
  return {
    material: '',
    complemento: '',
    funcao: '',
    fitaType: null,
    thicknessMm: null,
    ...overrides,
  };
}

function makeDiscarded(overrides: Partial<DiscardedItem> = {}): DiscardedItem {
  return { text: '2 25x30', suggested: null, context: makeContext(), ...overrides };
}

describe('createInitialState', () => {
  it('começa sem peças, sem modal aberto e com os dois cards escondidos', () => {
    const state = createInitialState();
    expect(state.pieces).toEqual([]);
    expect(state.discardedItems).toEqual([]);
    expect(state.activeModal).toBe('none');
    expect(state.previewVisible).toBe(false);
    expect(state.resultVisible).toBe(false);
    expect(state.idCounter).toBe(0);
  });
});

describe('RAW_TEXT_CHANGED', () => {
  it('atualiza o texto colado', () => {
    const state = createInitialState();
    const next = cutListReducer(state, { type: 'RAW_TEXT_CHANGED', text: 'MDF branco\n2=50/30' });
    expect(next.rawText).toBe('MDF branco\n2=50/30');
  });
});

describe('SHOW_ERROR / ERROR_MODAL_CLOSED', () => {
  it('abre o modal de erro com a mensagem informada, e fecha limpando a mensagem', () => {
    const state = createInitialState();
    const opened = cutListReducer(state, { type: 'SHOW_ERROR', message: MSG_EMPTY_TEXT });
    expect(opened.activeModal).toBe('error');
    expect(opened.errorMessage).toBe(MSG_EMPTY_TEXT);

    const closed = cutListReducer(opened, { type: 'ERROR_MODAL_CLOSED' });
    expect(closed.activeModal).toBe('none');
    expect(closed.errorMessage).toBe('');
  });
});

describe('ANALYZE_SUCCEEDED', () => {
  it('quando há peças, abre o modal de mm e NÃO revela a conferência ainda', () => {
    const state = createInitialState();
    const piece = makePiece();
    const next = cutListReducer(state, {
      type: 'ANALYZE_SUCCEEDED',
      pieces: [piece],
      discarded: [],
      materialMentioned: true,
      idCounter: 1,
    });

    expect(next.activeModal).toBe('mm');
    expect(next.previewVisible).toBe(false);
    expect(next.pieces).toEqual([piece]);
    expect(next.materialAsked).toBe(true);
    expect(next.idCounter).toBe(1);
    // reseta o que dependia da mensagem anterior
    expect(next.mmAsked).toBe(false);
    expect(next.mmFactor).toBe(1);
    expect(next.materialFallback).toBe('');
    expect(next.pendingRescuedPiece).toBeNull();
  });

  it('quando não há peças (só descartes), vai direto para a conferência sem passar pelo modal de mm', () => {
    const state = createInitialState();
    const discarded = [makeDiscarded()];
    const next = cutListReducer(state, {
      type: 'ANALYZE_SUCCEEDED',
      pieces: [],
      discarded,
      materialMentioned: false,
      idCounter: 0,
    });

    expect(next.activeModal).toBe('none');
    expect(next.previewVisible).toBe(true);
    expect(next.discardedItems).toEqual(discarded);
  });

  it('mensagem vazia (validada fora do reducer) deve resultar em SHOW_ERROR — cobertura do texto exato', () => {
    // A validação de texto vazio acontece em App.handleAnalyze antes de despachar
    // qualquer ação; aqui só garantimos que a mensagem legada continua exata.
    expect(MSG_EMPTY_TEXT).toBe('Cole a mensagem com as medidas antes de clicar em "Analisar mensagem".');
  });
});

describe('CLEAR_INPUT', () => {
  it('limpa texto, peças, descartes e esconde os dois cards, mas preserva idCounter', () => {
    const state: CutListState = {
      ...createInitialState(),
      rawText: 'algo',
      pieces: [makePiece()],
      discardedItems: [makeDiscarded()],
      idCounter: 7,
      materialAsked: true,
      previewVisible: true,
      resultVisible: true,
      photoStatus: 'Atenção: reconheci 14 de 15 linhas...',
      photoStatusIsError: true,
    };

    const next = cutListReducer(state, { type: 'CLEAR_INPUT' });

    expect(next.rawText).toBe('');
    expect(next.pieces).toEqual([]);
    expect(next.discardedItems).toEqual([]);
    expect(next.previewVisible).toBe(false);
    expect(next.resultVisible).toBe(false);
    expect(next.materialAsked).toBe(false);
    expect(next.idCounter).toBe(7);
    // Bug real reportado pelo usuário: a mensagem de status da foto (ex:
    // aviso de OCR incompleto) ficava presa na tela mesmo depois de "Limpar".
    expect(next.photoStatus).toBe('');
    expect(next.photoStatusIsError).toBe(false);
  });
});

describe('MM_ANSWERED', () => {
  it('fator 1 (já em mm): não altera as medidas, revela a conferência quando material já foi perguntado', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [makePiece({ compr: 500, larg: 300 })],
      materialAsked: true,
      activeModal: 'mm',
    };

    const next = cutListReducer(state, { type: 'MM_ANSWERED', factor: 1 });

    expect(next.pieces[0]!.compr).toBe(500);
    expect(next.pieces[0]!.larg).toBe(300);
    expect(next.mmAsked).toBe(true);
    expect(next.mmFactor).toBe(1);
    expect(next.activeModal).toBe('none');
    expect(next.previewVisible).toBe(true);
  });

  it('fator 10 (cm→mm): multiplica compr/larg por 10', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [makePiece({ compr: 50, larg: 30 })],
      materialAsked: true,
    };

    const next = cutListReducer(state, { type: 'MM_ANSWERED', factor: 10 });

    expect(next.pieces[0]!.compr).toBe(500);
    expect(next.pieces[0]!.larg).toBe(300);
  });

  it('aplica a regra do sentido do veio (>1840mm) depois da conversão, trocando compr/larg e a fita', () => {
    // 200cm de largura => 2000mm depois de convertida, acima do limiar de 1840mm
    const state: CutListState = {
      ...createInitialState(),
      pieces: [makePiece({ compr: 100, larg: 200, fita: { c1: false, c2: false, l1: true, l2: false } })],
      materialAsked: true,
    };

    const next = cutListReducer(state, { type: 'MM_ANSWERED', factor: 10 });
    const piece = next.pieces[0]!;

    expect(piece.compr).toBe(2000);
    expect(piece.larg).toBe(1000);
    expect(piece.wasInverted).toBe(true);
    // a fita segue a medida física: estava em L1, agora essa borda é C1
    expect(piece.fita).toEqual({ c1: true, c2: false, l1: false, l2: false });
  });

  it('abre o modal de material quando ainda não foi perguntado e existem peças (não revela a conferência ainda)', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [makePiece()],
      materialAsked: false,
    };

    const next = cutListReducer(state, { type: 'MM_ANSWERED', factor: 1 });

    expect(next.activeModal).toBe('material');
    expect(next.previewVisible).toBe(false);
  });

  it('converte e adiciona a peça pendente de resgate (pendingRescuedPiece), aplicando o material de fallback', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [],
      materialAsked: true,
      materialFallback: 'MDF branco',
      pendingRescuedPiece: makePiece({ id: 'p9', material: '15mm', compr: 40, larg: 20 }),
    };

    const next = cutListReducer(state, { type: 'MM_ANSWERED', factor: 10 });

    expect(next.pendingRescuedPiece).toBeNull();
    expect(next.pieces).toHaveLength(1);
    expect(next.pieces[0]!.compr).toBe(400);
    expect(next.pieces[0]!.larg).toBe(200);
    // "15mm" sozinho conta como "sem material" -> recebe o fallback como prefixo
    expect(next.pieces[0]!.material).toBe('MDF branco 15mm');
  });

  it('não muta a peça original do estado anterior (imutabilidade)', () => {
    const original = makePiece({ compr: 50, larg: 30 });
    const state: CutListState = { ...createInitialState(), pieces: [original], materialAsked: true };

    cutListReducer(state, { type: 'MM_ANSWERED', factor: 10 });

    expect(original.compr).toBe(50);
    expect(original.larg).toBe(30);
  });
});

describe('MATERIAL_CONFIRMED / MATERIAL_SKIPPED', () => {
  it('material vazio (só espaços) equivale a pular: marca materialAsked mas não aplica fallback', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [makePiece({ material: '' })],
    };

    const next = cutListReducer(state, { type: 'MATERIAL_CONFIRMED', material: '   ' });

    expect(next.materialAsked).toBe(true);
    expect(next.materialFallback).toBe('');
    expect(next.pieces[0]!.material).toBe('');
    expect(next.previewVisible).toBe(true);
    expect(next.activeModal).toBe('none');
  });

  it('material confirmado é aplicado só às peças sem material (looksLikeNoMaterial)', () => {
    const state: CutListState = {
      ...createInitialState(),
      pieces: [
        makePiece({ id: 'a', material: '' }),
        makePiece({ id: 'b', material: '15mm' }),
        makePiece({ id: 'c', material: 'MDF preto 15mm' }),
      ],
    };

    const next = cutListReducer(state, { type: 'MATERIAL_CONFIRMED', material: '  MDF branco  ' });

    expect(next.materialFallback).toBe('MDF branco');
    expect(next.pieces.find((p) => p.id === 'a')!.material).toBe('MDF branco');
    expect(next.pieces.find((p) => p.id === 'b')!.material).toBe('MDF branco 15mm');
    // já tinha material -> não mexe
    expect(next.pieces.find((p) => p.id === 'c')!.material).toBe('MDF preto 15mm');
  });

  it('MATERIAL_SKIPPED marca materialAsked e revela a conferência sem tocar nas peças', () => {
    const state: CutListState = { ...createInitialState(), pieces: [makePiece({ material: '' })] };
    const next = cutListReducer(state, { type: 'MATERIAL_SKIPPED' });

    expect(next.materialAsked).toBe(true);
    expect(next.pieces[0]!.material).toBe('');
    expect(next.previewVisible).toBe(true);
  });
});

describe('looksLikeNoMaterial', () => {
  it('verdadeiro para vazio ou só espessura', () => {
    expect(looksLikeNoMaterial('')).toBe(true);
    expect(looksLikeNoMaterial('15mm')).toBe(true);
    expect(looksLikeNoMaterial('15,5mm')).toBe(true);
  });

  it('falso quando há nome de material', () => {
    expect(looksLikeNoMaterial('MDF branco 15mm')).toBe(false);
    expect(looksLikeNoMaterial('branco')).toBe(false);
  });
});

describe('fluxo de descarte: DISCARD_RETRY_FAILED / DISCARD_RETRY_SUCCEEDED*', () => {
  it('DISCARD_RETRY_FAILED grava a mensagem de erro inline no índice do item', () => {
    const state: CutListState = {
      ...createInitialState(),
      discardedItems: [makeDiscarded()],
    };
    const next = cutListReducer(state, { type: 'DISCARD_RETRY_FAILED', index: 0, message: 'erro' });
    expect(next.discardErrors[0]).toBe('erro');
    // não mexe nos itens descartados
    expect(next.discardedItems).toHaveLength(1);
  });

  it('DISCARD_RETRY_SUCCEEDED_AS_PENDING (mm ainda não perguntado): guarda a peça como pendente e abre o modal de mm', () => {
    const state: CutListState = {
      ...createInitialState(),
      discardedItems: [makeDiscarded(), makeDiscarded({ text: 'outra' })],
      mmAsked: false,
    };
    const rescued = makePiece({ id: 'rescued' });

    const next = cutListReducer(state, {
      type: 'DISCARD_RETRY_SUCCEEDED_AS_PENDING',
      index: 0,
      rescued,
      idCounter: 5,
    });

    expect(next.discardedItems).toEqual([makeDiscarded({ text: 'outra' })]);
    expect(next.pendingRescuedPiece).toEqual(rescued);
    expect(next.activeModal).toBe('mm');
    expect(next.pieces).toEqual([]);
    expect(next.idCounter).toBe(5);
  });

  it('DISCARD_RETRY_SUCCEEDED (mm já respondido): converte, aplica fallback, adiciona à lista e revela a conferência', () => {
    const state: CutListState = {
      ...createInitialState(),
      discardedItems: [makeDiscarded()],
      mmAsked: true,
      mmFactor: 10,
      materialAsked: true,
      materialFallback: 'MDF branco',
    };
    const rescued = makePiece({ id: 'rescued', compr: 40, larg: 20, material: '15mm' });

    const next = cutListReducer(state, { type: 'DISCARD_RETRY_SUCCEEDED', index: 0, rescued, idCounter: 3 });

    expect(next.discardedItems).toEqual([]);
    expect(next.pieces).toHaveLength(1);
    expect(next.pieces[0]!.compr).toBe(400);
    expect(next.pieces[0]!.larg).toBe(200);
    expect(next.pieces[0]!.material).toBe('MDF branco 15mm');
    expect(next.previewVisible).toBe(true);
    expect(next.idCounter).toBe(3);
  });

  it('DISCARD_RETRY_SUCCEEDED abre o modal de material quando a peça resgatada ainda não tem material e ele não foi perguntado', () => {
    const state: CutListState = {
      ...createInitialState(),
      discardedItems: [makeDiscarded()],
      mmAsked: true,
      mmFactor: 1,
      materialAsked: false,
    };
    const rescued = makePiece({ id: 'rescued', material: '' });

    const next = cutListReducer(state, { type: 'DISCARD_RETRY_SUCCEEDED', index: 0, rescued, idCounter: 1 });

    expect(next.activeModal).toBe('material');
  });

  it('reindexa os erros inline de descarte quando um item no meio da lista é removido', () => {
    const state: CutListState = {
      ...createInitialState(),
      discardedItems: [makeDiscarded({ text: 'a' }), makeDiscarded({ text: 'b' }), makeDiscarded({ text: 'c' })],
      discardErrors: { 0: 'erro a', 2: 'erro c' },
      mmAsked: true,
    };
    const rescued = makePiece();

    // remove o item do meio (índice 1, "b") — "c" passa a ser o índice 1
    const next = cutListReducer(state, { type: 'DISCARD_RETRY_SUCCEEDED', index: 1, rescued, idCounter: 1 });

    expect(next.discardedItems.map((i) => i.text)).toEqual(['a', 'c']);
    expect(next.discardErrors).toEqual({ 0: 'erro a', 1: 'erro c' });
  });
});

describe('edição de peças na tabela de conferência', () => {
  const baseState: CutListState = {
    ...createInitialState(),
    pieces: [makePiece({ id: 'p1' }), makePiece({ id: 'p2' })],
  };

  it('PIECE_FIELD_EDITED (qtd): converte para inteiro, 0 em caso de NaN', () => {
    const next = cutListReducer(baseState, { type: 'PIECE_FIELD_EDITED', id: 'p1', field: 'qtd', value: '7' });
    expect(next.pieces.find((p) => p.id === 'p1')!.qtd).toBe(7);

    const invalid = cutListReducer(baseState, { type: 'PIECE_FIELD_EDITED', id: 'p1', field: 'qtd', value: 'abc' });
    expect(invalid.pieces.find((p) => p.id === 'p1')!.qtd).toBe(0);
  });

  it('PIECE_FIELD_EDITED (compr/larg): usa toNumber (vírgula decimal), 0 em caso de NaN', () => {
    const next = cutListReducer(baseState, {
      type: 'PIECE_FIELD_EDITED',
      id: 'p1',
      field: 'compr',
      value: "56'5",
    });
    expect(next.pieces.find((p) => p.id === 'p1')!.compr).toBe(56.5);

    const invalid = cutListReducer(baseState, { type: 'PIECE_FIELD_EDITED', id: 'p1', field: 'larg', value: 'xx' });
    expect(invalid.pieces.find((p) => p.id === 'p1')!.larg).toBe(0);
  });

  it('PIECE_FIELD_EDITED (texto): material/complemento/função são atribuídos direto', () => {
    const next = cutListReducer(baseState, {
      type: 'PIECE_FIELD_EDITED',
      id: 'p2',
      field: 'material',
      value: 'MDF preto',
    });
    expect(next.pieces.find((p) => p.id === 'p2')!.material).toBe('MDF preto');
    // não afeta outras peças
    expect(next.pieces.find((p) => p.id === 'p1')!.material).toBe(baseState.pieces[0]!.material);
  });

  it('PIECE_FITA_EDITED alterna o booleano correto sem afetar os outros três', () => {
    const next = cutListReducer(baseState, { type: 'PIECE_FITA_EDITED', id: 'p1', field: 'l2', checked: true });
    expect(next.pieces.find((p) => p.id === 'p1')!.fita).toEqual({ c1: false, c2: false, l1: false, l2: true });
  });

  it('PIECE_REMOVED remove só a peça com o id informado', () => {
    const next = cutListReducer(baseState, { type: 'PIECE_REMOVED', id: 'p1' });
    expect(next.pieces.map((p) => p.id)).toEqual(['p2']);
  });
});

describe('GENERATE_SUCCEEDED / NEW_LIST', () => {
  it('GENERATE_SUCCEEDED revela o card de resultado', () => {
    const state = createInitialState();
    const next = cutListReducer(state, { type: 'GENERATE_SUCCEEDED' });
    expect(next.resultVisible).toBe(true);
  });

  it('NEW_LIST volta ao estado inicial, mas preserva idCounter (nunca reiniciado, como no legado)', () => {
    const state: CutListState = {
      ...createInitialState(),
      idCounter: 12,
      pieces: [makePiece()],
      resultVisible: true,
      previewVisible: true,
      rawText: 'algo',
    };
    const next = cutListReducer(state, { type: 'NEW_LIST' });

    expect(next).toEqual({ ...createInitialState(), idCounter: 12 });
  });
});

describe('fluxo de foto/OCR (ações de status e handoff de texto)', () => {
  it('PHOTO_MATERIAL_MODAL_OPENED / CLOSED alternam o modal ativo', () => {
    const opened = cutListReducer(createInitialState(), { type: 'PHOTO_MATERIAL_MODAL_OPENED' });
    expect(opened.activeModal).toBe('photoMaterial');
    const closed = cutListReducer(opened, { type: 'PHOTO_MATERIAL_MODAL_CLOSED' });
    expect(closed.activeModal).toBe('none');
  });

  it('PHOTO_STATUS_CHANGED atualiza mensagem e flag de erro', () => {
    const next = cutListReducer(createInitialState(), {
      type: 'PHOTO_STATUS_CHANGED',
      message: 'Lendo foto 1 de 2...',
      isError: false,
    });
    expect(next.photoStatus).toBe('Lendo foto 1 de 2...');
    expect(next.photoStatusIsError).toBe(false);
  });

  it('RAW_TEXT_APPENDED anexa com linha em branco quando já há texto, ou substitui quando vazio', () => {
    const empty = cutListReducer(createInitialState(), { type: 'RAW_TEXT_APPENDED', block: 'MDF branco\n2=50/30' });
    expect(empty.rawText).toBe('MDF branco\n2=50/30');

    const withExisting = cutListReducer(
      { ...createInitialState(), rawText: '  texto existente  ' },
      { type: 'RAW_TEXT_APPENDED', block: 'MDF branco\n2=50/30' },
    );
    expect(withExisting.rawText).toBe('texto existente\n\nMDF branco\n2=50/30');
  });
});

describe('createNextId', () => {
  it('gera ids sequenciais a partir da semente e reporta o contador final', () => {
    const { nextId, getIdCounter } = createNextId(3);
    expect(nextId()).toBe('p3');
    expect(nextId()).toBe('p4');
    expect(getIdCounter()).toBe(5);
  });
});
