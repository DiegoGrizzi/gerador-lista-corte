# Servidor de OCR local — configuração no Windows

Esta pasta é opcional. Sem ela, o sistema principal (`index.html`) funciona
normalmente — só o botão **"Enviar foto"** depende deste servidor estar
rodando. Colar mensagem de texto continua funcionando sempre, mesmo sem
nada disso configurado.

## O que isto faz

Roda o Tesseract (leitor de texto em imagens) no seu próprio computador,
sem custo e sem internet. O botão "Enviar foto" manda a imagem pra esse
servidor (que só aceita conexão do próprio computador, nunca da internet),
ele lê o texto da tabela, e devolve pro sistema já no formato que o parser
entende.

**Não funciona com letra de mão** — só com listas impressas/digitais,
como a tabela de exemplo que validamos (#, Compr., Largura, Quant.,
Rotação, Nome, PA).

## Passo 1 — Instalar o Tesseract

1. Baixe o instalador em: https://github.com/UB-Mannheim/tesseract/wiki
   (procure por "tesseract-ocr-w64-setup", é o instalador oficial pra Windows)
2. Durante a instalação, na tela de seleção de idiomas ("Additional language
   data"), marque **Portuguese** — é o pacote necessário pra ler "Não",
   "Compr.", etc corretamente
3. Deixe o caminho de instalação padrão sugerido pelo instalador
   (`C:\Program Files\Tesseract-OCR`) — o servidor já procura ali primeiro

## Passo 2 — Testar o servidor manualmente

Antes de configurar para iniciar automático, confirme que funciona:

1. Abra o Prompt de Comando (ou PowerShell)
2. Entre na pasta `ocr-server` (dentro da pasta do projeto que você
   extraiu do zip) — **atenção**: é essa subpasta, não a pasta principal
   do projeto:
   ```
   cd caminho\para\gerador-lista-corte\ocr-server
   ```
3. Rode:
   ```
   node server-ocr.js
   ```
4. Deve aparecer:
   ```
   Servidor de OCR do Gerador de Lista de Corte rodando em http://localhost:5175
   ```
5. Deixe essa janela aberta, abra o `index.html` do sistema principal, e
   teste o botão "Enviar foto" com uma foto de exemplo
5. Se der erro de "Tesseract não encontrado", confirme o caminho de
   instalação e ajuste a linha `DEFAULT_TESSERACT_PATH` no topo do
   `server-ocr.js` se necessário

Depois de confirmar que funciona, pode fechar essa janela (Ctrl+C) e seguir
para o próximo passo, se quiser que ligue automaticamente.

## Passo 3 (opcional) — Ligar automaticamente com o Windows

Isso faz o servidor começar sozinho, escondido (sem janela), sempre que
você entrar no Windows. São **duas pastas diferentes** envolvidas — vale
deixar as duas janelas do Explorador de Arquivos abertas ao mesmo tempo:

1. Pressione `Win + R`, digite `shell:startup` e aperte Enter — isso abre
   a pasta de inicialização do Windows. Deixe essa janela aberta.
2. Abra **uma segunda janela** do Explorador de Arquivos e navegue até a
   pasta `ocr-server` — a mesma pasta onde está este `LEIA-ME.md` e o
   `server-ocr.js` (dentro da pasta do projeto que você extraiu do zip)
3. Nessa segunda janela, clique com o botão direito no arquivo
   `iniciar-servidor-oculto.vbs` → **Criar atalho**
4. Arraste esse atalho recém-criado para a **primeira janela** (a pasta
   de inicialização, aberta no passo 1)
5. Pronto — no próximo login, o servidor já vai estar rodando em segundo
   plano, sem nenhuma janela aparecendo

**Para testar sem reiniciar o computador:** dê duplo-clique direto no
`iniciar-servidor-oculto.vbs` (na pasta `ocr-server`) — ele liga o
servidor do mesmo jeito.

**Para parar o servidor:** abra o Gerenciador de Tarefas (Ctrl+Shift+Esc),
procure por "Node.js JavaScript Runtime" e finalize a tarefa.

## Se algo não funcionar

- **"Não consegui falar com o servidor de OCR local"** na tela do sistema
  principal → o servidor não está rodando. Rode `node server-ocr.js`
  manualmente (Passo 2) pra ver a mensagem de erro exata.
- **"Tesseract não encontrado"** → confirme que instalou (Passo 1) e que o
  caminho no topo do `server-ocr.js` bate com onde foi instalado.
- **Texto reconhecido vem muito errado** → confira se o pacote de idioma
  Portuguese foi mesmo instalado (Passo 1) e se a foto está bem enquadrada,
  legível e sem muita inclinação.
