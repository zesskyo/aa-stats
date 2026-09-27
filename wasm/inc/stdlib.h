#pragma once
#include <stddef.h>
void *malloc(size_t n); void *calloc(size_t a, size_t b); void *realloc(void *p, size_t n); void free(void *p);
_Noreturn void exit(int c); _Noreturn void abort(void);
int abs(int x); long labs(long x);
void qsort(void *b, size_t n, size_t s, int (*c)(const void *, const void *));
