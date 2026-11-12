# syntax=docker/dockerfile:1.7
# Platform-matched VHS golden renderer.
#
# Goldens MUST be produced on linux/amd64 with the same font + tool pins that
# GitHub Actions ubuntu-latest uses. Rendering on macOS (or arm64 Linux) makes
# SSIM comparisons fail on font rasterization alone.
#
# Build:
#   docker build --platform linux/amd64 -f scripts/ci/Dockerfile.vhs \
#     -t coding-buddy-vhs:local scripts/ci
#
# Run (prefer scripts/ci/render-vhs-goldens.sh, which wraps this image):
#   docker run --rm --platform linux/amd64 \
#     -v "$PWD":/work -w /work coding-buddy-vhs:local \
#     bash scripts/ci/render-vhs-goldens.sh --native [--update]

FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    COLORTERM=truecolor \
    CI=

# Pin exact Ubuntu 24.04 (noble) package versions so runner image drift does
# not silently re-rasterize glyphs. Bump deliberately when re-baselining.
#
# Includes Chromium shared libs for vhs/rod headless browser, plus the fonts
# used by the tapes (DejaVu mono + Noto CJK/emoji).
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
      ca-certificates=20260601~24.04.1 \
      curl=8.5.0-2ubuntu10.11 \
      xz-utils=5.6.1+really5.4.5-1ubuntu0.3 \
      unzip=6.0-28ubuntu4.1 \
      jq=1.7.1-3ubuntu0.24.04.2 \
      python3=3.12.3-0ubuntu2.1 \
      ffmpeg=7:6.1.1-3ubuntu5 \
      ttyd=1.7.4-1build2 \
      fonts-dejavu-core=2.37-8 \
      fonts-noto-core=20201225-2 \
      fonts-noto-mono=20201225-2 \
      fonts-noto-color-emoji=2.047-0ubuntu0.24.04.1 \
      fonts-noto-cjk=1:20230817+repack1-3 \
      fonts-liberation=1:2.1.5-3 \
      fontconfig=2.15.0-1.1ubuntu2 \
      findutils=4.9.0-5build1 \
      bash=5.2.21-2ubuntu4 \
      libnss3=2:3.98-1ubuntu0.2 \
      libnspr4=2:4.35-1.1build1 \
      libatk1.0-0t64=2.52.0-1build1 \
      libatk-bridge2.0-0t64=2.52.0-1build1 \
      libatspi2.0-0t64=2.52.0-1build1 \
      libcups2t64=2.4.7-1.2ubuntu7.14 \
      libdrm2=2.4.125-1ubuntu0.1~24.04.2 \
      libxkbcommon0=1.6.0-1build1 \
      libxcomposite1=1:0.4.5-1build3 \
      libxdamage1=1:1.1.6-1build1 \
      libxfixes3=1:6.0.0-2build1 \
      libxrandr2=2:1.5.2-2build1 \
      libgbm1=25.2.8-0ubuntu0.24.04.2 \
      libasound2t64=1.2.11-1ubuntu0.3 \
      libpango-1.0-0=1.52.1+ds-1build1 \
      libcairo2=1.18.0-3build1 \
      libxshmfence1=1.3-1build5 \
      libglib2.0-0t64=2.80.0-6ubuntu3.8 \
      libgtk-3-0t64=3.24.41-4ubuntu1.3 \
      libx11-6=2:1.8.7-1build1 \
      libx11-xcb1=2:1.8.7-1build1 \
      libxcb1=1.15-1ubuntu2 \
      libxext6=2:1.3.4-1build2 \
      libxi6=2:1.8.1-1build1 \
 && rm -rf /var/lib/apt/lists/*

# Pin vhs binary.
ARG VHS_VERSION=0.11.0
RUN bash -lc "set -euo pipefail \
  && TMP=\$(mktemp -d) \
  && BASE=https://github.com/charmbracelet/vhs/releases/download/v${VHS_VERSION} \
  && curl -fsSL -o \"\$TMP/vhs.tgz\" \"\${BASE}/vhs_${VHS_VERSION}_Linux_x86_64.tar.gz\" \
  && tar -xzf \"\$TMP/vhs.tgz\" -C \"\$TMP\" \
  && BIN=\$(find \"\$TMP\" -type f -name vhs | head -n1) \
  && install -m 755 \"\$BIN\" /usr/local/bin/vhs \
  && rm -rf \"\$TMP\" \
  && vhs --version"

# Bun (baseline build — OrbStack/QEMU amd64 often lacks AVX).
# Install system-wide so non-root `docker run --user` still finds it.
ARG BUN_VERSION=1.3.9
RUN bash -lc "set -euo pipefail \
  && TMP=\$(mktemp -d) \
  && curl -fsSL -o \"\$TMP/bun.zip\" \
       \"https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64-baseline.zip\" \
  && unzip -q \"\$TMP/bun.zip\" -d \"\$TMP\" \
  && install -m 755 \"\$TMP/bun-linux-x64-baseline/bun\" /usr/local/bin/bun \
  && rm -rf \"\$TMP\" \
  && bun --version"

COPY fonts.conf /etc/fonts/conf.d/99-coding-buddy-vhs.conf
RUN fc-cache -f \
 && fc-match "DejaVu Sans Mono" \
 && fc-match "Noto Color Emoji" \
 && fc-match "Noto Sans CJK SC"

# Chromium refuses to start as root without --no-sandbox. Prefer the stock
# ubuntu user (uid 1000 on noble) when present; otherwise create vhs:1000.
RUN if id -u ubuntu >/dev/null 2>&1; then \
      usermod -l vhs ubuntu; \
      groupmod -n vhs ubuntu; \
      mv /home/ubuntu /home/vhs; \
      usermod -d /home/vhs -s /bin/bash vhs; \
    else \
      useradd --create-home --uid 1000 --shell /bin/bash vhs; \
    fi \
 && mkdir -p /home/vhs/.cache /home/vhs/.config \
 && chown -R 1000:1000 /home/vhs

ENV HOME=/home/vhs \
    XDG_CACHE_HOME=/home/vhs/.cache \
    XDG_CONFIG_HOME=/home/vhs/.config

WORKDIR /work
USER vhs
ENTRYPOINT []
CMD ["bash", "scripts/ci/render-vhs-goldens.sh", "--native"]
