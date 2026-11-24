import { describe, expect, it } from 'vitest';

import { parseLsRemoteSha } from '../services/update/version.js';

describe('parseLsRemoteSha', () => {
  it('lê o SHA da saída do "git ls-remote"', () => {
    const sha = 'c72c1f8f880f23871abd2a60c71c16290fe59e6d';
    expect(parseLsRemoteSha(`${sha}\trefs/heads/main\n`)).toBe(sha);
  });

  it('devolve null quando não há SHA válido (saída vazia ou mensagem de erro)', () => {
    expect(parseLsRemoteSha('')).toBeNull();
    expect(parseLsRemoteSha('fatal: unable to access the repository')).toBeNull();
  });
});
