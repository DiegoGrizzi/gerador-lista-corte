' iniciar-servidor-oculto.vbs
' ---------------------------------------------------------------------------
' Liga o servidor de OCR (server-ocr.js) em segundo plano, sem abrir nenhuma
' janela de terminal. Usado para o servidor começar junto com o Windows —
' veja LEIA-ME.md para colocar um atalho deste arquivo na pasta de
' inicialização.
'
' Também pode ser usado manualmente: só dar duplo-clique aqui sempre que
' quiser ligar o servidor sem ver uma janela preta na tela.
' ---------------------------------------------------------------------------

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Pasta onde este próprio script está, para achar o server-ocr.js do lado
pastaAtual = FSO.GetParentFolderName(WScript.ScriptFullName)
caminhoServidor = pastaAtual & "\server-ocr.js"

' O "0" no final esconde a janela; o "False" faz não esperar o processo terminar
WshShell.Run "node """ & caminhoServidor & """", 0, False
