/**
 * useCurrentVersion.ts
 * ---------------------------------------------------------------------------
 * Busca uma vez, ao montar, o SHA do commit atualmente instalado (ver
 * GET /api/version), para exibir de forma discreta no rodapé — ajuda a
 * confirmar visualmente se uma atualização (manual ou pelo balão) realmente
 * chegou naquela máquina, sem precisar abrir o console.
 * ---------------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { getCurrentVersion } from '../lib/api/version.js';

/** Primeiros 7 caracteres do SHA — o mesmo tamanho "curto" que o GitHub usa. */
const SHORT_SHA_LENGTH = 7;

export function useCurrentVersion(): string | null {
  const [shortSha, setShortSha] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const sha = await getCurrentVersion();
      if (sha) setShortSha(sha.slice(0, SHORT_SHA_LENGTH));
    })();
  }, []);

  return shortSha;
}
