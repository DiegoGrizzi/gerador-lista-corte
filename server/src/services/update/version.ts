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
  /** Primeira linha da mensagem do commit, cortada em 140 caracteres. */
  summary: string;
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

/**
 * Verdadeiro se a pasta de instalação tem qualquer alteração não commitada
 * — usado para recusar a atualização automática nesse caso (ver
 * routes/update.ts), em vez de arriscar um "git pull" por cima de algo que
 * não devia. Em caso de dúvida (git status falhou por algum motivo), trata
 * como "tem alteração" — o lado seguro é sempre recusar, não atualizar.
 */
export async function hasUncommittedChanges(projectRoot: string): Promise<boolean> {
  const result = await runCapture('git', ['status', '--porcelain'], projectRoot);
  if (result.code !== 0) return true;
  return result.output.trim().length > 0;
}

/** Consulta a API pública do GitHub pelo commit mais recente da branch principal. */
export async function getLatestCommitInfo(): Promise<LatestCommitInfo> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gerador-lista-corte-app' },
  });
  if (!response.ok) {
    throw new Error(`GitHub respondeu com erro (código ${response.status}) ao consultar a última versão.`);
  }
  const data = (await response.json()) as { sha?: string; commit?: { message?: string } };
  if (!data.sha) {
    throw new Error('Resposta inesperada do GitHub ao consultar a última versão.');
  }
  const firstLine = (data.commit?.message || '').split('\n')[0] || '';
  return { sha: data.sha, summary: firstLine.slice(0, 140) };
}
