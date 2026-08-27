import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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

  afterEach(() => {
    // O cleanup automático do Testing Library depende de `afterEach` como
    // global (checa `globalThis.afterEach`) — este projeto roda vitest com
    // `globals: false`, então precisa ser chamado explicitamente aqui, ou
    // o hook de um teste continua montado (e o listener de
    // "visibilitychange" continua ativo) no teste seguinte.
    cleanup();
    // Devolve document.visibilityState pro padrão do jsdom ('visible'),
    // já que alguns testes sobrescrevem via Object.defineProperty.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('fica em "idle" quando não há atualização disponível', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });

    const { result } = renderHook(() => useAutoUpdate());

    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalled());
    expect(result.current.status).toBe('idle');
  });

  it('vira "available" quando há atualização', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentSha: 'aaaa',
      latestSha: 'bbbb',
    });

    const { result } = renderHook(() => useAutoUpdate());

    await waitFor(() => expect(result.current.status).toBe('available'));
  });

  it('roda uma nova checagem quando a aba volta a ficar visível bem depois da última checagem', async () => {
    // Controla o relógio pra simular o cenário real (usuário volta pra aba
    // minutos depois) sem cair na janela de 30s que protege contra
    // trocas rápidas demais (ver próximo teste) — sem isso, o evento
    // disparado poucos milissegundos após o mount do teste cairia dentro
    // dessa janela por acidente, não porque o usuário voltou rápido.
    let currentTime = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });

    renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(1));

    currentTime += 60_000; // 1 minuto depois — passou da janela de 30s.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(2));
    nowSpy.mockRestore();
  });

  it('não roda uma checagem quando o evento dispara mas a aba continua escondida', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });

    renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('não empilha checagens quando a aba fica visível várias vezes em menos de 30s (inclusive logo após a checagem do mount)', async () => {
    vi.mocked(updateApi.checkForUpdate).mockResolvedValue({ updateAvailable: false });

    renderHook(() => useAutoUpdate());
    await waitFor(() => expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Continua em 1: todas essas trocas caem dentro dos 30s desde a
    // checagem do mount, então nenhuma delas dispara uma checagem nova.
    expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(1);
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
