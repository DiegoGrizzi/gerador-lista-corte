/**
 * run-update.ts
 * ---------------------------------------------------------------------------
 * Executa a sequência de atualização (git pull, [npm install], npm run
 * build) e, se tudo der certo, relança o servidor via o mesmo script usado
 * pelo atalho de inicialização automática
 * (deploy/iniciar-servidor-oculto.vbs) — sem duplicar essa lógica, e sem
 * precisar mexer no .vbs.
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

interface StepResult {
  code: number | null;
  output: string;
}

function runStep(command: string, args: string[], cwd: string): Promise<StepResult> {
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

function fail(step: UpdateStepName, result: StepResult): UpdateStepResult {
  return { ok: false, step, error: tail(result.output) || `${step} falhou (código ${result.code}).` };
}

/**
 * Verdadeiro se o "git pull" trouxe alguma mudança em package.json ou
 * package-lock.json (raiz ou de qualquer workspace) — só nesse caso vale a
 * pena rodar "npm install", que é de longe o passo mais lento da
 * atualização. A maioria das atualizações reais só muda código-fonte, então
 * pular esse passo quando não há nada novo pra instalar corta bastante
 * tempo (os pacotes já estão instalados, não tem sentido reinstalar).
 */
async function pullChangedDependencyFiles(projectRoot: string, beforeSha: string, afterSha: string): Promise<boolean> {
  if (beforeSha === afterSha) return false;
  const diff = await runStep('git', ['diff', '--name-only', beforeSha, afterSha], projectRoot);
  if (diff.code !== 0) return true; // não deu pra confirmar - lado seguro é rodar o npm install mesmo assim.
  return diff.output
    .split('\n')
    .map((line) => line.trim())
    .some((file) => file.endsWith('package.json') || file.endsWith('package-lock.json'));
}

/**
 * Roda git pull -> (npm install, se precisar) -> npm run build, na raiz do
 * projeto, em sequência — para no primeiro passo que falhar (a instalação
 * fica na versão anterior, funcionando normalmente; nunca reinicia com um
 * build pela metade).
 */
export async function runUpdateSteps(projectRoot: string): Promise<UpdateStepResult> {
  const beforeSha = (await runStep('git', ['rev-parse', 'HEAD'], projectRoot)).output.trim();

  const pull = await runStep('git', ['pull'], projectRoot);
  if (pull.code !== 0) return fail('git pull', pull);

  const afterSha = (await runStep('git', ['rev-parse', 'HEAD'], projectRoot)).output.trim();

  if (await pullChangedDependencyFiles(projectRoot, beforeSha, afterSha)) {
    const install = await runStep('npm', ['install'], projectRoot);
    if (install.code !== 0) return fail('npm install', install);
  }

  const build = await runStep('npm', ['run', 'build'], projectRoot);
  if (build.code !== 0) return fail('npm run build', build);

  return { ok: true };
}

/**
 * Relança o servidor via o mesmo .vbs do atalho de inicialização e encerra
 * o processo atual. SÓ deve ser chamado depois de a requisição HTTP que
 * pediu a atualização já ter sido respondida — o processo termina de
 * propósito, então nada mais roda depois disso.
 *
 * O relançamento é agendado num processo TOTALMENTE independente deste
 * (um "cmd /c" solto, com espera embutida, que sobrevive mesmo depois
 * deste processo sair) em vez de disparado direto e na sequência — sem
 * esse intervalo, o processo novo tentava começar a escrever em
 * deploy/server.log e ocupar a porta ENQUANTO o processo antigo ainda
 * estava terminando (poucos milissegundos de sobreposição), e no Windows
 * isso podia travar o processo novo inteiro numa disputa pelo arquivo de
 * log (relatado por um usuário: "o servidor não voltou a responder" depois
 * de atualizar). Dando ~2s de folga total (o antigo já bem morto antes do
 * novo sequer tentar abrir o log ou a porta), essa disputa não acontece
 * mais.
 */
export function restartServer(projectRoot: string): void {
  const vbsPath = path.join(projectRoot, 'deploy', 'iniciar-servidor-oculto.vbs');
  // "ping -n 3 127.0.0.1" é o jeito clássico de esperar ~2s num .bat/cmd
  // sem depender de console interativo (diferente de "timeout", que falha
  // com stdin não-interativo — exatamente o caso aqui, já que stdio é
  // 'ignore').
  const relauncher = spawn('cmd.exe', ['/c', `ping -n 3 127.0.0.1 >nul & wscript.exe "${vbsPath}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  relauncher.unref();
  // Só esse tanto de espera aqui: dar tempo da resposta HTTP terminar de
  // sair antes do processo morrer — o agendamento do relançamento já é
  // independente disso (ver comentário acima).
  setTimeout(() => process.exit(0), 300);
}
