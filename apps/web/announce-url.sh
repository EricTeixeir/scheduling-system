#!/bin/sh
set -eu

port="${WEB_PORT:-8080}"

cat <<EOF

  Aplicação no ar
    Neste computador:  http://localhost:${port}
    Celular na mesma rede Wi-Fi:  http://<IP-deste-computador>:${port}
      (o IP aparece em "ipconfig" no Windows ou "ip addr" no Linux/macOS)

EOF
