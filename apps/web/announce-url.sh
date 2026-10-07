#!/bin/sh
set -eu

port="${WEB_PORT:-8080}"
green=$(printf '\033[1;32m')
bold=$(printf '\033[1m')
reset=$(printf '\033[0m')

cat <<EOF

${green}  ╔══════════════════════════════════════════════════════════════╗
  ║   APLICAÇÃO NO AR                                            ║
  ╚══════════════════════════════════════════════════════════════╝${reset}
${bold}    Acesse:  ${green}http://localhost:${port}${reset}

EOF
