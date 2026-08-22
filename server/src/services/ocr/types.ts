export interface OcrResult {
  text: string;
}

export interface OcrProvider {
  readonly name: string;
  recognize(imageBuffer: Buffer): Promise<OcrResult>;
}

/**
 * Erro lançado quando um engine de OCR falha de forma "esperada" (não
 * instalado, chave ausente, resposta de erro da API, etc). Sempre carrega
 * uma mensagem amigável em português, segura para devolver ao cliente.
 */
export class OcrFailureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OcrFailureError';
  }
}
