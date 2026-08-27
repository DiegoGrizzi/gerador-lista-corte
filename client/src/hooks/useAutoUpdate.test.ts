import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAutoUpdate } from './useAutoUpdate.js';
import * as updateApi from '../lib/api/update.js';

vi.mock('../lib/api/update.js', () => ({
  checkForUpdate: vi.fn(),
  applyUpdate: vi.fn(),
  pingUntilBackOnline: vi.fn(),
}));

describe('useAutoUpdate', () => {
  const reloadSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reloadSpy.mockClear();
    // jsdom não implementa location.reload() de verdade — troca por um
    // espião, senão o teste falha ao chamar de verdade.
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
  });

  it('fica em "idle" quando não há atualização disponível', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });

    const { result } = renderHook(() => useAutoUpdate());

    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());
    expect(result.current.status).toBe('idle');
  });

  it('vira "available" com o resumo do commit quando há atualização', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentSha: 'aaaa',
      latestSha: 'bbbb',
      latestSummary: 'corrige um bug',
    });

    const { result } = renderHook(() => useAutoUpdate());

    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(result.current.latestSummary).toBe('corrige um bug');
  });

  it('applyNow: sucesso -> "updating" -> recarrega a página quando o servidor volta a responder', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });
    vi.mocked(updateApi.applyUpdate).mockResolvedValue({ ok: true, restarting: true });
    vi.mocked(updateApi.pingUntilBackOnline).mockResolvedValue(true);

    const { result } = renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());

    act(() => {
      result.current.applyNow();
    });
    expect(result.current.status).toBe('updating');

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });

  it('applyNow: o servidor devolve erro -> "error" com a mensagem, sem prometer reinício', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });
    vi.mocked(updateApi.applyUpdate).mockResolvedValue({ ok: false, error: 'npm install falhou' });

    const { result } = renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());

    act(() => {
      result.current.applyNow();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('npm install falhou');
    expect(updateApi.pingUntilBackOnline).not.toHaveBeenCalled();
  });

  it('applyNow: aplicado mas o servidor não volta a responder -> "error"', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });
    vi.mocked(updateApi.applyUpdate).mockResolvedValue({ ok: true, restarting: true });
    vi.mocked(updateApi.pingUntilBackOnline).mockResolvedValue(false);

    const { result } = renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());

    act(() => {
      result.current.applyNow();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toContain('não voltou a responder');
  });

  it('dismissError volta pra "idle" e limpa a mensagem', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });
    vi.mocked(updateApi.applyUpdate).mockResolvedValue({ ok: false, error: 'npm install falhou' });

    const { result } = renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());

    act(() => {
      result.current.applyNow();
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.dismissError();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBe('');
  });
});
