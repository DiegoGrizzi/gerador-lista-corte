import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCurrentVersion } from './useCurrentVersion.js';
import * as versionApi from '../lib/api/version.js';

vi.mock('../lib/api/version.js', () => ({
  getCurrentVersion: vi.fn(),
}));

describe('useCurrentVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve os 7 primeiros caracteres do SHA', async () => {
    vi.mocked(versionApi.getCurrentVersion).mockResolvedValue('24bcda9051c6dd650a5f9d0fe7949fecac9e4319');

    const { result } = renderHook(() => useCurrentVersion());

    await waitFor(() => expect(result.current).toBe('24bcda9'));
  });

  it('fica null enquanto não sabe a versão (sem git, servidor fora do ar, etc)', async () => {
    vi.mocked(versionApi.getCurrentVersion).mockResolvedValue(null);

    const { result } = renderHook(() => useCurrentVersion());

    await waitFor(() => expect(versionApi.getCurrentVersion).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
