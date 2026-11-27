/**
 * useServerLog.ts
 * ---------------------------------------------------------------------------
 * Busca o registro do servidor (GET /api/logs) enquanto a aba "Log" está
 * aberta: uma vez ao abrir e depois a cada poucos segundos, para a falha de
 * uma foto recém-enviada aparecer sem precisar recarregar a página. Fora da
 * aba não faz requisição nenhuma.
 * ---------------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import { getLogEntries, type LogEntry } from '../lib/api/logs.js';

const REFRESH_INTERVAL_MS = 5000;

export interface UseServerLogResult {
  entries: LogEntry[];
  /** Mensagem quando a última busca falhou; null quando deu certo. */
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useServerLog(active: boolean): UseServerLogResult {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getLogEntries());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui buscar o log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const refresh = useCallback(() => void load(), [load]);

  return { entries, error, loading, refresh };
}
