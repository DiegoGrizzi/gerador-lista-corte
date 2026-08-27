@echo off
REM Duplo clique aqui para (re)iniciar o servidor manualmente, escondido
REM (sem janela de console) - só chama iniciar-servidor-oculto.ps1 ao lado.
REM "start" desacopla o processo: sem ele, esta janela do cmd ficaria
REM aberta pelo tempo todo que o servidor rodar (que é pra sempre), em vez
REM de fechar na hora.
REM Ver o comentário desse .ps1 para o porquê de não ser mais um .vbs.
start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0iniciar-servidor-oculto.ps1"
