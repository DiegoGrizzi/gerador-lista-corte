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
  let primaryText: string | undefined;

  try {
    const result = await providers.primary.recognize(imageBuffer);
    primaryText = result.text;
    if (primaryText.trim().length >= opts.minUsefulChars) {
      return { text: primaryText, engine: providers.primary.name };
    }
  } catch {
    primaryText = undefined;
  }

  try {
    const fallbackResult = await providers.fallback.recognize(imageBuffer);
    if (fallbackResult.text.trim().length > 0) {
      return { text: fallbackResult.text, engine: providers.fallback.name };
    }
  } catch {
    // segue para o erro final abaixo
  }

  // Se o primário ao menos devolveu algum texto (ainda que curto) e o
  // fallback não trouxe nada melhor, usa o que o primário conseguiu.
  if (primaryText !== undefined && primaryText.trim().length > 0) {
    return { text: primaryText, engine: providers.primary.name };
  }

  throw new OcrFailureError('Nenhum engine de OCR conseguiu ler o texto da imagem.');
}
