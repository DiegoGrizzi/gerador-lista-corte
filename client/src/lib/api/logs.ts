/**
 * logs.ts
 * ---------------------------------------------------------------------------
 * Cliente HTTP para GET /api/logs (@corte-cloud/server): o registro do que
 * aconteceu nas últimas leituras de foto/PDF, mostrado na aba "Log".
 * ---------------------------------------------------------------------------
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  /** ISO 8601, horário do servidor. */
  time: string;
  level: LogLevel;
  /** 'foto', 'pdf' ou 'servidor'. */
  source: string;
  message: string;
}

interface LogsResponse {
  entries: LogEntry[];
}

/** Entradas mais recentes primeiro. Lança erro se o servidor não responder. */
export async function getLogEntries(): Promise<LogEntry[]> {
  const response = await fetch('/api/logs', { cache: 'no-store' });
  if (!response.ok) throw new Error(`O servidor respondeu ${response.status}.`);
  const data = (await response.json()) as LogsResponse;
  return data.entries;
}
