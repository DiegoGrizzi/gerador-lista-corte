# Gerador de Lista de Corte — guia para quem mexe no código

Este arquivo é para quem desenvolve aqui, pessoa ou agente de IA. O
[`README.md`](README.md) explica o sistema para quem usa; aqui fica como ele é
feito, como se testa e como chega às lojas e ao servidor.

O repositório é em português: código comentado, documentação, mensagens de
commit e de erro. Nomes de função, variável e arquivo seguem em inglês, como
já estão.

## Arquitetura

Monorepo com npm workspaces, tudo em TypeScript.

| Pasta | Pacote | O que faz |
|---|---|---|
| `packages/parser` | `@corte-cloud/parser` | Interpreta o texto (peças, material, fita, veio). TS puro: não usa navegador nem Node. É onde mora a regra de negócio e a maior parte dos testes. |
| `server` | `@corte-cloud/server` | API Express. Lê foto (`POST /api/ocr`) e PDF (`POST /api/pdf`) e devolve texto. Não interpreta peça nenhuma. Em produção também serve a interface compilada. |
| `client` | `@corte-cloud/client` | Interface em React + Vite. Chama o parser no próprio navegador, guarda o estado num reducer e chama o servidor só para foto e PDF. |
| `deploy` | — | Instalador e início automático das lojas (Windows) e o script de atualização do servidor (Linux). |

Em produção é **um processo só**: o Express escuta na porta `5175`, serve
`client/dist` e a API. Não há banco de dados. Nada do que o vendedor envia fica
guardado: a foto ou a página do PDF vira um arquivo temporário só durante a
leitura e é apagada em seguida.

### Leitura de foto e PDF

- **Foto:** Tesseract local primeiro. Se ele falhar ou ler menos de
  `OCR_MIN_USEFUL_CHARS` caracteres, tenta o OCR.space, que só existe com
  `OCR_SPACE_API_KEY`. Letra de mão quase sempre depende do OCR.space.
- **PDF:** usa o texto do próprio PDF quando existe (Modelar, SCM CutPlan) e só
  cai no OCR nas páginas que são imagem.
- **Formatos de foto:** PNG, JPEG, WebP, TIFF, BMP e GIF. HEIC (padrão da
  câmera do iPhone) não é lido por nenhum dos dois leitores.

### Rotas do servidor

| Rota | Para quê |
|---|---|
| `POST /api/ocr` | lê uma foto |
| `POST /api/pdf` | lê um PDF |
| `GET /api/version` | commit instalado; é o que o healthcheck do Docker consulta |
| `GET /api/logs` | registro das últimas leituras, mostrado na aba **Log** |
| `GET /api/update/check`, `POST /api/update/apply` | botão "Atualizar agora" das lojas; só responde a `localhost` |

O registro da aba Log (`server/src/services/event-log.ts`) fica na memória,
guarda só metadados e zera quando o processo reinicia. Ao mexer na leitura,
registre ali o motivo de cada falha: a mensagem que o vendedor vê é genérica de
propósito.

### Configuração

Tudo por variável de ambiente, lida em `server/src/config/index.ts`. Os exemplos
comentados estão em `server/.env.example` (lojas) e `deploy/docker.env.example`
(Docker). Nenhum `.env` vai para o git.

## Comandos

Na raiz, com Node 22:

```bash
npm install
npm run dev     # servidor em :5175 e interface em :5173, com recarga automática
npm run build   # compila parser, servidor e interface
npm test        # Vitest nos três pacotes
npm run lint    # ESLint no monorepo
npm run serve   # compila e roda tudo num processo só, como em produção
```

Antes de abrir um PR, rode `npm run build && npm test && npm run lint`. Mudança
na leitura de texto, foto ou PDF vem com teste, de preferência com o caso real
que motivou a mudança.

## CI

`.github/workflows/ci.yml` roda em todo pull request (inclusive os de `main`
para `production`) e em todo push para `main`: `npm ci`, `npm run build`,
`npm test`, `npm run lint`. Um PR só entra com o CI verde. PR vindo de fork espera a liberação de quem tem acesso de
escrita antes de rodar.

O CI não faz deploy. Quem publica são as próprias instalações, que buscam o
código novo no GitHub.

## Branches e deploy

São dois destinos, cada um seguindo uma branch.

| Destino | Branch | Como atualiza |
|---|---|---|
| Lojas (Windows, uma instalação por PC) | `main` | O sistema compara o commit instalado com o da `main` e mostra o botão **Atualizar agora** (`server/src/services/update/`). |
| Servidor (Docker, Linux) | `production` | O servidor consulta o GitHub de hora em hora e, se a `production` mudou, reconstrói a imagem (`deploy/atualizar-servidor.sh`). |

Consequência que precisa estar na cabeça: **o que entra na `main` chega às
lojas** assim que o vendedor clicar em atualizar. A `main` não é rascunho.

### Publicar no servidor

1. O trabalho entra na `main` por PR, com CI verde.
2. Abre-se um PR de `main` para `production`.
3. Depois do merge, o servidor atualiza sozinho em até uma hora.

O servidor é quem pergunta ao GitHub: não existe webhook nem porta aberta para
isso. Para não esperar, quem opera o servidor roda na pasta do projeto:

```bash
deploy/atualizar-servidor.sh            # só age se houver commit novo
deploy/atualizar-servidor.sh --forcar   # reconstrói mesmo sem commit novo
```

Se a imagem nova não compilar, o container antigo continua no ar e o script
sai com erro. O container tem `restart: unless-stopped`: volta sozinho quando o
servidor reinicia.

O servidor da Araújo atende em `https://vts-gerador-list.araujomad.cloud`,
atrás de um proxy com HTTPS (`docker-compose.proxy.yml`) e com senha
(`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`). Os detalhes de Docker estão em
[`deploy/LEIA-ME-DOCKER.md`](deploy/LEIA-ME-DOCKER.md) e os das lojas em
[`deploy/LEIA-ME.md`](deploy/LEIA-ME.md).

### Cuidados

- Arquivos `.bat` precisam de CRLF e os de Docker e `.sh` de LF. O
  `.gitattributes` já força isso; não mexa nele sem motivo.
- A porta `5175` do container nunca fica aberta para a internet: no Linux o
  Docker passa por cima do firewall (`ufw`).
- Sem cadastro de usuários: num endereço público, a senha HTTP Basic é
  obrigatória.
- Segredo (senha, chave do OCR.space) não entra em commit, PR, issue nem log.

## Git

- **Conventional Commits**, com a descrição em português:
  `feat(pdf): lê o relatório do SCM CutPlan`. Tipos: `feat`, `fix`, `docs`,
  `test`, `refactor`, `chore`, `ci`. O escopo é a área (`parser`, `pdf`, `ocr`,
  `client`, `docker`, `deploy`).
- **Uma linha só**, com no máximo 120 caracteres. O porquê e os detalhes vão na
  descrição do PR.
- Um assunto por commit e por PR.
- Commit em nome de quem fez. Sem `Co-Authored-By`, sem assinatura ou link de
  ferramenta de IA em commit, PR, issue ou comentário.
- Nunca `push --force` na `main` nem na `production`.
- Branch a partir da `main` atualizada, e sempre por PR.
