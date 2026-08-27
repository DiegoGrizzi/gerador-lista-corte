import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import type { UpdateRouteDeps } from '../routes/update.js';

const FAKE_PROJECT_ROOT = '/fake/project/root';

function makeDeps(overrides: Partial<UpdateRouteDeps> = {}): UpdateRouteDeps {
  return {
    resolveProjectRoot: vi.fn().mockReturnValue(FAKE_PROJECT_ROOT),
    getLocalSha: vi.fn().mockResolvedValue('aaaa'),
    getLatestCommitInfo: vi.fn().mockResolvedValue({ sha: 'aaaa' }),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    runUpdateSteps: vi.fn().mockResolvedValue({ ok: true }),
    restartServer: vi.fn(),
    ...overrides,
  };
}

describe('GET /api/update/check', () => {
  it('devolve updateAvailable: false quando o SHA local já é o mais recente', async () => {
    const deps = makeDeps();
    const app = createApp(undefined, deps);

    const response = await request(app).get('/api/update/check');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updateAvailable: false, currentSha: 'aaaa', latestSha: 'aaaa' });
  });

  it('devolve updateAvailable: true quando o SHA remoto é diferente do local', async () => {
    const deps = makeDeps({
      getLocalSha: vi.fn().mockResolvedValue('aaaa'),
      getLatestCommitInfo: vi.fn().mockResolvedValue({ sha: 'bbbb' }),
    });
    const app = createApp(undefined, deps);

    const response = await request(app).get('/api/update/check');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      updateAvailable: true,
      currentSha: 'aaaa',
      latestSha: 'bbbb',
    });
  });

  it('devolve updateAvailable: false (não quebra) quando não dá pra consultar o GitHub', async () => {
    const deps = makeDeps({
      getLatestCommitInfo: vi.fn().mockRejectedValue(new Error('sem internet')),
    });
    const app = createApp(undefined, deps);

    const response = await request(app).get('/api/update/check');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updateAvailable: false, error: 'sem internet' });
  });

  it('devolve updateAvailable: false quando a instalação não tem git (zip)', async () => {
    const deps = makeDeps({
      resolveProjectRoot: vi.fn().mockImplementation(() => {
        throw new Error('sem git');
      }),
    });
    const app = createApp(undefined, deps);

    const response = await request(app).get('/api/update/check');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updateAvailable: false, error: 'sem git' });
  });
});

describe('POST /api/update/apply', () => {
  it('roda os passos e reinicia quando tudo dá certo', async () => {
    const deps = makeDeps();
    const app = createApp(undefined, deps);

    const response = await request(app).post('/api/update/apply');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, restarting: true });
    expect(deps.hasUncommittedChanges).toHaveBeenCalledWith(FAKE_PROJECT_ROOT);
    expect(deps.runUpdateSteps).toHaveBeenCalledWith(FAKE_PROJECT_ROOT);
    expect(deps.restartServer).toHaveBeenCalledWith(FAKE_PROJECT_ROOT);
  });

  it('recusa e não reinicia quando há alterações locais não commitadas', async () => {
    const deps = makeDeps({ hasUncommittedChanges: vi.fn().mockResolvedValue(true) });
    const app = createApp(undefined, deps);

    const response = await request(app).post('/api/update/apply');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: false,
      error: 'Há alterações não salvas na instalação local — atualização cancelada por segurança.',
    });
    expect(deps.runUpdateSteps).not.toHaveBeenCalled();
    expect(deps.restartServer).not.toHaveBeenCalled();
  });

  it('devolve o erro do passo que falhou e não reinicia', async () => {
    const deps = makeDeps({
      runUpdateSteps: vi.fn().mockResolvedValue({ ok: false, step: 'npm install', error: 'ENOTFOUND registry' }),
    });
    const app = createApp(undefined, deps);

    const response = await request(app).post('/api/update/apply');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, step: 'npm install', error: 'ENOTFOUND registry' });
    expect(deps.restartServer).not.toHaveBeenCalled();
  });

  it('não roda nada quando a instalação não tem git (zip)', async () => {
    const deps = makeDeps({
      resolveProjectRoot: vi.fn().mockImplementation(() => {
        throw new Error('sem git');
      }),
    });
    const app = createApp(undefined, deps);

    const response = await request(app).post('/api/update/apply');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, error: 'sem git' });
    expect(deps.hasUncommittedChanges).not.toHaveBeenCalled();
  });
});
