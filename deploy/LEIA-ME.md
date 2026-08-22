# Rodando em produção (início automático com o Windows)

Este modo compila o sistema inteiro (interface + API de OCR) num único
processo Node, que fica rodando em segundo plano e sobe sozinho toda vez
que o Windows liga — sem precisar abrir terminal, sem `npm run dev`.

## Configuração inicial (uma vez só)

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
   Um atalho pronto (`Gerador de Lista de Corte.url`) já foi colocado na
   área de trabalho durante a configuração inicial.

## Uso do dia a dia

- O servidor já fica rodando sozinho depois de ligar o computador — só
  abrir o atalho da área de trabalho (ou `http://localhost:5175` no
  navegador) quando for usar.
- Se fechar o navegador, o sistema continua rodando em segundo plano —
  é só abrir o atalho de novo.

## Depois de atualizar o código

Sempre que o código mudar (uma nova versão do sistema), é preciso recompilar
e reiniciar o servidor:

```bash
npm run build
```

Depois, feche o processo Node antigo (Gerenciador de Tarefas → procure por
"Node.js JavaScript Runtime", ou reinicie o Windows) e rode o
`deploy/iniciar-servidor-oculto.vbs` de novo (duplo clique) — ou simplesmente
reinicie o computador, já que ele sobe sozinho no login.

## Onde ver os logs

`deploy/server.log` — criado automaticamente na primeira vez que o servidor
sobe por esse atalho. Útil para checar avisos (ex: "Tesseract não
encontrado") ou erros.

## Configuração (`.env`)

O comportamento do servidor (porta, caminho do Tesseract, chave do
OCR.space) é configurado em `server/.env` — veja `server/.env.example`
para a lista completa de opções, com um comentário explicando cada uma.
