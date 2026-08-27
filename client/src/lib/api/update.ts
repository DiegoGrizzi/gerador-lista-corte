/**
 * update.ts
 * ---------------------------------------------------------------------------
 * Cliente HTTP para GET /api/update/check e POST /api/update/apply
 * (@corte-cloud/server) — mesmo padrão de fetch simples de lib/api/ocr.ts.
 * ---------------------------------------------------------------------------
 */

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentSha?: string;
  latestSha?: string;
  error?: string;
}

export interface UpdateApplyResult {
  ok: boolean;
  restarting?: boolean;
  step?: string;
  error?: string;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const response = await fetch('/api/update/check');
    if (!response.ok) {
      return { updateAvailable: false, error: `O servidor respondeu com erro (código ${response.status}).` };
    }
    return (await response.json()) as UpdateCheckResult;
  } catch {
    // Sem internet, ou o servidor local não respondeu — não é um erro para
    // mostrar ao usuário, só significa "não dá pra saber agora".
    return { updateAvailable: false };
  }
}

export async function applyUpdate(): Promise<UpdateApplyResult> {
  try {
    const response = await fetch('/api/update/apply', { method: 'POST' });
    if (!response.ok) {
      return { ok: false, error: `O servidor respondeu com erro (código ${response.status}).` };
    }
    return (await response.json()) as UpdateApplyResult;
  } catch {
    return { ok: false, error: 'Não consegui falar com o servidor para atualizar.' };
  }
}

/**
 * Faz ping em "/" repetidamente até o servidor responder de novo — usado
 * depois de applyUpdate, que reinicia o processo do servidor (fica alguns
 * segundos fora do ar entre o processo antigo sair e o novo subir).
 * 60 tentativas de 1s (~1 minuto) — folga generosa pra máquinas mais
 * lentas ou com antivírus escaneando os arquivos recém-compilados.
 *
 * Cada tentativa usa um "timeout" próprio (attemptTimeoutMs): sem isso, uma
 * porta que ainda não está escutando pode deixar o fetch pendurado por bem
 * mais tempo que 1s antes de falhar (o navegador não tem um limite curto
 * por padrão) — na prática isso fez a espera total passar de minutos em vez
 * dos ~60s esperados, mesmo com o servidor já tendo voltado ao ar.
 */
export async function pingUntilBackOnline(
  maxAttempts = 60,
  intervalMs = 1000,
  attemptTimeoutMs = 2000,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const response = await fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(attemptTimeoutMs) });
      if (response.ok) return true;
    } catch {
      // Servidor ainda reiniciando (ou tentativa estourou o tempo) - continua tentando.
    }
  }
  return false;
}
