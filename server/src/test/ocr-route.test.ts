import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { OcrFailureError } from '../services/ocr/types.js';
import type { OcrRouteDeps } from '../routes/ocr.js';

// Providers/deps fake — a rota nunca toca Tesseract real nem faz chamadas
// de rede nesses testes.
const fakeProviders: OcrRouteDeps['createProviders'] = () => ({
  primary: { name: 'tesseract', recognize: () => Promise.resolve({ text: 'texto falso' }) },
  fallback: { name: 'ocr-space', recognize: () => Promise.resolve({ text: 'texto falso' }) },
});

describe('POST /api/ocr', () => {
  it('devolve 200 com text e engine quando o OCR tem sucesso', async () => {
    const deps: OcrRouteDeps = {
      createProviders: fakeProviders,
      runOcr: vi.fn().mockResolvedValue({ text: 'texto reconhecido', engine: 'tesseract' }),
    };
    const app = createApp(deps);

    const response = await request(app).post('/api/ocr').send({ image: 'aGVsbG8=' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: 'texto reconhecido', engine: 'tesseract' });
  });

  it('devolve 400 quando o campo image está ausente', async () => {
    const deps: OcrRouteDeps = {
      createProviders: fakeProviders,
      runOcr: vi.fn(),
    };
    const app = createApp(deps);

    const response = await request(app).post('/api/ocr').send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(deps.runOcr).not.toHaveBeenCalled();
  });

  it('devolve 502 quando os dois engines de OCR falham', async () => {
    const deps: OcrRouteDeps = {
      createProviders: fakeProviders,
      runOcr: vi.fn().mockRejectedValue(new OcrFailureError('Nenhum engine de OCR conseguiu ler o texto da imagem.')),
    };
    const app = createApp(deps);

    const response = await request(app).post('/api/ocr').send({ image: 'aGVsbG8=' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Nenhum engine de OCR conseguiu ler o texto da imagem.' });
  });
});
