import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createBasicAuth } from '../middleware/basic-auth.js';

function buildApp() {
  const app = express();
  app.use(createBasicAuth({ user: 'loja', password: 'se:nha' }));
  app.get('/api/version', (_req, res) => res.json({ sha: null }));
  app.post('/api/version', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.send('interface'));
  app.post('/api/ocr', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createBasicAuth', () => {
  it('recusa com 401 e pede a senha quando não vem credencial', async () => {
    const response = await request(buildApp()).get('/');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
  });

  it('recusa usuário ou senha errados', async () => {
    const app = buildApp();

    expect((await request(app).get('/').auth('loja', 'errada')).status).toBe(401);
    expect((await request(app).get('/').auth('outro', 'se:nha')).status).toBe(401);
    expect((await request(app).post('/api/ocr').auth('', '')).status).toBe(401);
  });

  it('recusa um cabeçalho que não é Basic ou não tem dois campos', async () => {
    const app = buildApp();
    const semSeparador = Buffer.from('lojasenha').toString('base64');

    expect((await request(app).get('/').set('Authorization', 'Bearer abc')).status).toBe(401);
    expect((await request(app).get('/').set('Authorization', `Basic ${semSeparador}`)).status).toBe(401);
  });

  it('deixa passar com usuário e senha certos, inclusive senha com ":"', async () => {
    const app = buildApp();

    expect((await request(app).get('/').auth('loja', 'se:nha')).status).toBe(200);
    expect((await request(app).post('/api/ocr').auth('loja', 'se:nha')).status).toBe(200);
  });

  it('responde GET /api/version sem senha (healthcheck), mas só o GET', async () => {
    const app = buildApp();

    expect((await request(app).get('/api/version')).status).toBe(200);
    expect((await request(app).post('/api/version')).status).toBe(401);
  });
});
