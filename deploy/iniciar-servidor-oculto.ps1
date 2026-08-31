# -----------------------------------------------------------------------------
# iniciar-servidor-oculto.ps1
#
# Inicia o Gerador de Lista de Corte (interface + API de OCR, tudo num unico
# processo Node) em segundo plano, sem abrir janela de console. Pensado para
# rodar sozinho ao ligar o Windows, via atalho na pasta "Inicializar" do
# usuario (veja deploy/LEIA-ME.md) - mas tambem pode ser (re)iniciado na mao
# a qualquer momento com um duplo clique em iniciar-servidor-oculto.bat (ao
# lado deste arquivo), que so chama este script escondido.
#
# Substitui o antigo iniciar-servidor-oculto.vbs (Windows Script Host) -
# usuarios relataram o WSH falhando com "Recursos de memoria insuficientes
# disponiveis para concluir a operacao" bem na hora de reiniciar depois de
# uma atualizacao (a maquina ainda com pouca memoria livre, logo apos
# compilar). PowerShell e um subsistema totalmente separado do WSH (nao usa
# o mesmo motor de script VBScript/JScript), entao nao herda esse problema.
#
# Requer que o projeto ja tenha sido compilado uma vez (na raiz do projeto):
#   npm install
#   npm run build
#
# A saida do processo (log de erros, avisos) fica em deploy/server.log.
#
# Sempre chamado com -WindowStyle Hidden -ExecutionPolicy Bypass (ver
# instalar-em-novo-computador.ps1 e iniciar-servidor-oculto.bat) - o Bypass
# vale só para essa execução, não muda nenhuma configuração permanente da
# máquina, e evita depender da política de execução de PowerShell já
# configurada nela.
# -----------------------------------------------------------------------------

$scriptDir = $PSScriptRoot
$projectRoot = Split-Path $scriptDir -Parent
$serverDir = Join-Path $projectRoot 'server'
$logPath = Join-Path $scriptDir 'server.log'

# Marca no log que este script chegou a rodar, ANTES de subir o node - se um
# dia o servidor não voltar depois de uma atualização e essa linha não
# aparecer no log, é sinal de que algo (ex: antivírus) matou o processo
# antes mesmo dele chegar até aqui, em vez do node ter falhado ao iniciar.
Add-Content -Path $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] iniciar-servidor-oculto.ps1 iniciado"

# Garante que a tarefa recorrente de vigia está registrada rodando via
# deploy/rodar-oculto.vbs (ver esse arquivo) - checado em TODA
# inicialização (não só na instalação), pra que instalações já existentes
# ganhem essa proteção sozinhas, na próxima vez que o servidor subir, sem
# precisar rodar o instalador de novo.
#
# Duas tentativas anteriores, nenhuma suficiente sozinha: "-WindowStyle
# Hidden" no argumento do PowerShell reduz o tempo de uma janela aparecer,
# mas não GARANTE isso numa tarefa agendada; a propriedade "Oculta" da
# PRÓPRIA tarefa (<Hidden>true no XML) ajuda mas TAMBÉM não é suficiente -
# usuário relatou uma janela ainda piscando a cada checagem (a cada 2-3
# minutos), mesmo com as duas medidas juntas. O Windows pode alocar
# brevemente uma janela de console pro powershell.exe quando ele é lançado
# direto pelo serviço do Agendador dentro da sessão do usuário logado,
# não importa o que se passe pra ele via linha de comando ou XML.
# rodar-oculto.vbs roda como aplicativo de INTERFACE GRÁFICA (wscript.exe),
# não de console - o Windows nunca aloca janela nenhuma pra esse tipo de
# processo, em nenhum contexto, e ele lança o PowerShell de verdade já
# escondido desde a criação (via WScript.Shell.Run com estilo de janela 0),
# em vez de "esconder depois de criar".
#
# Se a tarefa já existe mas AINDA aponta direto pro powershell.exe (de uma
# versão anterior desta proteção, sem o rodar-oculto.vbs), apaga e recria -
# ao contrário do religamento de uma-vez-só do auto-update (run-update.ts),
# que usa nome único justamente pra nunca precisar sobrescrever, aqui é
# seguro porque é sempre esta mesma tarefa, criada por este mesmo script.
$vigiaTaskName = 'GeradorListaCorteVigia'
$vigiaCurrentXml = schtasks /query /tn $vigiaTaskName /xml 2>$null
$vigiaJaUsaTrampolim = ($LASTEXITCODE -eq 0) -and ($vigiaCurrentXml -match 'rodar-oculto\.vbs')

if (-not $vigiaJaUsaTrampolim) {
    schtasks /delete /tn $vigiaTaskName /f 2>$null | Out-Null

    $vigiaScriptPath = Join-Path $scriptDir 'vigia-servidor.ps1'
    $trampolimPath = Join-Path $scriptDir 'rodar-oculto.vbs'
    $vigiaTaskXmlPath = Join-Path $env:TEMP 'gerador-lista-corte-vigia-task.xml'
    $vigiaTaskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT2M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
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
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT1M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>//B "$trampolimPath" "$vigiaScriptPath"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
    Set-Content -Path $vigiaTaskXmlPath -Value $vigiaTaskXml -Encoding Unicode
    schtasks /create /tn $vigiaTaskName /xml $vigiaTaskXmlPath /f 2>$null | Out-Null
    Remove-Item -Path $vigiaTaskXmlPath -Force -ErrorAction SilentlyContinue
}

# Espera o processo antigo do servidor morrer de vez e liberar a porta e o
# arquivo de log antes de tentar usá-los (ver comentário sobre isso em
# restartServer, em server/src/services/update/run-update.ts) - só se aplica
# na prática ao caminho de auto-atualização; no início pelo Windows ou no
# duplo clique manual não tem processo antigo nenhum, então essa espera só
# atrasa em ~2s à toa, sem problema.
Start-Sleep -Seconds 2

Set-Location $serverDir
# O redirecionamento roda via cmd.exe de propósito, em vez de usar o
# "*>> $logPath" nativo do PowerShell: no PowerShell 5.1 (o que vem no
# Windows), redirecionar a saída de erro de um comando externo embrulha
# cada linha num ErrorRecord verboso (com "+ CategoryInfo :", "+
# FullyQualifiedErrorId :" etc.) mesmo quando não houve erro nenhum de
# verdade - poluindo o log. O redirecionamento do cmd.exe ("2>&1") é
# simples e direto, sem essa embromação.
#
# Start-Process com -WindowStyle Hidden aqui de propósito, em vez do
# operador de chamada "&" usado antes: esse cmd.exe filho não herda
# automaticamente o estilo de janela escondido do PowerShell pai em todo
# contexto (relatado pelo usuário: uma janela do cmd piscando na tela a
# cada checagem do vigia, a cada 2 minutos) - Start-Process aplica o
# esconder direto nesse processo, sem depender de herança nenhuma. Não
# precisa mais ser bloqueante (o script antigo ficava "preso" aqui pra
# sempre, já que o node roda para sempre): nada depois desta linha faz
# limpeza nenhuma, então o script pode terminar na hora - o node, uma vez
# iniciado, continua rodando independente deste processo ter saído.
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "node dist\index.js >> `"$logPath`" 2>&1") -WindowStyle Hidden
