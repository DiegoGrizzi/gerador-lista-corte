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

Set-Location $serverDir
# O redirecionamento roda via cmd.exe de propósito, em vez de usar o
# "*>> $logPath" nativo do PowerShell: no PowerShell 5.1 (o que vem no
# Windows), redirecionar a saída de erro de um comando externo embrulha
# cada linha num ErrorRecord verboso (com "+ CategoryInfo :", "+
# FullyQualifiedErrorId :" etc.) mesmo quando não houve erro nenhum de
# verdade - poluindo o log. O redirecionamento do cmd.exe ("2>&1") é
# simples e direto, sem essa embromação.
& cmd /c "node dist\index.js >> `"$logPath`" 2>&1"
