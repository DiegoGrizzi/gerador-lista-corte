/**
 * run-update.ts
 * ---------------------------------------------------------------------------
 * Executa a sequência de atualização (git pull, [npm install], npm run
 * build) e, se tudo der certo, relança o servidor via
 * deploy/iniciar-servidor-oculto.ps1 (ver comentário em restartServer).
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
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
 * DE PROPÓSITO usa o Agendador de Tarefas do Windows (schtasks.exe), em vez
 * de só chamar spawn(..., {detached: true}) direto - um caso real mostrou o
 * religamento sumindo no meio do caminho, sem erro nenhum no log (nem a
 * marca "iniciar-servidor-oculto.ps1 iniciado" chegava a aparecer), logo
 * depois do processo atual sair. A suspeita: no Windows, "detached: true"
 * só cria um novo GRUPO de processo, mas não tira o processo filho de um
 * possível "job object" do processo pai - e é comum ferramentas de
 * antivírus/EDR (o Bitdefender desta loja já registrou, mais de uma vez,
 * esse powershell.exe como comportamento suspeito) colocarem processos
 * sinalizados dentro de um job object com "encerrar filhos ao fechar",
 * justamente para poder matar toda a árvore de processos se precisar. Uma
 * tarefa do Agendador roda por fora dessa árvore inteira desde o início: a
 * ação (subir o powershell.exe) é executada pelo próprio serviço do
 * Agendador de Tarefas (svchost.exe), sem nenhum vínculo de processo
 * pai/filho com o node.exe que pediu a criação da tarefa - então não corre
 * esse risco, mesmo que o schtasks.exe usado só para REGISTRAR a tarefa
 * seja atingido.
 *
 * schtasks.exe é chamado diretamente (sem passar por "cmd.exe /c"), com os
 * argumentos em array em vez de uma linha de comando montada à mão: uma
 * primeira tentativa usando "cmd.exe /c" com tudo numa string só (incluindo
 * o "/tr" com aspas aninhadas para o caminho do .ps1) foi testada de
 * verdade e FALHOU - o Node precisa fazer sua própria camada de
 * escapamento de aspas para montar o argumento do cmd.exe, e o parser do
 * próprio cmd.exe não entende esse escapamento (ele não trata `\"` como
 * aspas literais, só alterna dentro/fora de aspas a cada `"`), embaralhando
 * o comando de um jeito que quebrava o "schtasks /create" silenciosamente.
 * Chamando schtasks.exe direto, essa camada de tradução a mais desaparece.
 *
 * O religamento continua não sendo disparado direto e na sequência: a
 * própria deploy/iniciar-servidor-oculto.ps1 espera ~2s antes de subir o
 * node, dando tempo do processo antigo morrer de vez e liberar a porta e o
 * arquivo de log antes do novo tentar usá-los (sem essa folga, os dois
 * processos disputavam o arquivo de log por uns milissegundos de
 * sobreposição, o que já travou o processo novo inteiro num caso real
 * anterior).
 *
 * O nome da tarefa é ÚNICO a cada chamada (com um sufixo de timestamp), em
 * vez de reaproveitar sempre o mesmo nome com "/create ... /f" para
 * sobrescrever - um caso real mostrou "/create" (e até "/delete") numa
 * tarefa já existente falhando com "Acesso negado", mesmo criar uma tarefa
 * nova com outro nome funcionando sem problema no mesmo instante. Ou seja,
 * sobrescrever/apagar uma tarefa já registrada pode esbarrar num problema
 * de permissão que criar uma tarefa nova não tem - então o jeito mais
 * confiável é nunca precisar sobrescrever nada. Isso deixa tarefas "de uso
 * único" (já disparadas, que não vão rodar de novo sozinhas) acumulando no
 * Agendador ao longo do tempo, mas são inofensivas.
 *
 * A tarefa é registrada via um arquivo XML (não "/tr" + "/sc once" direto na
 * linha de comando) especificamente para poder marcar <Hidden>true</Hidden>
 * nela - caso real reportado: com "/tr" simples (sem essa propriedade), uma
 * janela do PowerShell/cmd chegava a piscar na tela a cada religamento
 * (varios num mesmo dia com muitas atualizacoes seguidas). O mesmo
 * problema, com a mesma causa e a mesma correcao, ja tinha sido encontrado
 * e corrigido para a tarefa recorrente do vigia (ver
 * deploy/iniciar-servidor-oculto.ps1) - "-WindowStyle Hidden" no argumento
 * do PowerShell sozinho nao e suficiente numa tarefa do Agendador, so a
 * propriedade <Hidden> da propria tarefa garante isso de verdade, e ela so
 * pode ser definida via XML.
 */
const SCHTASKS_TIMEOUT_MS = 5000;

/**
 * Roda um comando schtasks.exe com um limite de tempo próprio - sem isso,
 * se o processo schtasks.exe for encerrado por fora de um jeito que não
 * dispara nem "close" nem "error" (ex: um antivírus suspendendo/matando o
 * processo de um jeito atípico), a Promise ficaria pendurada para sempre,
 * e restartServer(), que depende dela, nunca chegaria a chamar
 * process.exit() - o servidor antigo ficaria travado num limbo, sem nunca
 * liberar a porta pra próxima tentativa (manual ou automática).
 */
