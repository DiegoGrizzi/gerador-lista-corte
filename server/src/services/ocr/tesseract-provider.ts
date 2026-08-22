import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

import { cleanupTempFile, writeTempImage } from '../temp-file.js';
import { OcrFailureError, type OcrProvider, type OcrResult } from './types.js';

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

  async recognize(imageBuffer: Buffer): Promise<OcrResult> {
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
