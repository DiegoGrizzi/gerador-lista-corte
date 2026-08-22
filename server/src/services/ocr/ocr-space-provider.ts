import sharp from 'sharp';

import { OcrFailureError, type OcrProvider, type OcrResult } from './types.js';

export interface OcrSpaceProviderOptions {
  apiKey: string | undefined;
  endpoint: string;
}

interface OcrSpaceParsedResult {
  ParsedText?: string;
}

interface OcrSpaceResponse {
  ParsedResults?: OcrSpaceParsedResult[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
}

const MAX_BYTES_BEFORE_COMPRESSION = 1_000_000; // ~1MB, limite do plano gratuito do OCR.space

/**
 * Reduz o tamanho de imagens grandes (fotos de celular costumam vir com
 * vários MB) para caber no limite do plano gratuito do OCR.space. O
 * Tesseract local não tem esse limite, então essa etapa só é necessária
 * aqui.
 */
async function ensureUnderSizeLimit(imageBuffer: Buffer): Promise<Buffer> {
  if (imageBuffer.byteLength <= MAX_BYTES_BEFORE_COMPRESSION) {
    return imageBuffer;
  }

  try {
    return await sharp(imageBuffer)
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (error) {
    throw new OcrFailureError('Não consegui reduzir o tamanho da imagem para envio ao OCR.space.', {
      cause: error,
    });
  }
}

function errorMessageToString(errorMessage: string | string[] | undefined): string {
  if (!errorMessage) return 'Erro desconhecido retornado pelo OCR.space.';
  return Array.isArray(errorMessage) ? errorMessage.join('; ') : errorMessage;
}

export class OcrSpaceProvider implements OcrProvider {
  readonly name = 'ocr-space';

  private readonly apiKey: string | undefined;
  private readonly endpoint: string;

  constructor(options: OcrSpaceProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint;
  }

  async recognize(imageBuffer: Buffer): Promise<OcrResult> {
    if (!this.apiKey) {
      throw new OcrFailureError(
        'Fallback via OCR.space está desativado porque OCR_SPACE_API_KEY não foi configurada.',
      );
    }

    const preparedBuffer = await ensureUnderSizeLimit(imageBuffer);
    const base64Image = `data:image/png;base64,${preparedBuffer.toString('base64')}`;

    const form = new URLSearchParams();
    form.set('apikey', this.apiKey);
    form.set('base64Image', base64Image);
    form.set('language', 'por');
    form.set('isOverlayRequired', 'false');

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    } catch (error) {
      throw new OcrFailureError('Não consegui conectar ao serviço OCR.space.', { cause: error });
    }

    if (!response.ok) {
      throw new OcrFailureError(`OCR.space respondeu com status ${response.status}.`);
    }

    let data: OcrSpaceResponse;
    try {
      data = (await response.json()) as OcrSpaceResponse;
    } catch (error) {
      throw new OcrFailureError('Não consegui interpretar a resposta do OCR.space.', { cause: error });
    }

    const parsedResults = data.ParsedResults ?? [];
    const firstResult = parsedResults[0];

    if (data.IsErroredOnProcessing || !firstResult) {
      throw new OcrFailureError(`OCR.space não conseguiu processar a imagem: ${errorMessageToString(data.ErrorMessage)}`);
    }

    return { text: firstResult.ParsedText ?? '' };
  }
}
