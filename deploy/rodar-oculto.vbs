' -----------------------------------------------------------------------------
' rodar-oculto.vbs
' ---------------------------------------------------------------------------
' Lanca o script PowerShell passado como argumento verdadeiramente escondido
' (sem NENHUMA janela piscando, nem por um instante) - usado como a acao das
' tarefas agendadas do vigia e do religamento (ver iniciar-servidor-oculto.ps1
' e server/src/services/update/run-update.ts).
'
' Existe porque a propriedade <Hidden>true</Hidden> da propria tarefa (a
' tentativa anterior de resolver isso) NAO e suficiente: ela so esconde a
' tarefa da lista do Agendador, mas o Windows ainda pode alocar por um
' instante uma janela de console pro powershell.exe quando ele e lancado
' direto pelo servico do Agendador dentro da sessao do usuario logado -
' confirmado de verdade (usuario relatou o cmd piscando a cada checagem do
' vigia, a cada 2-3 minutos, mesmo com a tarefa ja marcada como oculta).
'
' wscript.exe roda como aplicativo de INTERFACE GRAFICA (nao de console) - o
' Windows nunca aloca janela nenhuma pra ele, em nenhum contexto. Chamar
' objShell.Run com o terceiro parametro (janela) igual a 0 lanca o processo
' filho (o powershell.exe de verdade) ja escondido desde a criacao, sem
' depender de "esconder depois de criar" (que e o que -WindowStyle Hidden e
' <Hidden>true</Hidden> fazem, e o que falha as vezes).
'
' NAO reintroduz o problema que fez este projeto abandonar o Windows Script
' Host (WSH) da primeira vez ("Recursos de memoria insuficientes", relatado
' bem na hora de reiniciar depois de compilar 3 workspaces) - aquele erro
' aconteceu rodando um script PESADO (git pull + npm install + npm run
' build) sob pressao de memoria real. Este arquivo so faz UMA chamada COM
' (CreateObject + Run) e sai na hora - nao faz nenhum trabalho pesado, entao
' nao corre o mesmo risco.
' -----------------------------------------------------------------------------

Dim objShell, alvo, comando

If WScript.Arguments.Count = 0 Then
    WScript.Quit 1
End If

alvo = WScript.Arguments(0)
comando = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & alvo & """"

Set objShell = CreateObject("WScript.Shell")
objShell.Run comando, 0, False
