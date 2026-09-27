#pragma once
#include <stddef.h>
typedef struct FILE FILE;
extern FILE *stderr, *stdout;
int printf(const char *f, ...);
int fprintf(FILE *s, const char *f, ...);
int sprintf(char *s, const char *f, ...);
int snprintf(char *s, size_t n, const char *f, ...);
int puts(const char *s);
FILE *fopen(const char *p, const char *m);
int fclose(FILE *f);
size_t fwrite(const void *p, size_t s, size_t n, FILE *f);
size_t fread(void *p, size_t s, size_t n, FILE *f);
int fputs(const char *s, FILE *f);
