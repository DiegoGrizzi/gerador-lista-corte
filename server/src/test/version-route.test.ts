import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import type { VersionRouteDeps } from '../routes/version.js';

describe('GET /api/version', () => {
  it('devolve o SHA local quando a instalação tem git', async () => {
    const deps: VersionRouteDeps = {
      resolveProjectRoot: vi.fn().mockReturnValue('/fake/project/root'),
      getLocalSha: vi.fn().mockResolvedValue('abc1234def'),
    };
    const app = createApp(undefined, undefined, deps);

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sha: 'abc1234def' });
  });

  it('devolve sha: null (sem quebrar) quando a instalação não tem git (zip)', async () => {
    const deps: VersionRouteDeps = {
      resolveProjectRoot: vi.fn().mockImplementation(() => {
        throw new Error('sem git');
      }),
      getLocalSha: vi.fn(),
    };
    const app = createApp(undefined, undefined, deps);

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sha: null });
  });

  it('devolve sha: null quando git rev-parse falha', async () => {
    const deps: VersionRouteDeps = {
      resolveProjectRoot: vi.fn().mockReturnValue('/fake/project/root'),
      getLocalSha: vi.fn().mockRejectedValue(new Error('git rev-parse falhou')),
    };
    const app = createApp(undefined, undefined, deps);

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sha: null });
  });
});
