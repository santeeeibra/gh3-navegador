CONTEXTO GH3 EN NAVEGADOR (actualizado 18/10/2026, 23:59)

REGLAS PARA EL AGENTE
- No soy programador: explicá en lenguaje simple.
- Cuidá mis tokens: respuestas de máx 10-12 líneas, sin sondear progreso, un solo cambio por vez.
- Marcá siempre COMPROBADO vs HIPÓTESIS. COMPROBADO = mostrás la línea/instrucción/log que lo prueba. Sin evidencia a la vista es HIPÓTESIS.
- No publiques ni toques lo publicado sin mi OK. Yo subo con el .cmd.
- No copies archivos del juego al repo.
- Windows. Pruebo en PC potente (12 núcleos); el objetivo son PCs de gama media/baja. Celular ya no importa.

OBJETIVO
GH3 original, fiel, fluido en el navegador; después online con amigos. Para jugar ya: BetterGH3 nativo en PC (no probado).

XBOX 360 (recompilación a C++ -> WebAssembly con hilos; la página dibuja la autopista)
- Carpeta D:\guitar hero (repo gh3-navegador). Web: lasvegasherogame.com/gh3/ (Vercel). Reglas y estado en CLAUDE.md y artifacts/COORDINACION.md. Codex ya no participa; el agente actual puede tocar native60.
- Subida: el agente arma artifacts\privado\deploy-app y yo corro 2b-SUBIR-LO-ARMADO.cmd (responder n si pregunta por actualizar Vercel). NO usar 2-PUBLICAR-GH3.cmd. Respaldos en artifacts/respaldo.
- Online: paquete1 = relojpub + margen 60 + cartel de versión; sinvblank apagado (se activa con &sinvblank=1; usar & y no ? porque la dirección ya tiene ?). Después subí una copia con línea de tiempo en ?diag=1 (v-reloj-2-linea).
- RESUELTO: desfase juicio/audio con el gancho relojaudio (el reloj del juicio sigue al del audio; juicio-audio ±20-50 ms; antes ~285 ms). El margen 60 lleva la autopista a -7 ms del audio (antes -26).
- Calidad media (liviana, sin escenario): juego al 83-88% con 12 núcleos (25-33 imágenes nuevas/s; la pantalla repite hasta 60). Con 2 núcleos simulados 82% y la canción se pierde (simulación quizá sesgada).
- Calidad alta: 32-46%, no jugable. Con ?sinsombra=1 aparece toda la banda (a native60 le faltaban 10 variantes de material sin sombra), costo casi cero. Copia artifacts/d1-wasm/sinsombra/demo, no publicada.
- Freno principal: el hilo de lógica espera ~47% del tiempo al VBlank y al hilo de comandos de GPU (sub_822BF0F8, sub_823814F8). sinvblank sube ~4 imágenes/s y baja los cuadros >50 ms de 23% a 10%.
- DESCARTADO: sinescena, sin43, interruptores de público/luces/LOD, guardar la hora por cuadro, el arreglo del robot. sin3d y sin43 suben ~5 puntos pero no salvan la canción con 2 núcleos.
- Para jugar: "Notas y sonido" en NORMAL (0). NO correr la prueba de retraso (se pisa a sí misma y guarda ±230).

WASM REVISADO (19/10): NO RECOMPILAR, no hay ganancia barata
- COMPROBADO con wasm-info.mjs sobre artifacts\d1-wasm\relojpub\demo\gh3-web.wasm (68,4 MB): hilos (memoria compartida, +atomics), +simd128 y +bulk-memory permitidos, memoria 256 MB inicial / 4 GB tope, sin info de depuración, con nombres de funciones (sección name, 2,82 MB; quitarla bajaría la descarga ~2,8 MB, mejora menor).
- HIPÓTESIS: no es el freno principal (el hilo de lógica espera ~47% al VBlank y a GPU; optimizar código no acelera una espera). No se sabe si el código usa SIMD de verdad ni con qué nivel de optimización se compiló (sin sección producers).
- No hay scripts de build en el repo (hay toolchain/emsdk con emcc.py). Si algún día se recompila, es decisión grande mía, con prueba A/B y sin publicar.

PENDIENTE XBOX (por prioridad) <- AHORA SE TRABAJA ACÁ
0) BLOQUEADO hasta tener evidencia: para &precalentar=1 faltan dos logs con ?diag=1 (A: InPrivate, IndexedDB vacío; B: ventana normal ya usada), misma canción y calidad media, más el cronómetro de la parada. Servidor: node tools/ui3/serve.mjs artifacts/d1-wasm/relojpub/demo 5450. Hoy no hay ninguna medición guardada que pruebe que la parada de ~28 s coincide con las compilaciones. Ya existe una precarga (tools/r5-native60/preload.mjs, pipelines guardados en IndexedDB, compila en menús con gobernador normal). Capturar en la misma sesión el reloj atrasado de los primeros ~7 s (pendiente 2).
1) Parada de ~28 s al empezar una canción, coincide con 5-7 compilaciones de shaders en juego (en InPrivate la precarga da 0). Propuesta: precalentar 55 compilaciones durante la carga con &precalentar=1. SIGUIENTE TAREA.
2) En los primeros ~7 s el reloj del juego va ~270 ms atrasado respecto del audio: cerrar ese hueco durante la cuenta regresiva.
3) A veces las notas se adelantan hasta ~1 s a mitad de canción y se acomodan. El robot no lo reproduce: usar ?diag=1 y la línea de tiempo en mi PC.
4) 6 RangeError inofensivos de gh3-song.js al arrancar el motor.

