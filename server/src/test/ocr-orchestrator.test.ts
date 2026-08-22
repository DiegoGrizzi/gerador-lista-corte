import { describe, expect, it } from 'vitest';

import { runOcrWithFallback } from '../services/ocr/ocr-orchestrator.js';
import { OcrFailureError, type OcrProvider, type OcrResult } from '../services/ocr/types.js';

/**
 * Provider falso e determinístico — nunca chama Tesseract real nem faz
 * requisições de rede. Cada teste monta o comportamento que precisa.
 */
class FakeProvider implements OcrProvider {
  readonly name: string;
  private readonly behavior: (() => Promise<OcrResult>) | (() => never);

  constructor(name: string, behavior: (() => Promise<OcrResult>) | (() => never)) {
    this.name = name;
    this.behavior = behavior;
  }

  recognize(): Promise<OcrResult> {
    return Promise.resolve(this.behavior());
  }
}

function succeeds(name: string, text: string): FakeProvider {
  return new FakeProvider(name, () => Promise.resolve({ text }));
}

function fails(name: string, message = 'falha simulada'): FakeProvider {
  return new FakeProvider(name, () => {
    throw new OcrFailureError(message);
  });
}

describe('runOcrWithFallback', () => {
  const buffer = Buffer.from('fake-image-bytes');
  const opts = { minUsefulChars: 15 };

  it('usa o resultado do provider primário quando ele tem sucesso com texto suficiente', async () => {
    const primary = succeeds('primary', 'Texto reconhecido com bastante conteúdo útil.');
    const fallback = fails('fallback');

    const result = await runOcrWithFallback(buffer, { primary, fallback }, opts);

    expect(result.engine).toBe('primary');
    expect(result.text).toBe('Texto reconhecido com bastante conteúdo útil.');
  });

  it('usa o fallback quando o primário lança erro', async () => {
    const primary = fails('primary');
    const fallback = succeeds('fallback', 'Texto do fallback com conteúdo suficiente.');

    const result = await runOcrWithFallback(buffer, { primary, fallback }, opts);

    expect(result.engine).toBe('fallback');
    expect(result.text).toBe('Texto do fallback com conteúdo suficiente.');
  });

  it('usa o fallback quando o primário devolve texto abaixo do mínimo útil', async () => {
    const primary = succeeds('primary', 'curto');
    const fallback = succeeds('fallback', 'Texto do fallback com conteúdo suficiente.');

    const result = await runOcrWithFallback(buffer, { primary, fallback }, opts);

    expect(result.engine).toBe('fallback');
    expect(result.text).toBe('Texto do fallback com conteúdo suficiente.');
  });

  it('lança OcrFailureError quando ambos os providers falham', async () => {
    const primary = fails('primary');
    const fallback = fails('fallback');

    await expect(runOcrWithFallback(buffer, { primary, fallback }, opts)).rejects.toBeInstanceOf(OcrFailureError);
  });

  it('lança OcrFailureError quando o primário falha e o fallback devolve texto vazio', async () => {
    const primary = fails('primary');
    const fallback = succeeds('fallback', '   ');

    await expect(runOcrWithFallback(buffer, { primary, fallback }, opts)).rejects.toBeInstanceOf(OcrFailureError);
  });
});
