import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

import sharp from 'sharp';

import { cleanupTempFile, writeTempImage } from '../temp-file.js';
import { OcrFailureError, type OcrProvider, type OcrResult } from './types.js';

/**
 * Largura mínima (em pixels) usada para ampliar a imagem QUANDO a
 * primeira tentativa (sem ampliar) falha — ver recognize() abaixo sobre
 * por que isso é tentado como reserva, não sempre de cara.
 */
const UPSCALE_TARGET_WIDTH_PX = 1600;

/**
 * Quantidade mínima de caracteres (sem espaço) no texto reconhecido pra
 * contar como "leu alguma coisa de verdade" — abaixo disso, a primeira
 * tentativa é tratada como falha e a ampliada é tentada por cima. Bem
 * abaixo do que uma tabela real tem (algumas dezenas de caracteres só no
 * cabeçalho), mas acima do que sobra de um título solto sem nenhuma linha
 * da tabela reconhecida (caso real: só "ARMÁRIO DA ÁREA DE SERVIÇO -
 * MAIOR", 35 caracteres, com o resto da tabela inteiro perdido).
 */
const MIN_USEFUL_TEXT_CHARS = 50;

/**
 * Amplia a imagem pra UPSCALE_TARGET_WIDTH_PX de largura. Se a imagem não
 * for processável por algum motivo (buffer corrompido, formato não
 * suportado), devolve o buffer original sem travar o OCR.
 */
async function upscaleImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || metadata.width >= UPSCALE_TARGET_WIDTH_PX) return imageBuffer;
    return await sharp(imageBuffer).resize({ width: UPSCALE_TARGET_WIDTH_PX, kernel: 'lanczos3' }).toBuffer();
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

  /** Roda o Tesseract uma vez, no buffer de imagem exatamente como recebido (sem ampliar). */
  private async recognizeOnce(imageBuffer: Buffer): Promise<OcrResult> {
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

  /**
   * Tenta ler a imagem como veio primeiro, e só amplia como RESERVA se
   * isso não ler texto suficiente — nunca amplia de cara. Caso real que
   * motivou essa ordem: ampliar sempre que a imagem for "pequena" ajudava
   * um print de tela de 457×209px (nada legível na resolução original),
   * mas do mesmo jeito ATRAPALHAVA uma foto de tabela de 514×827px que já
   * lia perfeitamente sem ampliar — a ampliação (mesmo moderada) borra uma
   * imagem que já tinha resolução suficiente pro texto dela, sem
   * acrescentar informação real nenhuma. Não dá pra decidir só pelo
   * tamanho da imagem se ela "precisa" de ampliação; tentar sem ampliar
   * primeiro e comparar o resultado é o sinal confiável.
   */
  async recognize(rawImageBuffer: Buffer): Promise<OcrResult> {
    const firstAttempt = await this.recognizeOnce(rawImageBuffer);
    if (firstAttempt.text.trim().length >= MIN_USEFUL_TEXT_CHARS) return firstAttempt;

    const upscaled = await upscaleImage(rawImageBuffer);
    if (upscaled === rawImageBuffer) return firstAttempt;

    const secondAttempt = await this.recognizeOnce(upscaled);
    return secondAttempt.text.trim().length > firstAttempt.text.trim().length ? secondAttempt : firstAttempt;
  }
}
