# Texturas originales locales

Runner pequeño que compila y utiliza el lector `XenImgFile` y `DxtDecoder` de
[NeversoftMultitool](https://github.com/slfx77/neversoft-multitool), sin modificarlos.
No ejecuta el juego ni escribe en la carpeta fuente. No es el CLI completo upstream.
Código fuente descargado en `toolchain/neversoft-texture-source/`; licencia MIT
conservada allí en `LICENSE.md`. Dependencias: .NET 10 y Pillow para PNG.

```powershell
dotnet run --project tools/original-textures/Extract.csproj -- '<carpeta IMG original>' 'D:/guitar hero/artifacts/original-textures/loading'
python tools/original-textures/preview.py artifacts/original-textures/loading
```

El proyecto incluye cuatro archivos upstream: XenImgFile.cs, DxtDecoder.cs,
Ps2Texture.cs y Ps2TexResult.cs. El inventario de procedencia local está en
`artifacts/original-textures/upstream-source.json` y registra hashes descargados.
Los resultados comerciales quedan en artifacts, excluido de publicación.

Primera prueba: nueve IMG de DATA/COMPRESSED/IMAGES/LOADINGSCREENS decodificados;
PNG inspeccionados visualmente, dimensiones y hashes en manifest.json. El lector
quita DEFLATE, reordena bloques Xenos, aplica endian y decodifica DXT según la cabecera.
Solo exporta el nivel base; no certifica los mipmaps ni fidelidad contra una captura
del juego nativo. No se modificó el renderer ni se ejecutaron pruebas GPU.

La imagen loadscrn contiene Tony Hawk's Project 8 aunque está en la copia GH3:
no implica que sea utilizada por GH3. Faltan identificar notas, autopista y HUD
dentro de los paquetes PAK/PAB y sus diccionarios TEX; el lector IMG no extrae PAK.

## Ampliación: recursos de gameplay

`unpack.py` lee tablas GH3 X360 y extrae IMG/TEX usando offsets relativos al header
con PAB compañero. `resolve-names.py` recupera nombres de dbg.pak.xen de la propia
copia. El runner también admite TEX con los lectores NextGenTexFile y XenosTiling.
`browse.py` exporta PNG y galerías paginadas. `select-gameplay.py` prepara la selección
de notas, autopista de Axel, marcos y multiplicadores, sin inventar imágenes.

Ver resultado y limitaciones en `artifacts/original-textures/RESULTADO-GAMEPLAY.md`.
Un TEX de global tiene formato no soportado: se conserva el error y se recupera
solo el prefijo validado por upstream. No se decodifican los registros posteriores.
Las fuentes FNT del puntaje están localizadas pero sus glifos aún no se exportan.
