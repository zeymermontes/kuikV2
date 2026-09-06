#!/usr/bin/env sh
# Compile the print agent (Go, ../../print-agent) for every desktop platform
# and drop the binaries in agent/, where main.js and electron-builder look.
set -e
cd "$(dirname "$0")/.."
mkdir -p agent
( cd ../../print-agent && ./build.sh )
cp ../../print-agent/dist/kuik-print-agent-* agent/
chmod +x agent/kuik-print-agent-*
ls -la agent
