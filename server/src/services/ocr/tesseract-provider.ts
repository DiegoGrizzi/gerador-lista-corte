import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

import sharp from 'sharp';

import { cleanupTempFile, writeTempImage } from '../temp-file.js';
import { OcrFailureError, type OcrProvider, type OcrResult } from './types.js';

/**
 * Largura mínima (em pixels) abaixo da qual a imagem é ampliada antes do
 * OCR. Caso real: um print de tela de 457×209px — bem comum quando o
 * usuário manda um recorte pequeno em vez de uma foto de celular (que já
 * costuma vir bem maior que isso) — não reconhecia NADA do texto da
 * tabela nessa resolução original; ampliada 4x, o Tesseract leu quase
 * tudo certo. Mesmo princípio já validado em pdf-renderer.ts
 * (RENDER_SCALE) para as páginas de PDF renderizadas.
 */
const MIN_WIDTH_PX = 1600;

/**
 * Amplia a imagem antes do OCR se ela for menor que MIN_WIDTH_PX de
 * largura — fotos de celular normais já vêm bem maiores que isso e saem
 * inalteradas; só ajuda prints/recortes pequenos. Se a imagem não for
 * processável por algum motivo (buffer corrompido, formato não suportado),
 * devolve o buffer original sem travar o OCR — mais vale tentar ler do
 * jeito que veio do que falhar tudo por causa de um passo opcional.
 */
async function upscaleIfSmall(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || metadata.width >= MIN_WIDTH_PX) return imageBuffer;
    return await sharp(imageBuffer).resize({ width: MIN_WIDTH_PX, kernel: 'lanczos3' }).toBuffer();
  } catch {
    return imageBuffer;
  }
}

export interface TesseractProviderOptions {
  tesseractPath: string;
  lang: string;
}

/** Executa o binário do tesseract e devolve o caminho do arquivo de texto gerado. */
function runTesseractCli(tesseractPath: string, imagePath: string, outputBase: string, lang: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(tesseractPath, [imagePath, outputBase, '-l', lang], (error) => {
      if (error) {
        const errno = (error as NodeJS.ErrnoException).code;
        if (errno === 'ENOENT') {
          reject(
            new OcrFailureError(
              `Tesseract não encontrado em "${tesseractPath}". Confira se está instalado e se a variável TESSERACT_PATH aponta para o caminho correto (ou se "tesseract" está no PATH do sistema).`,
              { cause: error },
            ),
          );
          return;
        }
        reject(new OcrFailureError(`Falha ao executar o Tesseract: ${error.message}`, { cause: error }));
        return;
      }
      resolve();
    });
  });
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract';

  private readonly tesseractPath: string;
  private readonly lang: string;

  constructor(options: TesseractProviderOptions) {
    this.tesseractPath = options.tesseractPath;
    this.lang = options.lang;
  }

  async recognize(rawImageBuffer: Buffer): Promise<OcrResult> {
    const imageBuffer = await upscaleIfSmall(rawImageBuffer);
    const imagePath = await writeTempImage(imageBuffer, '.png');
    const outputBase = imagePath.replace(/\.[^.]+$/, '');
    const outputTxtPath = `${outputBase}.txt`;

    try {
      await runTesseractCli(this.tesseractPath, imagePath, outputBase, this.lang);

      let text: string;
      try {
        text = await fs.readFile(outputTxtPath, 'utf8');
      } catch (readErr) {
        throw new OcrFailureError('Não consegui ler o resultado gerado pelo Tesseract.', { cause: readErr });
      }

      return { text };
    } finally {
      await cleanupTempFile(imagePath);
      await cleanupTempFile(outputTxtPath);
    }
  }
}
