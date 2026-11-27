import { useServerLog } from '../hooks/useServerLog.js';
import type { LogLevel } from '../lib/api/logs.js';

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: 'ok',
  warn: 'aviso',
  error: 'erro',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface LogPanelProps {
  /** Só busca o log enquanto a aba está aberta. */
  active: boolean;
}

/**
 * Aba "Log": o que o servidor registrou nas últimas leituras de foto e PDF —
 * o formato e o tamanho do que chegou, qual leitor foi usado e, quando deu
 * errado, o motivo de verdade (que a mensagem na tela não mostra).
 */
export function LogPanel({ active }: LogPanelProps): JSX.Element {
  const { entries, error, loading, refresh } = useServerLog(active);

  return (
    <section className="card log-card" aria-label="Log do servidor">
      <div className="log-header">
        <div>
          <h2>Log do servidor</h2>
          <p className="hint">
            O que aconteceu nas últimas leituras de foto e PDF, mais recente primeiro. Atualiza sozinho
            a cada 5 segundos e zera quando o servidor reinicia.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error ? <p className="log-error">Não consegui buscar o log: {error}</p> : null}

      {entries.length === 0 && !error ? (
        <p className="log-empty">Nada registrado ainda. Envie uma foto ou um PDF e volte aqui.</p>
      ) : (
        <ol className="log-list">
          {entries.map((entry) => (
            <li key={entry.id} className={`log-entry log-${entry.level}`}>
              <span className="log-time mono">{formatTime(entry.time)}</span>
              <span className={`log-level log-level-${entry.level}`}>{LEVEL_LABEL[entry.level]}</span>
              <span className="log-source mono">{entry.source}</span>
              <span className="log-message">{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
