@echo off
:: Pede permissao de administrador automaticamente - necessaria para
:: instalar o Node.js/Tesseract (softwares para todos os usuarios) e para
:: copiar o pacote de idioma Portugues do Tesseract dentro de "Program
:: Files". Sem isso, essas etapas falham em silencio numa maquina nova.
::
:: De proposito NAO tenta detectar "ja estou rodando como administrador?"
:: antes de pedir elevacao - varios metodos de deteccao ("net session",
:: checagem de token) falham de formas diferentes em maquinas diferentes
:: (servico desativado, politica de grupo, etc.), e isso ja causou um
:: loop de pedidos de permissao que nunca terminava. Em vez disso, o
:: parametro "elevado" abaixo garante UMA UNICA tentativa de elevacao,
:: sempre - a segunda execucao (que chega aqui com esse parametro) roda
:: o instalador direto, sem checar nada, então nao tem como entrar em loop.
if "%~1"=="elevado" goto :instalar

echo Pedindo permissao de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevado' -Verb RunAs"
exit /b

:instalar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-em-novo-computador.ps1"
echo.
pause
