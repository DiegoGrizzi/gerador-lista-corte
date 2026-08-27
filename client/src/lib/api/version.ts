/**
 * version.ts
 * ---------------------------------------------------------------------------
 * Cliente HTTP para GET /api/version (@corte-cloud/server) — mesmo padrão de
 * fetch simples de lib/api/ocr.ts. Separado de lib/api/update.ts de
 * propósito: mostrar a versão instalada não deve depender de internet nem
 * do auto-update estar ativado (ver comentário em routes/version.ts).
 * ---------------------------------------------------------------------------
 */

interface VersionResponse {
  sha: string | null;
}

/** SHA completo do commit instalado, ou null se não deu pra descobrir (sem git, ou servidor fora do ar). */
export async function getCurrentVersion(): Promise<string | null> {
  try {
    const response = await fetch('/api/version');
    if (!response.ok) return null;
    const data = (await response.json()) as VersionResponse;
    return data.sha;
  } catch {
    return null;
  }
}
