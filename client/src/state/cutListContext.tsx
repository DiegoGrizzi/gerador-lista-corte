/**
 * cutListContext.tsx
 * ---------------------------------------------------------------------------
 * Contexto React em torno do useReducer único que substitui as variáveis de
 * módulo do app.js legado. `useCutList()` devolve `{ state, dispatch }`,
 * consumido por todos os componentes da árvore.
 * ---------------------------------------------------------------------------
 */

import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { createInitialState, cutListReducer } from './cutListReducer.js';
import type { CutListAction, CutListState } from './types.js';

interface CutListContextValue {
  state: CutListState;
  dispatch: Dispatch<CutListAction>;
}

const CutListContext = createContext<CutListContextValue | null>(null);

export function CutListProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(cutListReducer, undefined, createInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <CutListContext.Provider value={value}>{children}</CutListContext.Provider>;
}

export function useCutList(): CutListContextValue {
  const ctx = useContext(CutListContext);
  if (!ctx) throw new Error('useCutList deve ser usado dentro de <CutListProvider>.');
  return ctx;
}
