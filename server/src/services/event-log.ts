/**
 * Registro do que aconteceu nas últimas leituras de foto/PDF, guardado na
 * memória do processo e mostrado na aba "Log" da interface (GET /api/logs).
 *
 * Existe porque a mensagem que o vendedor vê ("Nenhum engine de OCR conseguiu
 * ler...") é a mesma para causas bem diferentes: formato que o Tesseract não
 * abre, foto que ele leu quase nada, OCR.space sem chave ou fora do ar. O
 * motivo de verdade fica aqui.
 *
 * Só guarda metadados (formato, tamanho, quantos caracteres saíram, mensagem
 * de erro) — nunca a imagem nem o texto lido. Some quando o servidor reinicia.
 * Cada entrada também vai para o console, então aparece no `docker logs` e no
 * deploy/server.log das lojas.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  /** ISO 8601, horário do servidor. */
  time: string;
  level: LogLevel;
  /** De onde veio: 'foto', 'pdf' ou 'servidor'. */
  source: string;
  message: string;
}

const MAX_ENTRIES = 300;
const MAX_MESSAGE_CHARS = 600;

const entries: LogEntry[] = [];
let nextId = 1;

export function logEvent(level: LogLevel, source: string, message: string): void {
  const trimmed = message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message;
  entries.push({ id: nextId++, time: new Date().toISOString(), level, source, message: trimmed });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  const line = `[${source}] ${trimmed}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** As entradas mais recentes primeiro. */
export function getLogEntries(): LogEntry[] {
  return [...entries].reverse();
}

/** Só para os testes: zera o registro entre um caso e outro. */
export function clearLogEntries(): void {
  entries.length = 0;
}

/**
 * Mensagem de um erro junto com a da causa (`cause`), que é onde fica o
 * detalhe técnico: a saída do Tesseract, o erro de rede, etc.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  let cause: unknown = error.cause;
  for (let depth = 0; depth < 3 && cause instanceof Error; depth++) {
    const causeMessage = cause.message;
    if (!parts.some((part) => part.includes(causeMessage))) parts.push(causeMessage);
    cause = cause.cause;
  }
  return parts.join(' — causa: ').replace(/\s+/g, ' ').trim();
}

/** Formato da imagem pelos primeiros bytes (não pela extensão, que o navegador não manda). */
export function detectImageFormat(buffer: Buffer): string {
  const hex = buffer.subarray(0, 12).toString('hex');
  const ascii = buffer.subarray(0, 12).toString('latin1');
  if (hex.startsWith('89504e47')) return 'PNG';
  if (hex.startsWith('ffd8ff')) return 'JPEG';
  if (ascii.startsWith('GIF8')) return 'GIF';
  if (ascii.startsWith('BM')) return 'BMP';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'WebP';
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'TIFF';
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'HEIC (foto de iPhone)';
    if (brand === 'avif') return 'AVIF';
  }
  if (ascii.startsWith('%PDF')) return 'PDF';
  return 'desconhecido';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
