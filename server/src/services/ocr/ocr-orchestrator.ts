import { OcrFailureError, type OcrProvider } from './types.js';

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
): Promise<OcrOrchestratorResult> {
  try {
    const result = await providers.primary.recognize(imageBuffer);
    if (result.text.trim().length >= opts.minUsefulChars) {
      return { text: result.text, engine: providers.primary.name };
    }
  } catch {
    // Primário falhou — tenta o fallback abaixo.
  }

  try {
    const fallbackResult = await providers.fallback.recognize(imageBuffer);
    if (fallbackResult.text.trim().length > 0) {
      return { text: fallbackResult.text, engine: providers.fallback.name };
    }
  } catch {
    // Fallback também falhou — cai no erro final abaixo.
  }

  throw new OcrFailureError('Nenhum engine de OCR conseguiu ler o texto da imagem.');
}
