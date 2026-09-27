// A tiny C library for running cubiomes in WebAssembly: memory, a few string helpers, and maths from JavaScript.
#include <stddef.h>
#include <stdint.h>
#define IMPORT(n) __attribute__((import_module("env"), import_name(n)))
IMPORT("cos") double js_cos(double); IMPORT("sin") double js_sin(double); IMPORT("exp") double js_exp(double);
IMPORT("pow") double js_pow(double, double); IMPORT("log") double js_log(double); IMPORT("atan2") double js_atan2(double, double);
double cos(double x) { return js_cos(x); } double sin(double x) { return js_sin(x); } double exp(double x) { return js_exp(x); }
double pow(double a, double b) { return js_pow(a, b); } double log(double x) { return js_log(x); } double atan2(double y, double x) { return js_atan2(y, x); }
double round(double x) { return x < 0 ? -__builtin_floor(-x + 0.5) : __builtin_floor(x + 0.5); }
float roundf(float x) { return (float)round(x); }
double nan(const char *s) { return __builtin_nan(""); }
long lround(double x) { return (long)round(x); } long long llround(double x) { return (long long)round(x); }

// memory: bump allocator with a free list per exact size (cubiomes allocates a few buffers and reuses them)
extern unsigned char __heap_base;
static uintptr_t top = 0;
typedef struct Blk { size_t n; struct Blk *next; } Blk;
static Blk *freed = 0;
void *malloc(size_t n) {
    n = (n + 15) & ~(size_t)15;
    for (Blk **pp = &freed; *pp; pp = &(*pp)->next) if ((*pp)->n == n) { Blk *b = *pp; *pp = b->next; return (char *)b + 16; }
    if (!top) top = ((uintptr_t)&__heap_base + 15) & ~(uintptr_t)15;
    uintptr_t p = top, end = p + 16 + n, have = __builtin_wasm_memory_size(0) * 65536;
    if (end > have && __builtin_wasm_memory_grow(0, (end - have + 65535) / 65536) == (size_t)-1) return 0;
    top = end; ((Blk *)p)->n = n; return (void *)(p + 16);
}
void free(void *p) { if (!p) return; Blk *b = (Blk *)((char *)p - 16); b->next = freed; freed = b; }
void *memset(void *d, int c, size_t n) { unsigned char *p = d; while (n--) *p++ = (unsigned char)c; return d; }
void *memcpy(void *d, const void *s, size_t n) { unsigned char *a = d; const unsigned char *b = s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n) { unsigned char *a = d; const unsigned char *b = s; if (a < b) while (n--) *a++ = *b++; else { a += n; b += n; while (n--) *--a = *--b; } return d; }
void *calloc(size_t a, size_t b) { void *p = malloc(a * b); if (p) memset(p, 0, a * b); return p; }
void *realloc(void *p, size_t n) { void *q = malloc(n); if (p && q) { size_t o = ((Blk *)((char *)p - 16))->n; memcpy(q, p, o < n ? o : n); free(p); } return q; }
int memcmp(const void *a, const void *b, size_t n) { const unsigned char *x = a, *y = b; for (; n; n--, x++, y++) if (*x != *y) return *x - *y; return 0; }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) a++, b++; return (unsigned char)*a - (unsigned char)*b; }
int abs(int x) { return x < 0 ? -x : x; } long labs(long x) { return x < 0 ? -x : x; }
// output and exiting aren't needed in the browser
typedef struct FILE FILE; FILE *stderr = 0, *stdout = 0;
int printf(const char *f, ...) { return 0; } int fprintf(FILE *s, const char *f, ...) { return 0; }
_Noreturn void exit(int c) { __builtin_trap(); } _Noreturn void abort(void) { __builtin_trap(); }
