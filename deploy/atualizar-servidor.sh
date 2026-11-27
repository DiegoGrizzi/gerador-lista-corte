#!/usr/bin/env bash
# Atualiza a instalação em Docker (servidor Linux) para o que está na branch
# de produção do GitHub. Feito para rodar sozinho, de poucos em poucos minutos,
# pelo cron do servidor (deploy/instalar-atualizacao-automatica.sh agenda): é o
# servidor que pergunta ao GitHub se há novidade, então não precisa de webhook
# nem de porta aberta.
#
#   deploy/atualizar-servidor.sh            # só age se houver commit novo
#   deploy/atualizar-servidor.sh --forcar   # reconstrói mesmo sem commit novo
#
# Sem novidade, sai em um segundo sem tocar em nada. Se a imagem nova não
# compilar, o container antigo continua no ar. Veja AGENTS.md, seção "Deploy".
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-production}"
CONTAINER="gerador-lista-corte"
HEALTH_TIMEOUT_SECONDS=180

cd "$(dirname "$0")/.."

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# O agendamento (deploy/instalar-atualizacao-automatica.sh) escreve a saída
# deste script em deploy/atualizacao.log a cada poucos minutos: mantém só as
# linhas mais recentes para o arquivo não crescer para sempre.
LOG_FILE="deploy/atualizacao.log"
MAX_LOG_LINES=2000
if [[ -f "$LOG_FILE" ]] && (($(wc -l <"$LOG_FILE") > MAX_LOG_LINES)); then
  tail -n $((MAX_LOG_LINES / 2)) "$LOG_FILE" >"$LOG_FILE.tmp" && cat "$LOG_FILE.tmp" >"$LOG_FILE" && rm -f "$LOG_FILE.tmp"
fi

# Um deploy por vez: a construção da imagem leva minutos e o agendador pode
# disparar de novo antes de ela terminar.
exec 9>.deploy.lock
if ! flock -n 9; then
  log "Outro deploy em andamento; nada a fazer."
  exit 0
fi

git fetch --quiet origin "$BRANCH"
current="$(git rev-parse HEAD)"
target="$(git rev-parse "origin/$BRANCH")"
running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)"

if [[ "$current" == "$target" && "$running" == "true" && "${1:-}" != "--forcar" ]]; then
  log "Sem novidade em $BRANCH (${current:0:7})."
  exit 0
fi

log "Atualizando de ${current:0:7} para ${target:0:7} ($BRANCH)."
# O servidor fica exatamente igual à branch; o .env não é do git e não muda.
git checkout --quiet -B "$BRANCH" "origin/$BRANCH"
docker compose up -d --build

for ((waited = 0; waited < HEALTH_TIMEOUT_SECONDS; waited += 5)); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo desconhecido)"
  if [[ "$status" == "healthy" ]]; then
    log "No ar: ${target:0:7}."
    exit 0
  fi
  sleep 5
done

log "ERRO: o container não ficou saudável em ${HEALTH_TIMEOUT_SECONDS}s (estado: $status)."
docker compose logs --tail 30 || true
exit 1