WII: PAUSADO / CERRADO POR AHORA (no retomar antes de resolver el Xbox)
Datos base
- Dump propio extraído con Dolphin en D:\Descargas\GH3_wit\DATA. Game ID RGHE52. main.dol de 4,24 MB, sin REL, sin símbolos, 8.302 funciones (dtk). 3,67 GB en 11.577 archivos: .pak.ngc, .wad.ngc (canciones, hasta 50 MB), 749 .dsp, 25 .bik.
- DolRecomp (GPL-3.0, solo CPU) compilado en D:\herramientas\DolRecomp (CMake + VS Build Tools con C++). Sobre main.dol: 903.760 instrucciones, 902.106 reconocidas, 1.654 datos incrustados (solo el conteo; DolRecomp no guardó una lista de zonas), 0 desconocidas; 222 archivos C en build\generated. 151 direcciones marcadas SMC en build\generated\generated_smc.txt.
- Audio: FMOD está dentro del DOL (fmod_dsp_codec.cpp) y trae el códec GCADPCM; se recompila con el juego. Falta saber qué servicios de hardware (AI/AX/DSP) llama por debajo.

Resultado del análisis de SMC (18/10, muestra de 40 de 151)
- COMPROBADO: las 40 caen en secciones de código (text0/text1), ninguna en datos. Ninguna es clase C (código del juego que se reescribe).
- COMPROBADO: 2 son operaciones de caché del SDK (0x80004320 y 0x800046C8, en func_80004000; patrón dcbst/sync/icbi/isync). Un runtime las puede dejar como no-op.
- COMPROBADO: 21 de las 40 caen en solo 2 funciones (func_800DB700: 11, func_8009F700: 10). Las instrucciones exactas: 17 son stfs (guardar decimal), 4 son stw con base r3. Ninguna instrucción de caché cerca.
- HIPÓTESIS: son falsas alarmas del detector de DolRecomp (marca stores con registro base no resuelto). No está demostrado que los 4 stw no apunten a código.
- SIN RESOLVER: 33 de las 40 quedaron clase D (indeterminadas) y 111 de 151 no se miraron. "Requiere MAP file" NO es cierto: hay 8.302 funciones de dtk.

Investigación de runtimes (18/10): ninguno corre en navegador hoy
- ModernGekko (+ Template): GPL-3.0, núcleo derivado de Dolphin (video/audio/HLE), solo escritorio nativo. Su documentación dice que ModernGekko no compila con MSVC (README de DolRecomp), pero el Template pone MSVC por defecto en Windows: contradicción sin resolver.
- Aurora (MIT): capa GX sobre WebGPU (Dawn) pero lista solo D3D12/Vulkan/Metal; es "a nivel de código fuente" para decompilaciones, aunque WiiCompiled lo usa con código recompilado. HIPÓTESIS: el candidato con camino más corto a la web; nadie lo portó.
- WiiCompiled (Mario Kart Wii): port nativo de PC, prueba de que Wii recompilado funciona. Toolchain específico del proyecto, no general.
- NWiiRecomp: rasterizador, shaders y HLE propios, runtime SDL2 + OpenGL. Manda las funciones llenas de ceros en el DOL (código cargado en ejecución) a un intérprete del runtime.

Prueba nativa con ModernGekko-Template (ABANDONADA)
- Carpeta D:\herramientas\gh3-wii-prueba. GCC 16.2.0 + Ninja instalados. MSVC no instalado, WSL corrupto.
- Solución que funcionó: usar sh.exe de Git for Windows como SHELL con mingw32-make (sirve para el Makefile).
- DolRecomp compiló. ModernGekko configuró bien después de "git submodule update --init --recursive" (eso era problema de entorno).
- Build de ModernGekko falló ~al 47%: Timer.cpp y x64CPUDetect.cpp usan SetProcessInformation/GetProcessInformation, que los headers de MinGW no declaran. Es código de Dolphin contra MinGW, no del entorno.
- Para retomar (no recomendado todavía): probar en Linux, o con MSVC (~3 GB) aceptando la contradicción de arriba. Comando de etapa 2 pendiente: recompilar main.dol con make run GAME=D:\Descargas\GH3_wit\DATA y verificar si el backend correcto es "c" o "llvm".

Decisión: no se abandona el Xbox. El Wii queda pausado hasta que el Xbox esté resuelto o haya una razón nueva.

ERRORES DE OTROS AGENTES (no repetir)
- DolRecomp SÍ existe y compila (CMake y C, no .csproj).
- "FMOD sin soporte" y "PAK incompatible" NO son bloqueadores.
- Wii y Xbox son big-endian; la comparación de PAK usó solo 8 bytes.
- "0 referencias a OSCreateThread" no significa nada en un binario sin símbolos.
- "No usa AX" no está comprobado.
- dtk analiza, no recompila.
- "Requiere MAP file para clasificar SMC" es falso.
- Decir "no hay compilador" sin mirar CMakeCache.txt ni vswhere; y marcar COMPROBADO una causa de error de CMake sin mostrar la línea "CMake Error".
- No arreglar a mano código de Dolphin/ModernGekko sin mi OK.

PRÓXIMOS PASOS (uno por vez, esperar mi OK)
1) Xbox: implementar &precalentar=1 (precalentar 55 compilaciones de shaders durante la carga). Con criterio de abandono.
2) Después: Xbox pendiente 2 (reloj atrasado en los primeros ~7 s).
