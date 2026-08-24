@echo off
:: Pede permissao de administrador automaticamente se ainda nao tiver -
:: necessaria para instalar o Node.js/Tesseract (softwares para todos os
:: usuarios) e para copiar o pacote de idioma Portugues do Tesseract
:: dentro de "Program Files". Sem isso, essas etapas falham em silencio
:: numa maquina nova (fica so com um aviso, mas sem o pacote de portugues).
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Pedindo permissao de administrador...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-em-novo-computador.ps1"
echo.
pause
