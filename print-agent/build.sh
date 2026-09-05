#!/usr/bin/env sh
# Cross-compile the agent for every machine a restaurant is likely to have.
# Output lands in dist/. Publish those files wherever NEXT_PUBLIC_PRINT_AGENT_URL points.
set -e
cd "$(dirname "$0")"
mkdir -p dist
build() {
  out="dist/kuik-print-agent-$1-$2$3"
  echo "→ $out"
  CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -trimpath -ldflags="-s -w" -o "$out" .
}
build windows amd64 .exe
build darwin  arm64
build darwin  amd64
build linux   amd64
build linux   arm64   # Raspberry Pi 4/5, 64-bit OS
build linux   arm     # older Pi, 32-bit OS
