// What the website calls: set up a world (version, seed, dimension), fill an area with biome ids, list structures.
#include "cubiomes/generator.h"
#include "cubiomes/finders.h"
#include <stdlib.h>

static Generator g;
static int mc, dimension;
static uint64_t seed;
static int *cache = 0; static size_t cacheSize = 0;
static int out[4096 * 3];

__attribute__((export_name("setup")))
void setup(int version, uint32_t seedLo, uint32_t seedHi, int dim) {
    mc = version; dimension = dim; seed = ((uint64_t)seedHi << 32) | seedLo;
    setupGenerator(&g, mc, 0);
    applySeed(&g, dim, seed);
}

// Biome ids for sx × sz samples, one per `scale` blocks, starting at sample (x, z); y is the height (in scale units)
__attribute__((export_name("area")))
int *area(int scale, int x, int z, int sx, int sz, int y) {
    Range r = {scale, x, z, sx, sz, y, 1};
    size_t need = getMinCacheSize(&g, scale, sx, 1, sz);
    if (need > cacheSize) { free(cache); cache = malloc(need * sizeof(int)); cacheSize = need; }
    if (!cache || genBiomes(&g, cache, r)) return 0;
    return cache;
}

__attribute__((export_name("biomeAt")))
int biomeAt(int x, int y, int z) { return getBiomeAt(&g, 1, x, y, z); }

// Structures of one type in the block area [x0, x1] × [z0, z1] that would really generate there.
// Writes x, z pairs to out[]; returns how many.
__attribute__((export_name("structures")))
int structures(int type, int x0, int z0, int x1, int z1) {
    StructureConfig sc;
    if (!getStructureConfig(type, mc, &sc)) return 0;
    int reg = sc.regionSize * 16, n = 0;
    int rx0 = (x0 < 0 ? x0 - reg + 1 : x0) / reg, rz0 = (z0 < 0 ? z0 - reg + 1 : z0) / reg;
    int rx1 = (x1 < 0 ? x1 - reg + 1 : x1) / reg, rz1 = (z1 < 0 ? z1 - reg + 1 : z1) / reg;
    for (int rz = rz0; rz <= rz1; rz++) for (int rx = rx0; rx <= rx1; rx++) {
        Pos p;
        if (!getStructurePos(type, mc, seed, rx, rz, &p)) continue;
        if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
        if (!isViableStructurePos(type, &g, p.x, p.z, 0)) continue;
        if (n < 4096) { out[2 * n] = p.x; out[2 * n + 1] = p.z; n++; }
    }
    return n;
}

// The first `count` strongholds (they don't use regions)
__attribute__((export_name("strongholds")))
int strongholds(int count) {
    StrongholdIter sh; int n = 0;
    initFirstStronghold(&sh, mc, seed);
    while (n < count && n < 4096) {
        int more = nextStronghold(&sh, &g);
        out[2 * n] = sh.pos.x; out[2 * n + 1] = sh.pos.z; n++;
        if (more <= 0) break;
    }
    return n;
}

__attribute__((export_name("outBuf"))) int *outBuf(void) { return out; }
