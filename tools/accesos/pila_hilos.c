// Claude 2026-10-15 (paso 4, memoria iPhone): pilas de los hilos del juego.
// Cada hilo del juego pide 16 MiB de pila (xthread.cpp, pensado para PC nativo) y en wasm esa pila vive DENTRO de la memoria
// del juego (~28 hilos ≈ 450 MB reservados). Este archivo se enlaza con --wrap (sin recompilar el motor):
//   PILA_MAX  (bytes, 0 = sin cambio): tope de pila por hilo.
//   PILA_DIAG (1 = diagnóstico): pinta la pila de cada hilo y cada 5 s escribe en el registro cuánto usó de verdad
//             («PILA ...»). Pintar toca toda la pila: NO usar el build de diagnóstico para medir memoria.
#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>

#ifndef PILA_MAX
#define PILA_MAX 0
#endif
#ifndef PILA_DIAG
#define PILA_DIAG 0
#endif

int __real_pthread_attr_setstacksize(pthread_attr_t *a, size_t s);
int __real_pthread_create(pthread_t *t, const pthread_attr_t *a, void *(*fn)(void *), void *arg);

int __wrap_pthread_attr_setstacksize(pthread_attr_t *a, size_t s) {
  if (PILA_MAX && s > PILA_MAX) s = PILA_MAX;
  return __real_pthread_attr_setstacksize(a, s);
}

#if PILA_DIAG
#define N 128
#define MARCA 0xA5
static struct { uintptr_t bajo, alto; void *fn; int vivo; } hilos[N];
static int cuantos, reportero;
struct inicio { void *(*fn)(void *); void *arg; };

static void *trampolin(void *p) {
  struct inicio i = *(struct inicio *)p; free(p);
  // Sin emscripten/stack.h (agrega funciones al .js y rompe el ajuste de ASM_CONSTS): límites con pthread_getattr_np.
  pthread_attr_t at; void *dir; size_t tam; volatile char aqui = 0;
  pthread_getattr_np(pthread_self(), &at); pthread_attr_getstack(&at, &dir, &tam); pthread_attr_destroy(&at);
  uintptr_t bajo = (uintptr_t)dir, alto = bajo + tam, sp = (uintptr_t)&aqui;
  if (sp > bajo + 4096) memset((void *)bajo, MARCA, sp - 4096 - bajo);
  int k = __atomic_fetch_add(&cuantos, 1, __ATOMIC_SEQ_CST);
  if (k < N) { hilos[k].bajo = bajo; hilos[k].alto = alto; hilos[k].fn = (void *)i.fn; __atomic_store_n(&hilos[k].vivo, 1, __ATOMIC_SEQ_CST); }
  void *r = i.fn(i.arg);
  if (k < N) __atomic_store_n(&hilos[k].vivo, 2, __ATOMIC_SEQ_CST);
  return r;
}

static void *reportar(void *p) {
  (void)p;
  for (int vuelta = 0;; vuelta++) {
    sleep(5);
    int n = __atomic_load_n(&cuantos, __ATOMIC_SEQ_CST); if (n > N) n = N;
    size_t max = 0;
    for (int k = 0; k < n; k++) {
      if (!__atomic_load_n(&hilos[k].vivo, __ATOMIC_SEQ_CST)) continue;
      const unsigned char *b = (const unsigned char *)hilos[k].bajo; uintptr_t x = hilos[k].bajo;
      while (x < hilos[k].alto && b[x - hilos[k].bajo] == MARCA) x++;
      size_t usado = hilos[k].alto - x, total = hilos[k].alto - hilos[k].bajo;
      if (usado > max) max = usado;
      printf("PILA v%d h%d fn=%p usado=%zuKB de %zuKB %s\n", vuelta, k, hilos[k].fn, usado >> 10, total >> 10, hilos[k].vivo == 2 ? "terminado" : "vivo");
    }
    printf("PILA v%d hilos=%d maximo=%zuKB\n", vuelta, n, max >> 10);
  }
  return 0;
}

int __wrap_pthread_create(pthread_t *t, const pthread_attr_t *a, void *(*fn)(void *), void *arg) {
  if (!__atomic_exchange_n(&reportero, 1, __ATOMIC_SEQ_CST)) {
    pthread_t r; pthread_attr_t ra; pthread_attr_init(&ra); __real_pthread_attr_setstacksize(&ra, 256 << 10);
    __real_pthread_create(&r, &ra, reportar, 0); pthread_attr_destroy(&ra);
  }
  struct inicio *i = malloc(sizeof *i); i->fn = fn; i->arg = arg;
  return __real_pthread_create(t, a, trampolin, i);
}
#else
int __wrap_pthread_create(pthread_t *t, const pthread_attr_t *a, void *(*fn)(void *), void *arg) {
  return __real_pthread_create(t, a, fn, arg);
}
#endif
