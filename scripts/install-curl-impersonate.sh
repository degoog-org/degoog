#!/bin/sh
set -eu

VERSION=1.2.2
INSTALL_DIR="${CURL_IMPERSONATE_INSTALL_DIR:-/usr/local/bin}"

if [ -n "${CURL_IMPERSONATE_LIBC:-}" ]; then
  LIBC="$CURL_IMPERSONATE_LIBC"
elif [ -f /etc/alpine-release ]; then
  LIBC=musl
else
  LIBC=gnu
fi

arch="${TARGETARCH:-}"
if [ -z "$arch" ]; then
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *)
      echo "unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
fi

case "$arch" in
  amd64) asset_arch=x86_64 ;;
  arm64) asset_arch=aarch64 ;;
  *)
    echo "unsupported TARGETARCH: $arch" >&2
    exit 1
    ;;
esac

asset="curl-impersonate-v${VERSION}.${asset_arch}-linux-${LIBC}.tar.gz"
url="https://github.com/lexiforest/curl-impersonate/releases/download/v${VERSION}/${asset}"

mkdir -p "$INSTALL_DIR"
curl -fsSL "$url" | tar -xz -C "$INSTALL_DIR"
