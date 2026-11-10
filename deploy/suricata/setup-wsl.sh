#!/usr/bin/env bash
# Menyiapkan Suricata untuk lab NEXA di distro WSL/Debian TANPA root dan TANPA memasang
# apa pun ke sistem: paket resmi diunduh (apt-get download) dan diekstrak ke
# ~/nexa-suricata/root. Dipakai bila Docker tidak tersedia.
#
#   bash deploy/suricata/setup-wsl.sh            (jalankan di dalam WSL)
set -euo pipefail

HOME_DIR="${NEXA_SURICATA_HOME:-$HOME/nexa-suricata}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HOME_DIR/debs" "$HOME_DIR/root"
cd "$HOME_DIR/debs"

echo "[setup] mengunduh paket suricata + dependensi (apt-get download, tanpa root)"
apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks \
  --no-replaces --no-enhances suricata 2>/dev/null | grep -E '^[a-z0-9]' | sort -u > closure.txt
PKGS="suricata libhwloc15 libevent-2.1-7t64 libevent-core-2.1-7t64 libevent-pthreads-2.1-7t64 \
libhiredis1.1.0 libunwind8 libxdp1 libbpf1 libnet9 libnetfilter-log1 libnetfilter-queue1 \
libnfnetlink0 libmnl0 libhyperscan5 libnuma1 libfdt1 libmaxminddb0 libjansson4 libxxhash0 \
libelf1t64 libpcap0.8t64 libyaml-0-2 libmagic1t64 libmagic-mgc liblz4-1 libcap-ng0"
PKGS="$PKGS $(grep '^librte' closure.txt | tr '\n' ' ')"
for p in $PKGS; do
  apt-get download "$p" >/dev/null 2>&1 || echo "[setup] lewati (tidak tersedia): $p"
done
for d in *.deb; do dpkg-deb -x "$d" "$HOME_DIR/root"; done

LIBS="$HOME_DIR/root/usr/lib/x86_64-linux-gnu:$HOME_DIR/root/lib/x86_64-linux-gnu"
for extra in "$HOME_DIR"/root/usr/lib/x86_64-linux-gnu/dpdk/pmds-*; do
  [ -d "$extra" ] && LIBS="$LIBS:$extra"
done
echo "$LIBS" > "$HOME_DIR/ld_library_path"

sed 's/\r$//' "$HERE/nexa-suricata.sh" > "$HOME_DIR/nexa-suricata.sh"
chmod +x "$HOME_DIR/nexa-suricata.sh"

export LD_LIBRARY_PATH="$LIBS"
if ldd "$HOME_DIR/root/usr/bin/suricata" | grep -q "not found"; then
  echo "[setup] pustaka masih kurang:"; ldd "$HOME_DIR/root/usr/bin/suricata" | grep "not found"
  exit 1
fi
"$HOME_DIR/root/usr/bin/suricata" -V
"$HOME_DIR/nexa-suricata.sh" start
echo "[setup] selesai. Set di .env sensor:"
echo "  SURICATA_RUNNER=exec"
echo "  SURICATA_EXEC=wsl.exe -d <distro> -- bash $HOME_DIR/nexa-suricata.sh"
