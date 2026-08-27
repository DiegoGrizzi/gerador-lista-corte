/**
 * run-update.ts
 * ---------------------------------------------------------------------------
 * Executa a sequência de atualização (git pull, npm install, npm run build)
 * e, se tudo der certo, relança o servidor via o mesmo script usado pelo
 * atalho de inicialização automática (deploy/iniciar-servidor-oculto.vbs) —
 * sem duplicar essa lógica, e sem precisar mexer no .vbs.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

export type UpdateStepName = 'git pull' | 'npm install' | 'npm run build';

export interface UpdateStepResult {
  ok: boolean;
  step?: UpdateStepName;
  error?: string;
}

const MAX_OUTPUT_CHARS = 2000;

function tail(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text;
}

function runStep(command: string, args: string[], cwd: string): Promise<{ code: number | null; output: string }> {
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

/**
 * Roda git pull -> npm install -> npm run build, na raiz do projeto, em
 * sequência — para no primeiro passo que falhar (a instalação fica na
 * versão anterior, funcionando normalmente; nunca reinicia com um build
 * pela metade).
 */
export async function runUpdateSteps(projectRoot: string): Promise<UpdateStepResult> {
  const steps: Array<{ name: UpdateStepName; command: string; args: string[] }> = [
    { name: 'git pull', command: 'git', args: ['pull'] },
    { name: 'npm install', command: 'npm', args: ['install'] },
    { name: 'npm run build', command: 'npm', args: ['run', 'build'] },
  ];

  for (const step of steps) {
    const result = await runStep(step.command, step.args, projectRoot);
    if (result.code !== 0) {
      return { ok: false, step: step.name, error: tail(result.output) || `${step.name} falhou (código ${result.code}).` };
    }
  }

  return { ok: true };
}

/**
 * Relança o servidor via o mesmo .vbs do atalho de inicialização e encerra
 * o processo atual. SÓ deve ser chamado depois de a requisição HTTP que
 * pediu a atualização já ter sido respondida — o processo termina de
 * propósito, então nada mais roda depois disso.
 *
 * Existe uma corrida inofensiva aqui: o processo novo pode tentar ocupar a
 * porta antes deste aqui liberá-la ao sair — por isso index.ts tenta de
 * novo por alguns segundos se a porta estiver ocupada (EADDRINUSE) ao
 * iniciar, em vez de travar.
 */
export function restartServer(projectRoot: string): void {
  const vbsPath = path.join(projectRoot, 'deploy', 'iniciar-servidor-oculto.vbs');
  const child = spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => process.exit(0), 400);
}
