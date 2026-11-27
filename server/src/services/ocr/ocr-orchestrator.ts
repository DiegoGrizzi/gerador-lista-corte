import { describeError, logEvent, type LogLevel } from '../event-log.js';
import { OcrFailureError, type OcrProvider } from './types.js';

/** Para onde vai o motivo de cada tentativa. Injetável para os testes. */
export type OcrLogger = (level: LogLevel, message: string) => void;

const defaultLogger: OcrLogger = (level, message) => logEvent(level, 'foto', message);

export interface OcrOrchestratorOptions {
  minUsefulChars: number;
}

export interface OcrOrchestratorProviders {
  primary: OcrProvider;
  fallback: OcrProvider;
}

export interface OcrOrchestratorResult {
  text: string;
  engine: string;
}

/**
 * Tenta o provider primário; se ele falhar ou devolver texto curto demais
 * para ser útil, tenta o provider de fallback. Não depende de config nem
 * de instâncias reais de provider — tudo é injetado, o que torna a função
 * fácil de testar com providers falsos.
 */
export async function runOcrWithFallback(
  imageBuffer: Buffer,
  providers: OcrOrchestratorProviders,
  opts: OcrOrchestratorOptions,
  log: OcrLogger = defaultLogger,
): Promise<OcrOrchestratorResult> {
  const primaryName = providers.primary.name;
  const fallbackName = providers.fallback.name;

  try {
    const result = await providers.primary.recognize(imageBuffer);
    const usefulChars = result.text.trim().length;
    if (usefulChars >= opts.minUsefulChars) {
      log('info', `Lido pelo ${primaryName}: ${usefulChars} caracteres.`);
      return { text: result.text, engine: primaryName };
    }
    log(
      'warn',
      `${primaryName} leu só ${usefulChars} caracteres (mínimo ${opts.minUsefulChars}); tentando ${fallbackName}.`,
    );
  } catch (error) {
    log('warn', `${primaryName} falhou (tentando ${fallbackName}): ${describeError(error)}`);
  }

  try {
    const fallbackResult = await providers.fallback.recognize(imageBuffer);
    const usefulChars = fallbackResult.text.trim().length;
    if (usefulChars > 0) {
      log('info', `Lido pelo ${fallbackName}: ${usefulChars} caracteres.`);
      return { text: fallbackResult.text, engine: fallbackName };
    }
    log('error', `${fallbackName} não devolveu texto nenhum.`);
  } catch (error) {
    log('error', `${fallbackName} falhou: ${describeError(error)}`);
  }

  throw new OcrFailureError('Nenhum engine de OCR conseguiu ler o texto da imagem.');
}
