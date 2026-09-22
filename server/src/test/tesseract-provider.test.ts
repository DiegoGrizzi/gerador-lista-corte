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

  it('não tenta ampliar quando a primeira leitura já trouxe texto suficiente (mesmo numa imagem pequena)', async () => {
    // Caso real: uma foto de 514x827px de uma tabela lia PERFEITAMENTE
    // sem nenhuma ampliação - ampliar ela (mesmo moderadamente) BORRAVA o
    // texto e piorava a leitura. Ampliar só quando a primeira tentativa
    // falhar de verdade (ver teste abaixo) evita esse caso.
    const widthsSeen: number[] = [];
    execFileMock.mockImplementation((_file, args, callback) => {
      const imagePath = args[0] as string;
      const outputBase = args[1] as string;
      void sharp(imagePath)
        .metadata()
        .then((metadata) => {
          widthsSeen.push(metadata.width!);
          return fs.writeFile(`${outputBase}.txt`, 'texto reconhecido com mais de cinquenta caracteres de verdade');
        })
        .then(() => callback(null));
    });

    const smallImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    await provider.recognize(smallImage);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(widthsSeen).toEqual([200]);
  });

  it('tenta de novo com a imagem ampliada quando a primeira leitura veio curta demais (caso real: print de 457x209px)', async () => {
    const widthsSeen: number[] = [];
    let call = 0;
    execFileMock.mockImplementation((_file, args, callback) => {
      const imagePath = args[0] as string;
      const outputBase = args[1] as string;
      call++;
      const text = call === 1 ? 'só um título' : 'texto bem mais completo reconhecido na segunda tentativa, depois de ampliar';
      void sharp(imagePath)
        .metadata()
        .then((metadata) => {
          widthsSeen.push(metadata.width!);
          return fs.writeFile(`${outputBase}.txt`, text);
        })
        .then(() => callback(null));
    });

    const smallImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    const result = await provider.recognize(smallImage);

    expect(execFileMock).toHaveBeenCalledTimes(2);
    expect(widthsSeen[0]).toBe(200);
    expect(widthsSeen[1]).toBeGreaterThanOrEqual(1600);
    expect(result.text).toBe('texto bem mais completo reconhecido na segunda tentativa, depois de ampliar');
  });

  it('fica com o resultado da primeira tentativa se a ampliada não trouxer mais texto', async () => {
    // Caso real: ampliar uma imagem que já lia bem sem ajuda pode ATÉ
    // piorar o resultado (texto borrado vira reconhecimento pior, não
    // melhor) - por isso o resultado ampliado só substitui o original
    // quando é estritamente maior, nunca "só porque tentou de novo".
    let call = 0;
    execFileMock.mockImplementation((_file, args, callback) => {
      const outputBase = args[1] as string;
      call++;
      const text = call === 1 ? 'primeira tentativa, ainda curta mas maior que a segunda' : 'curto';
      void fs.writeFile(`${outputBase}.txt`, text).then(() => callback(null));
    });

    const smallImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    const result = await provider.recognize(smallImage);

    expect(result.text).toBe('primeira tentativa, ainda curta mas maior que a segunda');
  });

  it('não tenta de novo se a imagem já era grande o bastante e mesmo assim leu pouco (ampliar não ajudaria)', async () => {
    execFileMock.mockImplementation((_file, args, callback) => {
      const outputBase = args[1] as string;
      void fs.writeFile(`${outputBase}.txt`, 'curto').then(() => callback(null));
    });

    const largeImage = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const provider = new TesseractOcrProvider({ tesseractPath: 'tesseract', lang: 'por' });
    await provider.recognize(largeImage);

    expect(execFileMock).toHaveBeenCalledTimes(1);
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
