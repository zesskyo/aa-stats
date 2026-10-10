#pragma once
#define floor __builtin_floor
#define ceil __builtin_ceil
#define sqrt __builtin_sqrt
#define fabs __builtin_fabs
#define floorf __builtin_floorf
#define sqrtf __builtin_sqrtf
#define fabsf __builtin_fabsf
#define trunc __builtin_trunc
double nan(const char *s); double round(double x); float roundf(float x); long lround(double x); long long llround(double x);
double cos(double x); double sin(double x); double exp(double x); double pow(double a, double b); double log(double x); double atan2(double y, double x);
#define M_PI 3.14159265358979323846
#define INFINITY __builtin_inff()
#define NAN __builtin_nanf("")
