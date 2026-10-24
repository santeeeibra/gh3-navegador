/* Paso D2: sustituto mínimo de libavutil/log.h para compilar xma_decoder.cpp sin FFmpeg.
   El decodificador XMA real (xma_context.cpp + FFmpeg) se agrega en el paso de audio. */
#pragma once
#include <stdarg.h>
#define AV_LOG_ERROR 16
#define AV_LOG_WARNING 24
#define AV_LOG_INFO 32
#define AV_LOG_VERBOSE 40
#define AV_LOG_DEBUG 48
static inline void av_log_set_callback(void (*cb)(void*, int, const char*, va_list)) { (void)cb; }
