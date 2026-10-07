#!/bin/sh
set -eu

port="${WEB_PORT:-8080}"
green=$(printf '\033[1;32m')
bold=$(printf '\033[1m')
dim=$(printf '\033[2m')
reset=$(printf '\033[0m')

cat <<EOF

${green}  ╔══════════════════════════════════════════════════════════════╗
  ║   APLICAÇÃO NO AR                                            ║
  ╚══════════════════════════════════════════════════════════════╝${reset}
${bold}    Neste computador:              ${green}http://localhost:${port}${reset}
${bold}    Celular na mesma rede Wi-Fi:   ${green}http://<IP-deste-computador>:${port}${reset}
${dim}      O IP aparece em "ipconfig" (Windows) ou "ip addr" (Linux/macOS).${reset}

EOF
