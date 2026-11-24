/**
 * version.ts
 * ---------------------------------------------------------------------------
 * Lê a versão local instalada (SHA do commit atual, via git) e consulta a
 * versão mais recente disponível no GitHub (repositório público, API sem
 * autenticação) para decidir se há atualização disponível.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';

const REPO_OWNER = 'DiegoGrizzi';
const REPO_NAME = 'gerador-lista-corte';
const REPO_BRANCH = 'main';

export interface LatestCommitInfo {
  sha: string;
}

interface CaptureResult {
  code: number | null;
  output: string;
}

function runCapture(command: string, args: string[], cwd: string): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: true });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('close', (code) => resolve({ code, output }));
    child.on('error', (err) => resolve({ code: -1, output: err.message }));
  });
}

/** SHA completo do commit atualmente instalado. */
export async function getLocalSha(projectRoot: string): Promise<string> {
  const result = await runCapture('git', ['rev-parse', 'HEAD'], projectRoot);
  if (result.code !== 0) {
    throw new Error('Não consegui ler a versão local instalada.');
  }
  return result.output.trim();
}

/** Primeiro SHA (40 hexadecimais) de uma saída "git ls-remote": "<sha> refs/heads/main". null se não tiver. */
export function parseLsRemoteSha(output: string): string | null {
  const sha = output.trim().split(/\s+/)[0] ?? '';
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

/**
 * Pergunta o commit mais recente direto ao git ("git ls-remote"). Não passa
 * pela API do GitHub, que sem autenticação só deixa 60 consultas por hora por
 * endereço de internet — e as máquinas de uma loja saem pelo mesmo endereço.
 */
async function getLatestCommitInfoViaGit(): Promise<LatestCommitInfo> {
  const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
  const result = await runCapture(
    'git',
    ['ls-remote', url, `refs/heads/${REPO_BRANCH}`],
    process.cwd(),
  );
  const sha = result.code === 0 ? parseLsRemoteSha(result.output) : null;
  if (!sha) throw new Error('Não consegui consultar a última versão pelo git.');
  return { sha };
}

async function getLatestCommitInfoViaApi(): Promise<LatestCommitInfo> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gerador-lista-corte-app' },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub respondeu com erro (código ${response.status}) ao consultar a última versão.`,
    );
  }
  const data = (await response.json()) as { sha?: string };
  if (!data.sha) {
    throw new Error('Resposta inesperada do GitHub ao consultar a última versão.');
  }
  return { sha: data.sha };
}

/**
 * Consulta o commit mais recente da branch principal. Tenta a API pública do
 * GitHub e, se ela falhar (limite de consultas por hora, erro do GitHub), tenta
 * o git. Sem isso, com várias máquinas na mesma internet, o aviso de
 * atualização some em silêncio quando o limite estoura.
 */
export async function getLatestCommitInfo(): Promise<LatestCommitInfo> {
  try {
    return await getLatestCommitInfoViaApi();
  } catch (apiError) {
    try {
      return await getLatestCommitInfoViaGit();
    } catch {
      throw apiError;
    }
  }
}
