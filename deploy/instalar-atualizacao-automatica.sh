#!/usr/bin/env bash
# Agenda a atualização automática do servidor em Docker: de poucos em poucos
# minutos, o cron do usuário roda deploy/atualizar-servidor.sh, que só age
# quando a branch de produção do GitHub mudou.
#
#   deploy/instalar-atualizacao-automatica.sh             # a cada 5 minutos
#   deploy/instalar-atualizacao-automatica.sh 10          # a cada 10 minutos
#   deploy/instalar-atualizacao-automatica.sh --status    # mostra o que está agendado
#   deploy/instalar-atualizacao-automatica.sh --remover   # tira o agendamento
#
# Não precisa de sudo nem de nenhuma ferramenta além do cron, que já vem no
# Ubuntu e no Debian. Rodar de novo só troca o intervalo: nunca duplica a
# linha nem mexe no resto do crontab. O que cada execução fez fica em
# deploy/atualizacao.log.
set -euo pipefail

MARKER="# gerador-lista-corte: atualizacao automatica"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/deploy/atualizacao.log"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERRO: o cron não está instalado neste servidor (comando 'crontab' não encontrado)." >&2
  exit 1
fi

# Lê o crontab inteiro ANTES de qualquer gravação: ler e gravar no mesmo
# encadeamento pode apagar as linhas dos outros agendamentos do usuário.
CURRENT="$(crontab -l 2>/dev/null || true)"
OTHERS="$(printf '%s\n' "$CURRENT" | grep -vF "$MARKER" || true)"

install_crontab() {
  # $1 = linha nossa (vazia para remover). Linhas em branco do começo saem.
  printf '%s\n%s\n' "$OTHERS" "$1" | sed '/./,$!d' | crontab -
}

case "${1:-}" in
  --status)
    line="$(printf '%s\n' "$CURRENT" | grep -F "$MARKER" || true)"
    if [[ -n "$line" ]]; then
      echo "Agendado: $line"
      [[ -f "$LOG_FILE" ]] && { echo "Últimas execuções:"; tail -n 5 "$LOG_FILE"; }
    else
      echo "Não está agendado."
    fi
    exit 0
    ;;
  --remover)
    install_crontab ""
    echo "Atualização automática removida."
    exit 0
    ;;
esac

MINUTES="${1:-5}"
if ! [[ "$MINUTES" =~ ^[0-9]+$ ]] || ((MINUTES < 1 || MINUTES > 59)); then
  echo "ERRO: o intervalo é em minutos, de 1 a 59 (recebi '$MINUTES')." >&2
  exit 1
fi

# O cron roda com um PATH mínimo: declara onde ficam o git e o docker.
JOB="*/$MINUTES * * * * cd '$PROJECT_DIR' && PATH=/usr/local/bin:/usr/bin:/bin deploy/atualizar-servidor.sh >> '$LOG_FILE' 2>&1 $MARKER"

install_crontab "$JOB"

echo "Atualização automática agendada a cada $MINUTES minuto(s)."
echo "Acompanhe em: $LOG_FILE"
