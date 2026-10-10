#!/bin/sh
# Rebuilds cubiomes.wasm: the biome and structure generator (xpple's fork of cubiomes, github.com/xpple/cubiomes,
# itself from github.com/Cubitect/cubiomes; MIT licence,
# see CUBIOMES-LICENSE) compiled for the browser, used by the travel map's biome layer.
# Needs clang and wasm-ld. The result is committed, so the site's build doesn't need them.
set -e
cd "$(dirname "$0")"
COMMIT=4f04235f3e6e25491a02a830e4f500f68045be17
REPO=https://github.com/xpple/cubiomes
[ "$(git -C cubiomes remote get-url origin 2>/dev/null)" = "$REPO" ] || { rm -rf cubiomes; git clone -q "$REPO" cubiomes; }
git -C cubiomes checkout -q $COMMIT
clang --target=wasm32 -O3 -nostdlib -ffreestanding -isystem inc -I. -Wno-everything \
  -Wl,--no-entry -Wl,-z,stack-size=1048576 -Wl,--initial-memory=8388608 -Wl,--gc-sections \
  -o cubiomes.wasm cubiomes/generator.c cubiomes/layers.c cubiomes/biomenoise.c cubiomes/noise.c \
  cubiomes/biomes.c cubiomes/finders.c shim.c api.c
echo "Built cubiomes.wasm ($(wc -c < cubiomes.wasm) bytes)"
