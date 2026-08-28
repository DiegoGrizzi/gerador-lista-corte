# Rodando em produção (início automático com o Windows)

Este modo compila o sistema inteiro (interface + API de OCR) num único
processo Node, que fica rodando em segundo plano e sobe sozinho toda vez
que o Windows liga — sem precisar abrir terminal, sem `npm run dev`.

## Instalar numa máquina nova (loja)

Cada computador da loja é uma instalação independente (não fica na rede) —
mas o processo é todo automático. Copie os dois arquivos abaixo para a
máquina nova (pendrive, e-mail, pasta compartilhada — não precisa do
projeto inteiro, só esses dois arquivos) e dê duplo clique no `.bat`:

- `deploy/instalador.bat`
- `deploy/instalar-em-novo-computador.ps1`

O instalador sozinho:
1. Instala o Node.js, se não tiver
2. Instala o Git, se não tiver (necessário para o site mostrar a versão instalada e se autoatualizar depois — sem ele, a instalação ainda funciona, mas essas duas coisas ficam indisponíveis)
3. Confere o Tesseract OCR — se não tiver, abre a página de download para instalação manual (a instalação automática dele se mostrou pouco confiável; o sistema funciona normalmente sem ele, só a leitura local de foto fica indisponível até instalar)
4. Baixa o projeto (repositório é público — não pede login) em `%USERPROFILE%\gerador-lista-corte`
5. Pergunta a chave da API OCR.space (opcional — só na primeira vez, ou enquanto não for respondida; pode apertar Enter para pular)
6. Instala as dependências e compila
7. Cria o atalho de início automático e o atalho na área de trabalho
8. Já deixa o servidor rodando

A chave do OCR.space digitada fica só no `server\.env` **daquela máquina** —
nunca é enviada para o GitHub nem gravada no instalador. Cada computador
precisa da própria chave (ou pode pular e usar só o Tesseract local).

Rodar o mesmo instalador de novo no futuro **atualiza** o sistema para a
versão mais recente (baixa o código novo, recompila, reinicia) — é o mesmo
processo pra instalar pela primeira vez ou pra atualizar depois.

## Configuração manual (alternativa, se preferir passo a passo)

1. Instale as dependências e compile o projeto, na raiz:
   ```bash
   npm install
   npm run build
   ```
2. Crie um atalho dentro da pasta de Inicialização do Windows
   (`shell:startup` na barra de endereços do Explorer, ou
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`) apontando
   para `powershell.exe`, com os argumentos
   `-WindowStyle Hidden -ExecutionPolicy Bypass -File "<caminho completo>\deploy\iniciar-servidor-oculto.ps1"`.
   Isso faz o servidor subir sozinho, oculto (sem janela), toda vez que
   você fizer login no Windows (é exatamente o atalho que o instalador cria
   sozinho — normalmente não precisa fazer isso na mão).
3. Crie um atalho na área de trabalho (ou fixe na barra de tarefas) para
   `http://localhost:5175` — é o link que abre o sistema no navegador.

## Uso do dia a dia

- O servidor já fica rodando sozinho depois de ligar o computador — só
  abrir o atalho da área de trabalho (ou `http://localhost:5175` no
  navegador) quando for usar.
- Se fechar o navegador, o sistema continua rodando em segundo plano —
  é só abrir o atalho de novo.

## Depois de atualizar o código

Rode o `instalador.bat` de novo (mesma máquina, mesmo
arquivo) — ele baixa a versão mais recente, recompila e reinicia o
servidor sozinho. Ou clique em "Atualizar agora" no balão que aparece no
próprio sistema quando há uma versão nova (mesmo processo, sem precisar
abrir o instalador). Se preferir fazer manualmente: feche o processo Node
antigo (Gerenciador de Tarefas → "Node.js JavaScript Runtime"), rode
`npm run build` e dê duplo clique em `deploy/iniciar-servidor-oculto.bat`
de novo.

## Onde ver os logs

`deploy/server.log` — criado automaticamente na primeira vez que o servidor
sobe por esse atalho. Útil para checar avisos (ex: "Tesseract não
encontrado") ou erros.

## Configuração (`.env`)

O comportamento do servidor (porta, caminho do Tesseract, chave do
OCR.space) é configurado em `server/.env` — veja `server/.env.example`
para a lista completa de opções, com um comentário explicando cada uma.
