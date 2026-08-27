# Gerador de Lista de Corte — CorteCloud

Sistema web local para a **Araújo Madeiras**. Recebe mensagens coladas (WhatsApp, bloco de notas, etc.) com medidas de peças de marcenaria e gera uma lista pronta para colar no [CorteCloud](https://cortecloud.com.br/).

Funciona bem em qualquer tamanho de tela — no celular, a tabela de peças vira uma lista de cartões (um por peça) em vez de exigir rolagem lateral.

> Este projeto foi migrado de HTML/CSS/JS puro para **TypeScript + React + Node** (monorepo com npm workspaces) — veja [Estrutura do projeto](#estrutura-do-projeto).

## Como rodar

### Instalar numa loja/computador novo

Cada computador roda sua própria instalação (não fica compartilhado pela
rede). Copie `deploy/instalador.bat` e
`deploy/instalar-em-novo-computador.ps1` para a máquina e dê duplo clique
no `.bat` — o instalador cuida de tudo sozinho (Node.js, Tesseract OCR com
pacote de português, baixar o projeto, compilar, e deixar rodando
automaticamente com o Windows). Detalhes em [`deploy/LEIA-ME.md`](deploy/LEIA-ME.md).

### Uso do dia a dia (depois de instalado)

O sistema fica rodando sozinho em segundo plano e sobe automaticamente com
o Windows — não precisa abrir terminal nem rodar nenhum comando no dia a
dia. Basta abrir o atalho **"Gerador de Lista de Corte"** (área de
trabalho) ou acessar `http://localhost:5175` no navegador.

### Desenvolvimento

Requer [Node.js](https://nodejs.org/) 20+ instalado.

```bash
npm install
npm run dev
```

Isso sobe o backend (`http://localhost:5175`) e o frontend (`http://localhost:5173`) **separados**, com hot-reload. Abra `http://localhost:5173` no navegador.

Outros comandos úteis (na raiz do monorepo):

```bash
npm run build   # compila os três pacotes (parser, server, client) para produção
npm run serve   # compila e roda o sistema completo num único processo (o mesmo usado no início automático)
npm run test    # roda a suite de testes (Vitest) dos três pacotes
npm run lint    # ESLint no monorepo inteiro
```

## Como usar

1. Cole a mensagem com as medidas
2. Clique em **Analisar mensagem** — confirme se as medidas já estão em milímetros
3. Confira a tabela de peças identificadas — edite qualquer campo se precisar
4. Clique em **Gerar lista para o CorteCloud**
5. Clique em **Copiar para Excel** e cole direto no CorteCloud

## O que o sistema reconhece automaticamente

- **Material**: blocos de texto contendo "MDF" (cor, espessura, etc.)
- **Peças**: linhas no formato `quantidade=comprimento/largura` (aceita também `x`, `-`, `pç`, `pc`, entre outras variações comuns de digitação), ou no formato invertido `comprimento x largura: quantidade` (comum em listas exportadas de outros programas de otimização de corte, ex: `760x395: 2 peças`)
- **Fitamento**: frases como "fitado um lado maior", "fitado os 4 lados", "não precisa fita", ou fita indicada direto no número (ex: `70 fita x59`)
- **Ambiente/móvel** (ex: "Cozinha", "Guarda-roupa") e **função da peça** (ex: "gaveta", "lateral"), a partir de uma lista de palavras-chave
- **Erros de digitação comuns** (vírgula dupla, ponto duplicado, etc.) — ficam sinalizados na lista de conferência, com uma correção sugerida para você confirmar antes de entrar na lista final
- **Sentido do veio do MDF**: quando a largura de uma peça passa de 1840mm, comprimento e largura são invertidos automaticamente (o veio da chapa sempre acompanha o comprimento), e a fita é remapeada para a mesma borda física. A peça fica destacada em azul na conferência, com uma observação explicando a troca.

Qualquer linha que não se encaixe em nada disso fica de fora silenciosamente, sem virar peça errada.

### Proteções contra erros silenciosos

Além dos formatos já vistos na prática, o parser também está preparado para:

- **Ponto como separador de milhar** — "2.400" é lido como 2400 (não 2,4), seguindo a formatação numérica brasileira. Só se aplica quando há exatamente 3 dígitos depois do ponto; "56.5" continua sendo lido como decimal normalmente.
- **Negrito, itálico ou tachado do WhatsApp** (`*texto*`, `_texto_`, `~texto~`) envolvendo uma linha inteira — a marcação é removida antes de interpretar, então uma peça ou um cabeçalho de material destacado continuam funcionando normalmente.
- **Duas ou mais peças na mesma linha** (ex: "2=47/47, 3=50/60") — cada peça é separada e processada individualmente. Se qualquer uma das peças não puder ser interpretada com confiança, a linha inteira vai para a lista de conferência (em vez de registrar parte errada ou perder informação em silêncio).
- **Variações de marcador de quantidade** — além de "pç"/"pc"/"-"/"=", também reconhece "un", "und", "unid", "unidade", e tanto "peça"/"peças" quanto a grafia sem cedilha "peca"/"pecas".

**Limitação conhecida e proposital:** espaço como separador de milhar (ex: "1 200" para 1200) não é tratado, porque o mesmo padrão — número, espaço, número — é usado o tempo todo para separar quantidade de medida (ex: "2 pç 400 x 60"). Tratar espaço como milhar de forma ampla quebraria esse uso comum sempre que a medida tivesse exatamente 3 dígitos. Se esse formato aparecer na prática, o ideal é revisar caso a caso.

## Enviar foto (opcional)

Além de colar texto, também é possível enviar uma ou **várias fotos** de uma vez de listas de peças **impressas ou digitais** (não funciona com letra de mão) — o botão **Enviar foto** manda cada imagem para o backend (`server/`), que lê o texto da tabela e devolve já reorganizado no formato que o sistema entende, deixando na caixa de mensagem para revisão antes de analisar.

**Leitura híbrida**: por padrão, a leitura é feita 100% local com [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) — sem custo, sem internet, sem chave de nenhum tipo. Quando o Tesseract não está instalado, falha, ou devolve pouco texto útil (foto difícil de ler), o backend tenta automaticamente o fallback em nuvem [OCR.space](https://ocr.space/ocrapi) (tier gratuito, sem cartão de crédito) — configurável via `OCR_SPACE_API_KEY` em `server/.env` (veja `server/.env.example`). Sem essa chave configurada, o fallback fica desativado e só o Tesseract local é usado.

**Instalar o Tesseract (Windows)**: baixe o instalador em [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki), marcando o pacote de idioma **Portuguese** durante a instalação. O `server` detecta automaticamente o Tesseract instalado no caminho padrão (`C:\Program Files\Tesseract-OCR\tesseract.exe`) — não precisa configurar nada a mais. Se você instalou em outro lugar, defina `TESSERACT_PATH` em `server/.env` apontando para o executável.

Ao enviar fotos, o sistema pergunta o **material de cada uma** (com uma pré-visualização da imagem para você confirmar qual é qual) — assim peças de materiais diferentes, mesmo vindo de fotos separadas, ficam corretamente identificadas. Na primeira foto, informar o material é obrigatório; a partir da segunda, também aparece a opção **"Herdar material anterior"**, para quando várias fotos forem do mesmo material.

Dois formatos de tabela são reconhecidos:
- Tabela com colunas separadas (#, Compr., Largura, Quant., Rotação, Nome, PA)
- Coluna única "Peças" no formato `comprimento X largura - quantidade`
  (ex: "1900 X 350 - 2") — esse formato não carrega fitamento (que na
  imagem é indicado por sublinhado, uma informação visual que se perde na
  leitura de texto); a fita fica em branco para ser marcada manualmente
  na tabela de conferência.

Se nem o Tesseract nem o fallback conseguirem ler a imagem, o botão "Enviar foto" mostra uma mensagem de erro clara — o resto do sistema (colar texto) continua funcionando normalmente.

**Sempre revise o texto reconhecido antes de clicar em "Analisar mensagem"**
— OCR pode errar números, e um comprimento ou largura errado só é
percebido nessa revisão. Isso importa especialmente para fotos com letra
pequena ou muitas linhas/checkboxes disputando espaço com os números —
nesses casos, fotografar mais de perto (focando só na coluna de medidas)
tende a melhorar bastante a leitura.

## Estrutura do projeto

```
gerador-lista-corte/
├── packages/
│   └── parser/         → @corte-cloud/parser: motor de interpretação de texto (TS puro, sem DOM, com testes Vitest)
├── server/              → @corte-cloud/server: API Express (POST /api/ocr — Tesseract local + fallback OCR.space); em produção também serve a interface compilada (client/dist)
├── client/              → @corte-cloud/client: interface (React + Vite), consome @corte-cloud/parser e a API do server
└── deploy/              → instalação e início automático em produção (ver deploy/LEIA-ME.md)
    ├── instalador.bat  → instalador de ponta a ponta pra uma máquina nova
    ├── instalar-em-novo-computador.ps1
    ├── iniciar-servidor-oculto.ps1   → sobe o servidor escondido (sem janela); usado pelo atalho de inicialização e pela auto-atualização
    └── iniciar-servidor-oculto.bat   → duplo clique pra (re)iniciar manualmente — só chama o .ps1 acima
```

`packages/parser` não depende do navegador nem do Node especificamente — só recebe texto e devolve dados (`analyzeText(...)`, `quickParseLine(...)`, `convertPieceToMm(...)`). Isso facilita testar a lógica de interpretação isoladamente, e é o pacote com a suite de testes mais extensa do projeto (regras de fitamento, sentido do veio, conversão de números, etc.).

`server` cuida só do OCR: recebe uma foto em base64, tenta o Tesseract local e cai para o OCR.space quando necessário — nenhuma interpretação de peça/material/fita acontece aqui, isso é sempre trabalho do `packages/parser`.

`client` cuida da tela: chama o `packages/parser`, guarda o estado atual (peças, itens em conferência) num reducer React, e chama a API do `server` para o fluxo de foto.

## Desenvolvido por

Diego Grizzi
