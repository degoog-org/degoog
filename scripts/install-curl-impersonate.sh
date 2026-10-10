#!/bin/sh
set -eu

VERSION=1.2.2
INSTALL_DIR="${CURL_IMPERSONATE_INSTALL_DIR:-/usr/local/bin}"
LIB_DIR="${CURL_IMPERSONATE_LIB_DIR:-/usr/local/lib}"
RELEASE="https://github.com/lexiforest/curl-impersonate/releases/download/v${VERSION}"

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

if [ "$(uname -s)" = "Darwin" ]; then
  case "$arch" in
    amd64) platform="x86_64-macos" ;;
    arm64) platform="arm64-macos" ;;
    *)
      echo "unsupported TARGETARCH: $arch" >&2
      exit 1
      ;;
  esac
else
  if [ -n "${CURL_IMPERSONATE_LIBC:-}" ]; then
    LIBC="$CURL_IMPERSONATE_LIBC"
  elif [ -f /etc/alpine-release ]; then
    LIBC=musl
  else
    LIBC=gnu
  fi
  case "$arch" in
    amd64) platform="x86_64-linux-${LIBC}" ;;
    arm64) platform="aarch64-linux-${LIBC}" ;;
    *)
      echo "unsupported TARGETARCH: $arch" >&2
      exit 1
      ;;
  esac
fi

mkdir -p "$INSTALL_DIR"
curl -fsSL "${RELEASE}/curl-impersonate-v${VERSION}.${platform}.tar.gz" | tar -xz -C "$INSTALL_DIR"

if [ "${CURL_IMPERSONATE_SKIP_LIB:-}" = "1" ]; then
  exit 0
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
curl -fsSL "${RELEASE}/libcurl-impersonate-v${VERSION}.${platform}.tar.gz" | tar -xz -C "$staging"
mkdir -p "$LIB_DIR"
for file in "$staging"/libcurl-impersonate*.so* "$staging"/libcurl-impersonate*.dylib; do
  [ -e "$file" ] || [ -L "$file" ] || continue
  cp -P "$file" "$LIB_DIR/"
done
