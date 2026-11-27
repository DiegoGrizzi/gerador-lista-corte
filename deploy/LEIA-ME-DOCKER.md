# Rodando em Docker (Linux)

O sistema roda num único container: o servidor Node (Express) serve a
interface já compilada e a API de leitura de foto/PDF. Tudo que precisa ser
instalado (Node 22 e o Tesseract em português) já vem dentro da imagem — no
servidor só precisa de **Docker** e **Docker Compose**.

Não usa nada dos arquivos `.bat`/`.ps1`/`.vbs` da pasta `deploy/`: eles são só
do instalador e do início automático do Windows. O código do sistema em si
(TypeScript/Node) é o mesmo e não muda de linguagem.

## Subir

```bash
git clone https://github.com/DiegoGrizzi/gerador-lista-corte.git
cd gerador-lista-corte
docker compose up -d --build
```

Abre em `http://localhost:5175` (ou `http://<endereço-do-servidor>:5175`).

## Configuração (opcional)

Crie um arquivo `.env` ao lado do `docker-compose.yml` (ele não vai para o
GitHub). O exemplo está em `deploy/docker.env.example`:

| Variável | Para que serve | Padrão |
|---|---|---|
| `GERADOR_PORT` | porta de fora (do servidor); dentro do container é sempre 5175 | `5175` |
| `OCR_SPACE_API_KEY` | reserva de leitura de foto quando o Tesseract falhar | vazio (desligado) |
| `CLIENT_ORIGIN` | endereço da interface, para o CORS | `http://localhost:5175` |

## Dia a dia

```bash
docker compose logs -f        # acompanhar o log
docker compose ps             # ver se está "healthy"
docker compose down           # desligar
docker compose restart        # reiniciar
```

O container reinicia sozinho se cair ou se o servidor reiniciar
(`restart: unless-stopped`).

## Atualizar

O botão **"Atualizar agora"** do sistema fica desligado no container
(`AUTO_UPDATE_ENABLED=false`): ele roda git e reinicia o processo, o que não
existe dentro de uma imagem. Para atualizar:

```bash
git pull
docker compose up -d --build
```

O rodapé do sistema não mostra o código da versão no container (a imagem não
tem o git). Para saber a versão, use `git log -1` na pasta do projeto.

## Observações

- **Segurança:** o sistema não tem login. Em servidor, deixe-o atrás da rede da
  empresa ou de um proxy com autenticação; não exponha a porta direto na
  internet.
- **Foto e PDF:** a leitura usa o Tesseract da imagem e, se houver chave, o
  OCR.space como reserva. Um PDF de várias páginas pode levar de 30 segundos a
  alguns minutos, conforme o servidor.
- **Instalação das lojas (Windows):** não muda. Cada PC continua com o
  instalador e o botão "Atualizar agora".
