# -----------------------------------------------------------------------------
# vigia-servidor.ps1
#
# Rede de segurança contra religamentos que falham: roda periodicamente
# (a cada 2 minutos, via a tarefa agendada RECORRENTE "GeradorListaCorteVigia"
# - registrada automaticamente por iniciar-servidor-oculto.ps1 na primeira
# vez que rodar, ver mais abaixo) e, se a porta do servidor não estiver
# escutando, religa sozinho.
#
# Existe porque o religamento disparado direto pela auto-atualização
# (server/src/services/update/run-update.ts -> uma tarefa do Agendador de
# disparo único) já se mostrou instável mais de uma vez, por motivos
# DIFERENTES a cada vez: Windows Script Host travando sob pouca memória,
# isolamento de processo do Windows matando o religamento junto com o
# processo antigo, "Acesso negado" ao tentar reaproveitar o nome de uma
# tarefa já existente, e um caso sem causa clara nenhuma onde o disparo
# imediato simplesmente não aconteceu (a máquina ficou ligada, sem ninguém
# mexer, com o sistema fora do ar por quase dois dias até o próximo início
# manual). Em vez de continuar perseguindo cada causa individual, este
# vigia garante que, seja qual for o motivo de uma falha específica, o
# sistema volta ao ar sozinho na PRÓXIMA checagem (no máximo alguns
# minutos depois), sem precisar de intervenção manual.
# -----------------------------------------------------------------------------

$scriptDir = $PSScriptRoot
$launcherPath = Join-Path $scriptDir 'iniciar-servidor-oculto.ps1'
$port = 5175

# Tenta conectar de verdade na porta, em vez de consultar a tabela de
# conexões do Windows (Get-NetTCPConnection) - essa consulta passa por
# WMI/CIM por baixo dos panos, que já se mostrou pouco confiável quando
# rodado dentro de uma tarefa agendada (contexto de execução diferente de
# rodar interativamente), causando religamentos disparados à toa com o
# servidor já no ar (visível como uma janela de cmd piscando a cada
# checagem). Uma conexão TCP de verdade é o sinal mais direto possível de
# "tem algo respondendo aqui".
$isUp = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $port)
    $isUp = $true
    $client.Close()
} catch {
    $isUp = $false
}

if (-not $isUp) {
    # Start-Process (não bloqueante) de propósito: precisa terminar rápido
    # pra não deixar essa MESMA tarefa agendada "presa em execução" e
    # impedir a próxima checagem de rodar no horário (o servidor, uma vez
    # no ar, roda pra sempre - se essa chamada fosse bloqueante, o vigia
    # nunca mais rodaria de novo).
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$launcherPath`"") -WindowStyle Hidden
}
