@echo off
:: Pede permissao de administrador automaticamente - necessaria para
:: instalar o Node.js/Tesseract (softwares para todos os usuarios) e para
:: copiar o pacote de idioma Portugues do Tesseract dentro de "Program
:: Files". Sem isso, essas etapas falham em silencio numa maquina nova.
::
:: De proposito NAO tenta detectar "ja estou rodando como administrador?"
:: antes de pedir elevacao (metodos de deteccao como "net session" ou
:: checagem de token falham de formas diferentes em maquinas diferentes) -
:: e tambem NAO usa "-ArgumentList" do Start-Process para marcar a segunda
:: execucao (passar argumento por "-Verb RunAs" para um .bat especifico
:: nao e confiavel em todas as versoes/configuracoes do Windows - as duas
:: abordagens ja causaram loop de permissao que nunca terminava).
::
:: Em vez disso, usa um arquivo-marcador temporario: antes de pedir
:: elevacao, cria o marcador; a segunda execucao (agora elevada) encontra
:: o marcador, apaga ele, e segue direto para instalar - sem depender de
:: nenhum argumento de linha de comando chegar correto.
set "MARCADOR=%TEMP%\gerador-lista-corte-elevando.tmp"
if exist "%MARCADOR%" (
    del "%MARCADOR%" >nul 2>&1
    goto :instalar
)

echo Pedindo permissao de administrador...
type nul > "%MARCADOR%"
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:instalar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-em-novo-computador.ps1"
echo.
pause
