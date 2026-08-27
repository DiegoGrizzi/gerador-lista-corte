/**
 * run-update.ts
 * ---------------------------------------------------------------------------
 * Executa a sequência de atualização (git pull, [npm install], npm run
 * build) e, se tudo der certo, relança o servidor via
 * deploy/iniciar-servidor-oculto.ps1 (ver comentário em restartServer).
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
 * Relança o servidor via deploy/iniciar-servidor-oculto.ps1 (o mesmo
 * lançador usado pelo atalho de inicialização do Windows e pelo
 * duplo-clique manual em iniciar-servidor-oculto.bat — uma única fonte de
 * verdade pra "como iniciar o servidor escondido") e encerra o processo
 * atual. SÓ deve ser chamado depois de a requisição HTTP que pediu a
 * atualização já ter sido respondida — o processo termina de propósito,
 * então nada mais roda depois disso.
 *
 * DE PROPÓSITO chama powershell.exe, nunca wscript.exe/Windows Script
 * Host — um usuário relatou (duas vezes) "Falha na execução do Windows
 * Script Host (recursos de memória insuficientes)" bem na hora de
 * reiniciar depois de atualizar, provavelmente porque a máquina ainda
 * estava com pouca memória livre logo depois do build (git pull + npm
 * install + npm run build de 3 workspaces) — e o WSH tem histórico de
 * ficar instável sob essa pressão. PowerShell é um subsistema totalmente
 * separado do WSH, não herda esse problema.
 *
 * O relançamento é agendado num processo TOTALMENTE independente deste
 * (um "cmd /c" solto, com espera embutida, que sobrevive mesmo depois
 * deste processo sair) em vez de disparado direto e na sequência — sem
 * esse intervalo, o processo novo tentava começar a escrever em
 * deploy/server.log e ocupar a porta ENQUANTO o processo antigo ainda
 * estava terminando (poucos milissegundos de sobreposição), e no Windows
 * isso podia travar o processo novo inteiro numa disputa pelo arquivo de
 * log (relatado por outro usuário: "o servidor não voltou a responder"
 * depois de atualizar). Dando ~2s de folga total (o antigo já bem morto
 * antes do novo sequer tentar abrir o log ou a porta), essa disputa não
 * acontece mais.
 */
export function restartServer(projectRoot: string): void {
  // Registrado pelo processo ATUAL (antes de morrer) para ficar no log uma
  // marca de que o religamento foi agendado - se um dia o servidor não
  // voltar depois de atualizar, comparar esta linha com a de
  // "iniciar-servidor-oculto.ps1 iniciado" (gravada pelo próprio .ps1) diz
  // se a falha foi antes ou depois do PowerShell escondido ser alcançado.
  console.log('Atualização concluída - agendando religamento em ~2s...');
  const launcherPath = path.join(projectRoot, 'deploy', 'iniciar-servidor-oculto.ps1');
  // "ping -n 3 127.0.0.1" é o jeito clássico de esperar ~2s num .bat/cmd
  // sem depender de console interativo (diferente de "timeout", que falha
  // com stdin não-interativo — exatamente o caso aqui, já que stdio é
  // 'ignore').
  const relaunchCommand = `ping -n 3 127.0.0.1 >nul & powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcherPath}"`;
  const relauncher = spawn('cmd.exe', ['/c', relaunchCommand], {
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
