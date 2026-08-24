# Rodando em produção (início automático com o Windows)

Este modo compila o sistema inteiro (interface + API de OCR) num único
processo Node, que fica rodando em segundo plano e sobe sozinho toda vez
que o Windows liga — sem precisar abrir terminal, sem `npm run dev`.

## Instalar numa máquina nova (loja)

Cada computador da loja é uma instalação independente (não fica na rede) —
mas o processo é todo automático. Copie os dois arquivos abaixo para a
máquina nova (pendrive, e-mail, pasta compartilhada — não precisa do
projeto inteiro, só esses dois arquivos) e dê duplo clique no `.bat`:

- `deploy/instalar-em-novo-computador.bat`
- `deploy/instalar-em-novo-computador.ps1`

O instalador sozinho:
1. Instala o Node.js, se não tiver
2. Instala o Tesseract OCR com o pacote de idioma Português, se não tiver
3. Baixa o projeto (repositório é público — não pede login) em `%USERPROFILE%\gerador-lista-corte`
4. Pergunta a chave da API OCR.space (opcional — só na primeira vez, ou enquanto não for respondida; pode apertar Enter para pular)
5. Instala as dependências e compila
6. Cria o atalho de início automático e o atalho na área de trabalho
7. Já deixa o servidor rodando

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
2. Crie um atalho para `deploy/iniciar-servidor-oculto.vbs` dentro da pasta
   de Inicialização do Windows (`shell:startup` na barra de endereços do
   Explorer, ou `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`).
   Isso faz o servidor subir sozinho, oculto (sem janela), toda vez que
   você fizer login no Windows.
3. Crie um atalho na área de trabalho (ou fixe na barra de tarefas) para
   `http://localhost:5175` — é o link que abre o sistema no navegador.

## Uso do dia a dia

- O servidor já fica rodando sozinho depois de ligar o computador — só
  abrir o atalho da área de trabalho (ou `http://localhost:5175` no
  navegador) quando for usar.
- Se fechar o navegador, o sistema continua rodando em segundo plano —
  é só abrir o atalho de novo.

## Depois de atualizar o código

Rode o `instalar-em-novo-computador.bat` de novo (mesma máquina, mesmo
arquivo) — ele baixa a versão mais recente, recompila e reinicia o
servidor sozinho. Se preferir fazer manualmente: feche o processo Node
antigo (Gerenciador de Tarefas → "Node.js JavaScript Runtime"), rode
`npm run build` e dê duplo clique em `deploy/iniciar-servidor-oculto.vbs`
de novo.

## Onde ver os logs

`deploy/server.log` — criado automaticamente na primeira vez que o servidor
sobe por esse atalho. Útil para checar avisos (ex: "Tesseract não
encontrado") ou erros.

## Configuração (`.env`)

O comportamento do servidor (porta, caminho do Tesseract, chave do
OCR.space) é configurado em `server/.env` — veja `server/.env.example`
para a lista completa de opções, com um comentário explicando cada uma.
