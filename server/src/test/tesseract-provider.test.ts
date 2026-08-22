import { promises as fs } from 'node:fs';

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
