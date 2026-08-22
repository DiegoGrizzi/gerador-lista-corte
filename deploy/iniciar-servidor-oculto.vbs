' ---------------------------------------------------------------------------
' iniciar-servidor-oculto.vbs
'
' Inicia o Gerador de Lista de Corte (interface + API de OCR, tudo num unico
' processo Node) em segundo plano, sem abrir janela de console. Pensado para
' rodar sozinho ao ligar o Windows, via atalho na pasta "Inicializar" do
' usuario (veja deploy/LEIA-ME.md) - mas tambem pode ser clicado manualmente
' a qualquer momento para (re)iniciar o servidor.
'
' Requer que o projeto ja tenha sido compilado uma vez (na raiz do projeto):
'   npm install
'   npm run build
'
' A saida do processo (log de erros, avisos) fica em deploy/server.log.
' ---------------------------------------------------------------------------
Dim WshShell, fso, scriptDir, projectRoot, serverDir, logPath

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
serverDir = fso.BuildPath(projectRoot, "server")
logPath = fso.BuildPath(scriptDir, "server.log")

WshShell.CurrentDirectory = serverDir
WshShell.Run "cmd /c node dist\index.js >> """ & logPath & """ 2>&1", 0, False
