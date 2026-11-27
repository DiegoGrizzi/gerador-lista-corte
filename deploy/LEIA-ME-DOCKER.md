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

Abre em `http://localhost:5175`, no próprio computador. A porta fica fechada
para o resto da rede por padrão; para abrir, veja `GERADOR_BIND` abaixo.

## Configuração (opcional)

Crie um arquivo `.env` ao lado do `docker-compose.yml` (ele não vai para o
GitHub). O exemplo está em `deploy/docker.env.example`:

| Variável | Para que serve | Padrão |
|---|---|---|
| `GERADOR_PORT` | porta de fora (do servidor); dentro do container é sempre 5175 | `5175` |
| `OCR_SPACE_API_KEY` | reserva de leitura de foto quando o Tesseract falhar | vazio (desligado) |
| `GERADOR_BIND` | quem alcança a porta: `127.0.0.1` (só o próprio computador) ou `0.0.0.0` (a rede toda) | `127.0.0.1` |
| `CLIENT_ORIGIN` | endereço da interface, para o CORS | `http://localhost:5175` |
| `BASIC_AUTH_USER` e `BASIC_AUTH_PASSWORD` | usuário e senha para abrir o sistema; os dois juntos | vazios (abre direto) |

Funciona igual no Linux e no Docker Desktop do Windows ou do Mac.

## Num domínio, atrás de um proxy

Para publicar num endereço como `https://gerador.exemplo.com.br`, num servidor
que já tem um proxy com HTTPS rodando em Docker (Caddy, Traefik, nginx), use
também o `docker-compose.proxy.yml`. O container deixa de abrir porta no
servidor e entra na rede Docker do proxy, que o encontra como
`gerador-lista-corte:5175`.

No `.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml
PROXY_NETWORK=nome-da-rede-do-proxy
CLIENT_ORIGIN=https://gerador.exemplo.com.br
BASIC_AUTH_USER=loja
BASIC_AUTH_PASSWORD=uma-senha-longa
```

No proxy (exemplo em Caddy):

```
gerador.exemplo.com.br {
	reverse_proxy gerador-lista-corte:5175
}
```

Depois é o mesmo `docker compose up -d --build`. O `docker-compose.proxy.yml`
também limita CPU e memória do container (`GERADOR_CPUS`, `GERADOR_MEMORY`).

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

- **Segurança:** o sistema não tem cadastro de usuários. Num endereço público,
  defina `BASIC_AUTH_USER` e `BASIC_AUTH_PASSWORD` e deixe-o atrás de um proxy
  com HTTPS (a senha trafega em cada requisição); nunca abra a porta 5175
  direto na internet.
- **Foto e PDF:** a leitura usa o Tesseract da imagem e, se houver chave, o
  OCR.space como reserva. Um PDF de várias páginas pode levar de 30 segundos a
  alguns minutos, conforme o servidor.
- **Instalação das lojas (Windows):** não muda. Cada PC continua com o
  instalador e o botão "Atualizar agora".
