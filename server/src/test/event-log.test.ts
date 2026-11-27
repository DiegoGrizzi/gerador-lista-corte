import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import {
  clearLogEntries,
  describeError,
  detectImageFormat,
  getLogEntries,
  logEvent,
} from '../services/event-log.js';
import { runOcrWithFallback, type OcrLogger } from '../services/ocr/ocr-orchestrator.js';
import { OcrFailureError, type OcrProvider } from '../services/ocr/types.js';

function provider(name: string, behavior: () => Promise<{ text: string }>): OcrProvider {
  return { name, recognize: behavior };
}

beforeEach(() => {
  clearLogEntries();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('event-log', () => {
  it('devolve as entradas mais recentes primeiro', () => {
    logEvent('info', 'foto', 'primeira');
    logEvent('error', 'pdf', 'segunda');

    const entries = getLogEntries();

    expect(entries.map((entry) => entry.message)).toEqual(['segunda', 'primeira']);
    expect(entries[0]).toMatchObject({ level: 'error', source: 'pdf' });
  });

  it('guarda só as 300 mais recentes', () => {
    for (let i = 1; i <= 320; i++) logEvent('info', 'foto', `entrada ${i}`);

    const entries = getLogEntries();

    expect(entries).toHaveLength(300);
    expect(entries[0]?.message).toBe('entrada 320');
    expect(entries.at(-1)?.message).toBe('entrada 21');
  });

  it('junta a mensagem do erro com a da causa', () => {
    const error = new OcrFailureError('Falha ao executar o Tesseract.', {
      cause: new Error('pixReadStream: Unknown format'),
    });

    expect(describeError(error)).toBe(
      'Falha ao executar o Tesseract. — causa: pixReadStream: Unknown format',
    );
  });

  it('reconhece o formato da imagem pelos primeiros bytes', () => {
    expect(detectImageFormat(Buffer.from('ffd8ffe000104a464946', 'hex'))).toBe('JPEG');
    expect(detectImageFormat(Buffer.from('89504e470d0a1a0a0000', 'hex'))).toBe('PNG');
    expect(detectImageFormat(Buffer.from('0000002466747970686569630000', 'hex'))).toBe(
      'HEIC (foto de iPhone)',
    );
    expect(detectImageFormat(Buffer.from('qualquer coisa'))).toBe('desconhecido');
  });
});

describe('runOcrWithFallback registra o motivo de cada tentativa', () => {
  const buffer = Buffer.from('imagem');
  const opts = { minUsefulChars: 15 };

  it('diz quantos caracteres o primário leu quando foi pouco, e por que a reserva falhou', async () => {
    const log = vi.fn<OcrLogger>();
    const primary = provider('tesseract', () => Promise.resolve({ text: 'GA' }));
    const fallback = provider('ocr-space', () =>
      Promise.reject(new OcrFailureError('OCR_SPACE_API_KEY não foi configurada.')),
    );

    await expect(runOcrWithFallback(buffer, { primary, fallback }, opts, log)).rejects.toThrow(
      OcrFailureError,
    );

    expect(log).toHaveBeenCalledWith(
      'warn',
      'tesseract leu só 2 caracteres (mínimo 15); tentando ocr-space.',
    );
    expect(log).toHaveBeenCalledWith(
      'error',
      'ocr-space falhou: OCR_SPACE_API_KEY não foi configurada.',
    );
  });

  it('registra a causa quando o primário não consegue abrir a imagem', async () => {
    const log = vi.fn<OcrLogger>();
    const primary = provider('tesseract', () =>
      Promise.reject(
        new OcrFailureError('Falha ao executar o Tesseract.', { cause: new Error('Unknown format') }),
      ),
    );
    const fallback = provider('ocr-space', () => Promise.resolve({ text: 'texto lido pela reserva' }));

    const result = await runOcrWithFallback(buffer, { primary, fallback }, opts, log);

    expect(result.engine).toBe('ocr-space');
    expect(log).toHaveBeenCalledWith(
      'warn',
      'tesseract falhou (tentando ocr-space): Falha ao executar o Tesseract. — causa: Unknown format',
    );
    expect(log).toHaveBeenCalledWith('info', 'Lido pelo ocr-space: 23 caracteres.');
  });
});

describe('GET /api/logs', () => {
  it('devolve o registro, mais recente primeiro, sem cache', async () => {
    logEvent('info', 'foto', 'Foto recebida: JPEG, 88 KB.');
    logEvent('error', 'foto', 'ocr-space falhou: sem chave.');

    const response = await request(createApp()).get('/api/logs');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.entries).toHaveLength(2);
    expect(response.body.entries[0]).toMatchObject({
      level: 'error',
      source: 'foto',
      message: 'ocr-space falhou: sem chave.',
    });
  });
});
