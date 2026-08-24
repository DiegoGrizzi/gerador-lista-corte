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

function Test-OcrSpaceKey {
    # Confere se a chave funciona de verdade, chamando a API com uma
    # imagem minima (1x1 pixel) embutida no proprio script.
    # Retorna: $true (chave valida), $false (chave invalida confirmada),
    # $null (nao deu pra confirmar - ex: sem internet no momento).
    param([string]$Key)
    $tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    try {
        $response = Invoke-RestMethod -Uri 'https://api.ocr.space/parse/image' -Method Post -Body @{
            apikey = $Key
            base64Image = "data:image/png;base64,$tinyPng"
            language = 'por'
        } -TimeoutSec 20 -ErrorAction Stop
        if ($response.error) { return $false }
        return $true
    } catch {
        $details = $_.ErrorDetails.Message
        if ($details -and $details -match 'API key not valid') {
            return $false
        }
        return $null
    }
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
        Write-Host 'Isso normalmente acontece por falta de permissao para escrever em "Program Files". Feche esta janela e rode o instalador.bat de novo (ele pede permissao de administrador automaticamente).' -ForegroundColor Yellow
    }
}

# 3. Baixar ou atualizar o projeto ---------------------------------------
$installDirExists = Test-Path $InstallDir
$isGitRepo = $installDirExists -and (Test-Path (Join-Path $InstallDir '.git'))
$isEmptyDir = $installDirExists -and -not $isGitRepo -and
    ((Get-ChildItem $InstallDir -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0)

if ($isGitRepo) {
    Write-Host 'Atualizando projeto existente...'
    Push-Location $InstallDir
    git pull
    $gitExitCode = $LASTEXITCODE
    Pop-Location
    if ($gitExitCode -ne 0) {
        Stop-OnFailure 'git pull falhou. Confira a conexao com a internet e tente de novo.'
    }
} elseif ($installDirExists -and -not $isEmptyDir) {
    # Pasta existe, tem coisa dentro, mas nao e uma instalacao valida deste
    # sistema (nao tem .git) - nao mexe nela para nao arriscar apagar algo
    # do usuario. Sem isso, o instalador prosseguia direto para "npm
    # install" numa pasta sem package.json e falhava de um jeito confuso.
    Stop-OnFailure "A pasta $InstallDir ja existe e nao esta vazia, mas nao e uma instalacao valida do Gerador de Lista de Corte. Apague essa pasta manualmente (ou edite `$InstallDir no topo deste script para usar outro local) e rode o instalador de novo."
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
        # Copia o CONTEUDO da pasta extraida para dentro de $InstallDir, em
        # vez de renomear a pasta extraida para $InstallDir - isso funciona
        # tanto quando $InstallDir ainda nao existe quanto quando ja existe
        # vazia (Move-Item falharia nesse segundo caso).
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        Copy-Item -Path (Join-Path $extractDir 'gerador-lista-corte-main\*') -Destination $InstallDir -Recurse -Force -ErrorAction Stop
    } catch {
        Stop-OnFailure "Nao consegui baixar/extrair o projeto ($($_.Exception.Message))."
    } finally {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 3.4. Auto-atualizar o proprio .ps1 -----------------------------------
# O .ps1 que voce baixou e roda direto (ex: area de trabalho) e uma copia
# separada do projeto - nao se atualiza sozinho so por existir. Depois de
# baixar/atualizar o projeto acima, copia a versao mais recente de si
# mesmo de volta para onde voce esta rodando o instalador - assim, da
# proxima vez, mesmo sem baixar de novo, voce ja roda a versao mais nova.
#
# So o .ps1 se auto-atualiza, DE PROPOSITO nao o instalador.bat: o
# PowerShell le o script inteiro antes de comecar a rodar (seguro
# sobrescrever o arquivo durante a propria execucao), mas o cmd.exe (que
# roda o .bat) le o arquivo aos poucos, lembrando a posicao onde parou -
# se o conteudo do .bat mudar por baixo dele no meio da execucao, o
# cmd.exe volta a ler na posicao errada e corrompe o resto do script
# (foi exatamente isso que causou o erro "novo-computador.ps1 nao e
# reconhecido..." reportado pelo usuario). O instalador.bat e pequeno e
# raramente muda - se mudar, precisa baixar esse arquivo manualmente.
try {
    $selfDir = $PSScriptRoot
    $sourcePs1 = Join-Path $InstallDir 'deploy\instalar-em-novo-computador.ps1'
    $targetPs1 = Join-Path $selfDir 'instalar-em-novo-computador.ps1'

    if ((Resolve-Path $sourcePs1 -ErrorAction SilentlyContinue).Path -ne (Resolve-Path $targetPs1 -ErrorAction SilentlyContinue).Path) {
        Copy-Item -Path $sourcePs1 -Destination $targetPs1 -Force -ErrorAction Stop
    }
} catch {
    Write-Host "AVISO: nao consegui auto-atualizar o instalar-em-novo-computador.ps1 ($($_.Exception.Message)) - sem problema, so vai precisar baixar manualmente da proxima vez que houver uma correcao nele." -ForegroundColor Yellow
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

    $keyConfigured = $false
    while (-not $keyConfigured) {
        try {
            $ocrKey = Read-Host 'Chave da API OCR.space'
        } catch {
            $ocrKey = $null
        }

        if (-not $ocrKey) {
            Write-Host 'Pulado - so o Tesseract local sera usado por enquanto.'
            $keyConfigured = $true
            continue
        }

        Write-Host 'Conferindo a chave...'
        $keyIsValid = Test-OcrSpaceKey -Key $ocrKey

        if ($keyIsValid -eq $false) {
            Write-Host 'Essa chave nao e valida. Confira se copiou certinho e tente de novo (ou aperte Enter para pular).' -ForegroundColor Yellow
            continue
        }

        $envContent = $envContent -replace '(?m)^OCR_SPACE_API_KEY=\s*$', "OCR_SPACE_API_KEY=$ocrKey"
        Set-Content -Path $envPath -Value $envContent -NoNewline
        if ($keyIsValid -eq $true) {
            Write-Host 'Chave valida - configurada!' -ForegroundColor Green
        } else {
            Write-Host 'Nao consegui confirmar a chave agora (sem internet?) - salvei mesmo assim.' -ForegroundColor Yellow
        }
        $keyConfigured = $true
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
