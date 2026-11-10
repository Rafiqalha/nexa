#!/usr/bin/env bash
# Wrapper Suricata untuk NEXA. Dipanggil sensor lewat runner `exec` (lokal/WSL) atau sidecar
# kontrol (Docker). Rule SELALU dibaca dari stdin, tidak pernah dari argumen (tanpa injeksi).
#
#   nexa-suricata.sh validate   < rules   -> suricata -T terhadap rule kandidat (exit 0 = valid)
#   nexa-suricata.sh deploy     < rules   -> ganti nexa.rules lalu reload engine (start bila perlu)
#   nexa-suricata.sh start                -> jalankan engine (mode unix-socket, tanpa capture/root)
#   nexa-suricata.sh stop | status
set -euo pipefail

NEXA_SURICATA_HOME="${NEXA_SURICATA_HOME:-$HOME/nexa-suricata}"
if [ -x "$NEXA_SURICATA_HOME/root/usr/bin/suricata" ]; then
  # Paket Suricata hasil ekstraksi tanpa root (lihat setup-wsl.sh).
  ROOT="$NEXA_SURICATA_HOME/root"
  BIN="$ROOT/usr/bin/suricata"
  SC="$ROOT/usr/bin/suricatasc"
  ETC="$ROOT/etc/suricata"
  export LD_LIBRARY_PATH="$(cat "$NEXA_SURICATA_HOME/ld_library_path")"
else
  BIN="$(command -v suricata)"
  SC="$(command -v suricatasc)"
  ETC="${SURICATA_ETC:-/etc/suricata}"
fi

RULES_DIR="$NEXA_SURICATA_HOME/rules"
RUN_DIR="$NEXA_SURICATA_HOME/run"
LOG_DIR="$NEXA_SURICATA_HOME/log"
CACHE_DIR="$NEXA_SURICATA_HOME/cache"
CONF="$NEXA_SURICATA_HOME/nexa-suricata.yaml"
SOCK="$RUN_DIR/suricata.socket"
PIDFILE="$RUN_DIR/suricata.pid"

ensure_layout() {
  mkdir -p "$RULES_DIR" "$RUN_DIR" "$LOG_DIR" "$CACHE_DIR"
  [ -f "$RULES_DIR/nexa.rules" ] || : > "$RULES_DIR/nexa.rules"
  # Path rule ada di file YAML (bukan -S/--set) agar `reload-rules` membaca file yang sama.
  cat > "$CONF" <<YAML
%YAML 1.1
---
include: $ETC/suricata.yaml
default-rule-path: $RULES_DIR
rule-files:
  - nexa.rules
classification-file: $ETC/classification.config
reference-config-file: $ETC/reference.config
threshold-file: $ETC/threshold.config
sgh-mpm-caching-path: $CACHE_DIR
YAML
}

running() {
  [ -S "$SOCK" ] && "$SC" -c "version" "$SOCK" >/dev/null 2>&1
}

cmd_start() {
  ensure_layout
  if running; then echo "engine sudah berjalan"; return 0; fi
  rm -f "$SOCK" "$PIDFILE"
  "$BIN" -c "$CONF" -l "$LOG_DIR" --unix-socket="$SOCK" --pidfile "$PIDFILE" -D >"$LOG_DIR/start.out" 2>&1
  for _ in $(seq 1 30); do
    if running; then echo "engine berjalan"; return 0; fi
    sleep 0.5
  done
  echo "engine gagal start"; tail -n 20 "$LOG_DIR/start.out" || true
  return 1
}

cmd_validate() {
  ensure_layout
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  cat > "$tmp/candidate.rules"
  if "$BIN" -T -c "$CONF" -l "$tmp" -S "$tmp/candidate.rules" >"$tmp/out" 2>&1; then
    grep -E "^(E|W):|successfully" "$tmp/out" || true
    return 0
  fi
  grep -E "^(E|W):|error" "$tmp/out" | tail -n 8 || tail -n 8 "$tmp/out"
  return 1
}

cmd_deploy() {
  ensure_layout
  local tmp="$RULES_DIR/.nexa.rules.tmp"
  cat > "$tmp"
  # Validasi set lengkap dulu; set yang rusak tidak pernah menggantikan rule aktif.
  if ! "$BIN" -T -c "$CONF" -l "$LOG_DIR" -S "$tmp" >"$LOG_DIR/deploy-test.out" 2>&1; then
    rm -f "$tmp"
    echo "set rule tidak valid, deploy dibatalkan"; grep -E "^E:" "$LOG_DIR/deploy-test.out" | tail -n 5
    return 1
  fi
  mv "$tmp" "$RULES_DIR/nexa.rules"
  if ! running; then cmd_start; fi
  local out
  out="$("$SC" -c "reload-rules" "$SOCK")"
  echo "$out"
  echo "$out" | grep -q '"return":"OK"' || return 1
  "$SC" -c "ruleset-stats" "$SOCK"
}

cmd_stop() {
  if running; then "$SC" -c "shutdown" "$SOCK"; fi
}

cmd_status() {
  if running; then "$SC" -c "ruleset-stats" "$SOCK"; else echo "engine tidak berjalan"; return 1; fi
}

case "${1:-}" in
  validate) cmd_validate ;;
  deploy) cmd_deploy ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *) echo "pakai: $0 validate|deploy|start|stop|status" >&2; exit 2 ;;
esac
