# -----------------------------------------------------------------------------
# instalar-em-novo-computador.ps1
#
# Instala o Gerador de Lista de Corte do zero numa maquina Windows nova:
#   1. Node.js (se nao tiver)
#   2. Tesseract OCR + pacote de idioma Portugues (se nao tiver)
#   3. Baixa o projeto (git clone, ou zip se o git nao estiver disponivel)
#   4. Instala as dependencias e compila
#   5. Cria o atalho de inicio automatico (Inicializar do Windows) e o
#      atalho na area de trabalho
#   6. Inicia o servidor imediatamente
#
# Rodar de novo no futuro atualiza o projeto para a versao mais recente
# (repete os mesmos passos, sem duplicar nada).
#
# Uso: duplo clique em "instalar-em-novo-computador.bat" (ao lado deste
# arquivo) — ele so chama este script. Pode levar alguns minutos a primeira
# vez (baixar Node.js/Tesseract se necessario, e instalar dependencias).
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/DiegoGrizzi/gerador-lista-corte'
$InstallDir = "$env:USERPROFILE\gerador-lista-corte"
$Port = 5175

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
    # Depois de instalar algo via winget, o PATH da sessao atual do
    # PowerShell nao é atualizado sozinho — precisa reler do registro.
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

Write-Host '== Gerador de Lista de Corte - instalador ==' -ForegroundColor Cyan
Write-Host ''

# 1. Node.js -------------------------------------------------------------
if (-not (Test-CommandExists 'node')) {
    Write-Host 'Instalando Node.js...'
    winget install --id OpenJS.NodeJS -e --silent --accept-source-agreements --accept-package-agreements
    Update-SessionPath
} else {
    Write-Host 'Node.js ja instalado.'
}

# 2. Tesseract OCR + pacote de portugues ---------------------------------
$tesseractDir = 'C:\Program Files\Tesseract-OCR'
$tesseractExe = Join-Path $tesseractDir 'tesseract.exe'
if (-not (Test-Path $tesseractExe) -and -not (Test-CommandExists 'tesseract')) {
    Write-Host 'Instalando Tesseract OCR...'
    winget install --id UB-Mannheim.TesseractOCR -e --silent --accept-source-agreements --accept-package-agreements
} else {
    Write-Host 'Tesseract ja instalado.'
}

$tessDataDir = Join-Path $tesseractDir 'tessdata'
$porFile = Join-Path $tessDataDir 'por.traineddata'
if ((Test-Path $tessDataDir) -and -not (Test-Path $porFile)) {
    Write-Host 'Baixando pacote de idioma Portugues para o Tesseract...'
    Invoke-WebRequest -Uri 'https://github.com/tesseract-ocr/tessdata/raw/main/por.traineddata' -OutFile $porFile
}

# 3. Baixar ou atualizar o projeto ---------------------------------------
if (Test-Path $InstallDir) {
    if (Test-Path (Join-Path $InstallDir '.git')) {
        Write-Host 'Atualizando projeto existente...'
        Push-Location $InstallDir
        git pull
        Pop-Location
    } else {
        Write-Host "Pasta $InstallDir ja existe, mas nao e um repositorio git — pulando download."
    }
} elseif (Test-CommandExists 'git') {
    Write-Host 'Baixando projeto (git clone)...'
    git clone $RepoUrl $InstallDir
} else {
    Write-Host 'Baixando projeto (zip)...'
    $zipPath = Join-Path $env:TEMP 'gerador-lista-corte.zip'
    $extractDir = Join-Path $env:TEMP 'gerador-lista-corte-extract'
    Invoke-WebRequest -Uri "$RepoUrl/archive/refs/heads/main.zip" -OutFile $zipPath
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    Move-Item (Join-Path $extractDir 'gerador-lista-corte-main') $InstallDir
    Remove-Item $zipPath -Force
    Remove-Item $extractDir -Recurse -Force
}

# 4. Instalar dependencias e compilar -------------------------------------
Push-Location $InstallDir
Write-Host 'Instalando dependencias (pode demorar alguns minutos)...'
npm install
Write-Host 'Compilando...'
npm run build
Pop-Location

# 5. Atalho de inicio automatico -------------------------------------------
$vbsPath = Join-Path $InstallDir 'deploy\iniciar-servidor-oculto.vbs'
$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$startupShortcut = Join-Path $startupDir 'Gerador de Lista de Corte.lnk'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($startupShortcut)
$sc.TargetPath = "$env:WINDIR\System32\wscript.exe"
$sc.Arguments = "`"$vbsPath`""
$sc.WorkingDirectory = Join-Path $InstallDir 'deploy'
$sc.Description = 'Inicia o Gerador de Lista de Corte em segundo plano'
$sc.Save()

# 6. Atalho na area de trabalho ---------------------------------------------
$desktopDir = [Environment]::GetFolderPath('Desktop')
$iconPath = Join-Path $InstallDir 'client\public\icone.ico'
$urlShortcut = Join-Path $desktopDir 'Gerador de Lista de Corte.url'
$urlContent = "[InternetShortcut]`r`nURL=http://localhost:$Port`r`nIconFile=$iconPath`r`nIconIndex=0`r`n"
Set-Content -Path $urlShortcut -Value $urlContent -Encoding ASCII

# 7. Iniciar agora -----------------------------------------------------------
Write-Host 'Iniciando o servidor...'
Start-Process 'wscript.exe' -ArgumentList "`"$vbsPath`""
Start-Sleep -Seconds 3

Write-Host ''
Write-Host 'Pronto! Abra "Gerador de Lista de Corte" na area de trabalho.' -ForegroundColor Green
Write-Host "Ou acesse: http://localhost:$Port" -ForegroundColor Green
