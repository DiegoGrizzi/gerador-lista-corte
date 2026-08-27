import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

import { runUpdateSteps } from '../services/update/run-update.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

/** Cria um "child process" falso o bastante pro runStep interno de run-update.ts: stdout/stderr como EventEmitter e um evento "close" assíncrono. */
function fakeChild(code: number, output = ''): unknown {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (output) child.stdout.emit('data', Buffer.from(output));
    child.emit('close', code);
  });
  return child;
}

describe('runUpdateSteps', () => {
  const PROJECT_ROOT = '/fake/project/root';

  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('não roda "npm install" quando o pull não muda package.json/package-lock.json', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => fakeChild(0, 'sha-antes') as never) // git rev-parse HEAD (antes)
      .mockImplementationOnce(() => fakeChild(0) as never) // git pull
      .mockImplementationOnce(() => fakeChild(0, 'sha-depois') as never) // git rev-parse HEAD (depois)
      .mockImplementationOnce(() => fakeChild(0, 'client/src/App.tsx\nREADME.md') as never) // git diff --name-only
      .mockImplementationOnce(() => fakeChild(0) as never); // npm run build

    const result = await runUpdateSteps(PROJECT_ROOT);

    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(5);
    const commands = vi.mocked(spawn).mock.calls.map((call) => [call[0], call[1]]);
    expect(commands).toEqual([
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['pull']],
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['diff', '--name-only', 'sha-antes', 'sha-depois']],
      ['npm', ['run', 'build']],
    ]);
  });

  it('roda "npm install" quando o pull muda package-lock.json', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => fakeChild(0, 'sha-antes') as never)
      .mockImplementationOnce(() => fakeChild(0) as never)
      .mockImplementationOnce(() => fakeChild(0, 'sha-depois') as never)
      .mockImplementationOnce(() => fakeChild(0, 'package-lock.json\nserver/src/index.ts') as never)
      .mockImplementationOnce(() => fakeChild(0) as never) // npm install
      .mockImplementationOnce(() => fakeChild(0) as never); // npm run build

    const result = await runUpdateSteps(PROJECT_ROOT);

    expect(result).toEqual({ ok: true });
    const commands = vi.mocked(spawn).mock.calls.map((call) => [call[0], call[1]]);
    expect(commands).toEqual([
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['pull']],
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['diff', '--name-only', 'sha-antes', 'sha-depois']],
      ['npm', ['install']],
      ['npm', ['run', 'build']],
    ]);
  });

  it('não roda git diff nem npm install quando o pull não muda nada (SHA igual)', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => fakeChild(0, 'sha-igual') as never)
      .mockImplementationOnce(() => fakeChild(0) as never)
      .mockImplementationOnce(() => fakeChild(0, 'sha-igual') as never)
      .mockImplementationOnce(() => fakeChild(0) as never); // npm run build

    const result = await runUpdateSteps(PROJECT_ROOT);

    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(4);
    const commands = vi.mocked(spawn).mock.calls.map((call) => [call[0], call[1]]);
    expect(commands).toEqual([
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['pull']],
      ['git', ['rev-parse', 'HEAD']],
      ['npm', ['run', 'build']],
    ]);
  });

  it('para em "git pull" se ele falhar, sem chamar npm nenhum', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => fakeChild(0, 'sha-antes') as never)
      .mockImplementationOnce(() => fakeChild(1, 'conflito de merge') as never); // git pull falha

    const result = await runUpdateSteps(PROJECT_ROOT);

    expect(result).toEqual({ ok: false, step: 'git pull', error: 'conflito de merge' });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('para em "npm install" se ele falhar, sem rodar o build', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => fakeChild(0, 'sha-antes') as never)
      .mockImplementationOnce(() => fakeChild(0) as never)
      .mockImplementationOnce(() => fakeChild(0, 'sha-depois') as never)
      .mockImplementationOnce(() => fakeChild(0, 'package.json') as never)
      .mockImplementationOnce(() => fakeChild(1, 'ENOTFOUND registry') as never); // npm install falha

    const result = await runUpdateSteps(PROJECT_ROOT);

    expect(result).toEqual({ ok: false, step: 'npm install', error: 'ENOTFOUND registry' });
    expect(spawn).toHaveBeenCalledTimes(5);
  });
});
