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
#
# Nota tecnica: NAO usamos $ErrorActionPreference = 'Stop' global de
# proposito — no PowerShell 5.1 (o que vem no Windows), comandos externos
# como git e npm escrevem mensagens normais de progresso em stderr, e com
# 'Stop' ativo isso vira um erro fatal falso mesmo quando o comando teve
# sucesso. Em vez disso, cada passo critico confere $LASTEXITCODE (ou o
# resultado esperado) manualmente.
# -----------------------------------------------------------------------------

$RepoUrl = 'https://github.com/DiegoGrizzi/gerador-lista-corte'
$InstallDir = "$env:USERPROFILE\gerador-lista-corte"
$Port = 5175

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
    # Depois de instalar algo via winget, o PATH da sessao atual do
    # PowerShell nao e atualizado sozinho - precisa reler do registro.
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Stop-OnFailure {
    param([string]$Message)
    Write-Host ''
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host '== Gerador de Lista de Corte - instalador ==' -ForegroundColor Cyan
Write-Host ''

# 1. Node.js -------------------------------------------------------------
if (-not (Test-CommandExists 'node')) {
    Write-Host 'Instalando Node.js...'
    winget install --id OpenJS.NodeJS -e --silent --accept-source-agreements --accept-package-agreements
    Update-SessionPath
    if (-not (Test-CommandExists 'node')) {
        Stop-OnFailure 'Nao consegui instalar o Node.js automaticamente. Instale manualmente em https://nodejs.org/ e rode este instalador de novo.'
    }
} else {
    Write-Host 'Node.js ja instalado.'
}

# 2. Tesseract OCR + pacote de portugues ---------------------------------
$tesseractDir = 'C:\Program Files\Tesseract-OCR'
$tesseractExe = Join-Path $tesseractDir 'tesseract.exe'
if (-not (Test-Path $tesseractExe) -and -not (Test-CommandExists 'tesseract')) {
    Write-Host 'Instalando Tesseract OCR...'
    winget install --id UB-Mannheim.TesseractOCR -e --silent --accept-source-agreements --accept-package-agreements
    if (-not (Test-Path $tesseractExe) -and -not (Test-CommandExists 'tesseract')) {
        Write-Host 'AVISO: nao consegui instalar o Tesseract automaticamente.' -ForegroundColor Yellow
        Write-Host 'O sistema vai funcionar normalmente para texto colado; a leitura de foto local fica indisponivel ate instalar o Tesseract manualmente (https://github.com/UB-Mannheim/tesseract/wiki).' -ForegroundColor Yellow
    }
} else {
    Write-Host 'Tesseract ja instalado.'
}

$tessDataDir = Join-Path $tesseractDir 'tessdata'
$porFile = Join-Path $tessDataDir 'por.traineddata'
if ((Test-Path $tessDataDir) -and -not (Test-Path $porFile)) {
    Write-Host 'Baixando pacote de idioma Portugues para o Tesseract...'
    try {
        Invoke-WebRequest -Uri 'https://github.com/tesseract-ocr/tessdata/raw/main/por.traineddata' -OutFile $porFile -ErrorAction Stop
    } catch {
        Write-Host "AVISO: nao consegui baixar o pacote de portugues do Tesseract ($($_.Exception.Message))." -ForegroundColor Yellow
    }
}

# 3. Baixar ou atualizar o projeto ---------------------------------------
if (Test-Path $InstallDir) {
    if (Test-Path (Join-Path $InstallDir '.git')) {
        Write-Host 'Atualizando projeto existente...'
        Push-Location $InstallDir
        git pull
        $gitExitCode = $LASTEXITCODE
        Pop-Location
        if ($gitExitCode -ne 0) {
            Stop-OnFailure 'git pull falhou. Confira a conexao com a internet e tente de novo.'
        }
    } else {
        Write-Host "Pasta $InstallDir ja existe, mas nao e um repositorio git - pulando download."
    }
} elseif (Test-CommandExists 'git') {
    Write-Host 'Baixando projeto (git clone)...'
    git clone $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Stop-OnFailure 'git clone falhou. Confira a conexao com a internet e tente de novo.'
    }
} else {
    Write-Host 'Baixando projeto (zip)...'
    $zipPath = Join-Path $env:TEMP 'gerador-lista-corte.zip'
    $extractDir = Join-Path $env:TEMP 'gerador-lista-corte-extract'
    try {
        Invoke-WebRequest -Uri "$RepoUrl/archive/refs/heads/main.zip" -OutFile $zipPath -ErrorAction Stop
        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force -ErrorAction Stop
        Move-Item (Join-Path $extractDir 'gerador-lista-corte-main') $InstallDir -ErrorAction Stop
    } catch {
        Stop-OnFailure "Nao consegui baixar/extrair o projeto ($($_.Exception.Message))."
    } finally {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 3.5. Chave da API OCR.space (opcional, fallback de leitura de foto) -----
# So perguntada quando ainda nao esta configurada - roda de novo no futuro
# nao pede de novo se voce ja respondeu (ou pulou) antes. A chave fica
# SOMENTE no arquivo local server/.env desta maquina, que nunca vai pro
# GitHub (esta no .gitignore) - nunca e escrita no codigo do instalador.
$envPath = Join-Path $InstallDir 'server\.env'
$envExamplePath = Join-Path $InstallDir 'server\.env.example'

if (-not (Test-Path $envPath)) {
    Copy-Item $envExamplePath $envPath
}

$envContent = Get-Content -Path $envPath -Raw
if ($envContent -match '(?m)^OCR_SPACE_API_KEY=\s*$') {
    Write-Host ''
    Write-Host 'Fallback de leitura de foto (OCR.space) - opcional.' -ForegroundColor Cyan
    Write-Host 'O sistema ja funciona normalmente so com o Tesseract local sem isso.'
    Write-Host 'Se voce ja tem uma chave gratuita (cadastro em https://ocr.space/OCRAPI/freekey), cole abaixo.'
    Write-Host 'Sem chave em maos agora? So apertar Enter pula essa parte - da pra configurar depois editando server\.env.'
    try {
        $ocrKey = Read-Host 'Chave da API OCR.space'
    } catch {
        $ocrKey = $null
    }
    if ($ocrKey) {
        $envContent = $envContent -replace '(?m)^OCR_SPACE_API_KEY=\s*$', "OCR_SPACE_API_KEY=$ocrKey"
        Set-Content -Path $envPath -Value $envContent -NoNewline
        Write-Host 'Chave configurada.' -ForegroundColor Green
    } else {
        Write-Host 'Pulado - so o Tesseract local sera usado por enquanto.'
    }
}

# 4. Instalar dependencias e compilar -------------------------------------
Push-Location $InstallDir
Write-Host 'Instalando dependencias (pode demorar alguns minutos)...'
npm install
$npmInstallExitCode = $LASTEXITCODE
if ($npmInstallExitCode -ne 0) {
    Pop-Location
    Stop-OnFailure 'npm install falhou - veja a mensagem acima.'
}

Write-Host 'Compilando...'
npm run build
$npmBuildExitCode = $LASTEXITCODE
Pop-Location
if ($npmBuildExitCode -ne 0) {
    Stop-OnFailure 'npm run build falhou - veja a mensagem acima.'
}

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