function runSchtasks(args: string[]): Promise<StepResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: StepResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      settle({ code: -1, output: `schtasks ${args.join(' ')} não respondeu em ${SCHTASKS_TIMEOUT_MS}ms.` });
    }, SCHTASKS_TIMEOUT_MS);

    const child = spawn('schtasks.exe', args, { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('close', (code) => settle({ code, output }));
    child.on('error', (err) => settle({ code: -1, output: err.message }));
  });
}

export async function restartServer(projectRoot: string): Promise<void> {
  // Registrado pelo processo ATUAL (antes de morrer) para ficar no log uma
  // marca de que o religamento foi agendado - se um dia o servidor não
  // voltar depois de atualizar, comparar esta linha com a de
  // "iniciar-servidor-oculto.ps1 iniciado" (gravada pelo próprio .ps1) diz
  // se a falha foi antes ou depois do PowerShell escondido ser alcançado.
  console.log('Atualização concluída - agendando religamento via Agendador de Tarefas...');

  // Bloqueio de segurança à parte dos timeouts individuais de runSchtasks:
  // não importa o que aconteça, este processo NUNCA deve ficar pendurado
  // pra sempre no meio da sequência abaixo - garante que o processo morre
  // (liberando a porta) mesmo num cenário totalmente inesperado.
  const forceExitTimer = setTimeout(() => {
    console.error('Religamento não terminou a tempo - saindo mesmo assim.');
    process.exit(1);
  }, 15_000);

  const launcherPath = path.join(projectRoot, 'deploy', 'iniciar-servidor-oculto.ps1');
  // Lança via deploy/rodar-oculto.vbs em vez de powershell.exe direto - nem
  // "-WindowStyle Hidden" nem <Hidden>true</Hidden> nesta própria tarefa
  // (que já tentávamos antes) garantem de verdade nenhuma janela piscando
  // quando o Agendador lança um processo de CONSOLE dentro da sessão do
  // usuário logado - confirmado de verdade (usuário relatou o cmd
  // piscando a cada religamento). wscript.exe roda como aplicativo de
  // interface gráfica, sem console nenhum em nenhum contexto, e lança o
  // PowerShell de verdade já escondido desde a criação (ver
  // deploy/rodar-oculto.vbs para os detalhes e por que isso não reintroduz
  // o problema de memória do WSH que fez este projeto abandoná-lo da
  // primeira vez).
  const trampolimPath = path.join(projectRoot, 'deploy', 'rodar-oculto.vbs');
  // Nome único por chamada - ver comentário acima sobre por que nunca
  // reaproveitar/sobrescrever o mesmo nome de tarefa.
  const taskName = `GeradorListaCorteReligamento-${Date.now()}`;
  // StartBoundary é obrigatório, mas o valor não importa de verdade - "/run"
  // logo em seguida dispara a tarefa na hora, independente do horário
  // agendado (mesma lógica de quando isso era feito com "/sc once /st
  // 23:59"). Um valor fixo no passado (mesmo usado na tarefa do vigia) evita
  // precisar calcular a hora atual só para preencher um campo que nunca é
  // realmente usado.
  const utf16Bom = String.fromCharCode(0xfeff);
  const taskXmlPath = path.join(os.tmpdir(), `${taskName}.xml`);
  const taskXml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT1M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>//B "${trampolimPath}" "${launcherPath}"</Arguments>
    </Exec>
  </Actions>
</Task>
`;
  // BOM manual: fs.writeFile com encoding 'utf16le' não grava um sozinho, e
  // sem ele o arquivo fica ambíguo sobre little/big-endian - o mesmo
  // resultado de "Set-Content -Encoding Unicode" do PowerShell (usado pela
  // tarefa do vigia, que já funciona), não um "utf16le" cru.
  await fs.writeFile(taskXmlPath, utf16Bom + taskXml, 'utf16le');

  // Espera os dois passos terminarem (e não só serem disparados) antes de
  // deixar este processo morrer, já que a criação e o disparo em si
  // dependem desse processo continuar vivo até o schtasks.exe terminar de
  // conversar com o serviço do Agendador. "/f": não deveria existir uma
  // tarefa com esse nome (é único), mas força sobrescrita mesmo assim -
  // /xml exige a flag quando combinado com /tn, mesmo sem conflito real.
  const create = await runSchtasks(['/create', '/tn', taskName, '/xml', taskXmlPath, '/f']);
  console.log(`schtasks /create -> código ${create.code}: ${create.output.trim()}`);
  await fs.unlink(taskXmlPath).catch(() => {});
  const run = await runSchtasks(['/run', '/tn', taskName]);
  console.log(`schtasks /run -> código ${run.code}: ${run.output.trim()}`);

  clearTimeout(forceExitTimer);
  process.exit(0);
}
