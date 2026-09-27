#!/bin/sh
# Rebuilds cubiomes.wasm: the biome and structure generator (github.com/Cubitect/cubiomes, MIT licence,
# see CUBIOMES-LICENSE) compiled for the browser, used by the travel map's biome layer.
# Needs clang and wasm-ld. The result is committed, so the site's build doesn't need them.
set -e
cd "$(dirname "$0")"
COMMIT=e61f90580cbdd883214a8054670dacae655e59c0
[ -d cubiomes ] || git clone -q https://github.com/Cubitect/cubiomes cubiomes
git -C cubiomes checkout -q $COMMIT
clang --target=wasm32 -O3 -nostdlib -ffreestanding -isystem inc -I. -Wno-everything \
  -Wl,--no-entry -Wl,-z,stack-size=1048576 -Wl,--initial-memory=8388608 -Wl,--gc-sections \
  -o cubiomes.wasm cubiomes/generator.c cubiomes/layers.c cubiomes/biomenoise.c cubiomes/noise.c \
  cubiomes/biomes.c cubiomes/finders.c shim.c api.c
echo "Built cubiomes.wasm ($(wc -c < cubiomes.wasm) bytes)"
