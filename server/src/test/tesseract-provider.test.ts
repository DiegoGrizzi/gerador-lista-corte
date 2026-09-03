import { promises as fs } from 'node:fs';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (error: (Error & { code?: string }) | null) => void;

const execFileMock = vi.fn<
  (file: string, args: readonly string[], callback: ExecFileCallback) => void
>();

vi.mock('node:child_process', () => ({
  execFile: (file: string, args: readonly string[], callback: ExecFileCallback) => execFileMock(file, args, callback),
}));

// Importado depois do vi.mock para garantir que o provider use o mock acima.
const { TesseractOcrProvider } = await import('../services/ocr/tesseract-provider.js');

describe('TesseractOcrProvider', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lê o texto gerado pelo tesseract quando a execução tem sucesso', async () => {
    execFileMock.mockImplementation((_file, args, callback) => {
      const outputBase = args[1] as string;
      // Simula o tesseract escrevendo o arquivo de saída.
      void fs.writeFile(`${outputBase}.txt`, 'texto reconhecido pelo tesseract falso').then(() => callback(null));
    });

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    const result = await provider.recognize(Buffer.from('fake-image'));

    expect(result.text).toBe('texto reconhecido pelo tesseract falso');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [calledPath, calledArgs] = execFileMock.mock.calls[0]!;
    expect(calledPath).toBe('tesseract');
    expect(calledArgs).toEqual(expect.arrayContaining(['-l', 'por']));
  });

  it('amplia uma imagem pequena antes do OCR (caso real: print de tela de 457x209px onde o Tesseract não lia nada)', async () => {
    let writtenWidth: number | undefined;
    execFileMock.mockImplementation((_file, args, callback) => {
      const imagePath = args[0] as string;
      const outputBase = args[1] as string;
      // Lê as dimensões do arquivo temporário AQUI DENTRO, antes do
      // callback disparar - o recognize() apaga esse arquivo (cleanup) assim
      // que o tesseract "termina", então ler depois de esperar a Promise
      // do provider já seria tarde demais (arquivo já não existe mais).
      void sharp(imagePath)
        .metadata()
        .then((metadata) => {
          writtenWidth = metadata.width;
          return fs.writeFile(`${outputBase}.txt`, 'texto');
        })
        .then(() => callback(null));
    });

    // Imagem pequena de verdade (bem abaixo do limiar), não um buffer falso -
    // precisa ser uma imagem válida pro sharp conseguir processar.
    const smallImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    await provider.recognize(smallImage);

    expect(writtenWidth).toBeGreaterThanOrEqual(1600);
  });

  it('não mexe numa imagem que já é grande o bastante', async () => {
    let writtenWidth: number | undefined;
    execFileMock.mockImplementation((_file, args, callback) => {
      const imagePath = args[0] as string;
      const outputBase = args[1] as string;
      void sharp(imagePath)
        .metadata()
        .then((metadata) => {
          writtenWidth = metadata.width;
          return fs.writeFile(`${outputBase}.txt`, 'texto');
        })
        .then(() => callback(null));
    });

    const largeImage = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    await provider.recognize(largeImage);

    expect(writtenWidth).toBe(2000);
  });

  it('traduz erro ENOENT em mensagem amigável em português', async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
      callback(error);
    });

    const provider = new TesseractOcrProvider({ tesseractPath: 'C:\\caminho\\invalido\\tesseract.exe', lang: 'por' });

    await expect(provider.recognize(Buffer.from('fake-image'))).rejects.toThrow(
      /Tesseract não encontrado em "C:\\caminho\\invalido\\tesseract\.exe"/,
    );
  });
});
