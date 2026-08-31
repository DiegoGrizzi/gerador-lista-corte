import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import type { PdfRouteDeps } from '../routes/pdf.js';

// Deps fake — a rota nunca toca PDF/Tesseract real nesses testes.
const fakeExtractorDeps: PdfRouteDeps['createExtractorDeps'] = () =>
  ({}) as ReturnType<PdfRouteDeps['createExtractorDeps']>;

describe('POST /api/pdf', () => {
  it('devolve 200 com o texto extraído quando a extração tem sucesso', async () => {
    const deps: PdfRouteDeps = {
      createExtractorDeps: fakeExtractorDeps,
      extractPdfTableText: vi.fn().mockResolvedValue('Item\tDescrição\nA\tPeça 1'),
    };
    const app = createApp(undefined, undefined, undefined, deps);

    const response = await request(app).post('/api/pdf').send({ pdf: 'aGVsbG8=' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: 'Item\tDescrição\nA\tPeça 1' });
  });

  it('devolve 200 com texto vazio quando nenhuma página tem tabela reconhecível', async () => {
    const deps: PdfRouteDeps = {
      createExtractorDeps: fakeExtractorDeps,
      extractPdfTableText: vi.fn().mockResolvedValue(''),
    };
    const app = createApp(undefined, undefined, undefined, deps);

    const response = await request(app).post('/api/pdf').send({ pdf: 'aGVsbG8=' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: '' });
  });

  it('devolve 400 quando o campo pdf está ausente', async () => {
    const deps: PdfRouteDeps = {
      createExtractorDeps: fakeExtractorDeps,
      extractPdfTableText: vi.fn(),
    };
    const app = createApp(undefined, undefined, undefined, deps);

    const response = await request(app).post('/api/pdf').send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(deps.extractPdfTableText).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o PDF em base64 é inválido (buffer vazio)', async () => {
    const deps: PdfRouteDeps = {
      createExtractorDeps: fakeExtractorDeps,
      extractPdfTableText: vi.fn(),
    };
    const app = createApp(undefined, undefined, undefined, deps);

    const response = await request(app).post('/api/pdf').send({ pdf: '' });

    expect(response.status).toBe(400);
    expect(deps.extractPdfTableText).not.toHaveBeenCalled();
  });

  it('repassa erros inesperados pro middleware de erro central (500)', async () => {
    const deps: PdfRouteDeps = {
      createExtractorDeps: fakeExtractorDeps,
      extractPdfTableText: vi.fn().mockRejectedValue(new Error('falha inesperada')),
    };
    const app = createApp(undefined, undefined, undefined, deps);

    const response = await request(app).post('/api/pdf').send({ pdf: 'aGVsbG8=' });

    expect(response.status).toBe(500);
  });
});
