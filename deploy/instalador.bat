@echo off
:: Pede permissao de administrador automaticamente se ainda nao tiver -
:: necessaria para instalar o Node.js/Tesseract (softwares para todos os
:: usuarios) e para copiar o pacote de idioma Portugues do Tesseract
:: dentro de "Program Files". Sem isso, essas etapas falham em silencio
:: numa maquina nova (fica so com um aviso, mas sem o pacote de portugues).
::
:: Usa PowerShell para checar isso (WindowsPrincipal.IsInRole) em vez do
:: truque classico "net session" - "net session" depende do servico
:: "Servidor" (LanmanServer) estar ativo, e falha SEMPRE em maquinas onde
:: esse servico esta desativado, mesmo ja rodando elevado. Isso causava
:: um loop infinito pedindo permissao de novo a cada tentativa.
powershell -NoProfile -Command "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 1 }" >nul 2>&1
if %errorLevel% neq 0 (
    echo Pedindo permissao de administrador...
    powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs -ErrorAction Stop } catch { Write-Host 'Permissao de administrador negada. Rode o instalador.bat de novo e clique em Sim na janela do Windows.'; Start-Sleep -Seconds 5 }"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-em-novo-computador.ps1"
echo.
pause
