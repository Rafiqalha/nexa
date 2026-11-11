#!/bin/sh
# Railway memasang volume sebagai root. Siapkan folder data milik user `node`, lalu jalankan
# sensor (dan Suricata yang dipanggilnya) sebagai `node`, bukan root.
set -eu
DATA_DIR="${NEXA_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/rules" "$DATA_DIR/suricata"
chown -R node:node "$DATA_DIR"
exec setpriv --reuid=node --regid=node --init-groups -- "$@"
