import fs from 'node:fs';
const root='artifacts/r4-wgsl-menu-44';
const naga=JSON.parse(fs.readFileSync(`${root}/naga/conversion.json`));
const edge=JSON.parse(fs.readFileSync(`${root}/edge-modules.json`));
const draw=JSON.parse(fs.readFileSync(`${root}/edge-44.json`));
const mips=JSON.parse(fs.readFileSync(`${root}/missing-mips.json`));
const tintPath=`${root}/tint/conversion.json`;
const tint=fs.existsSync(tintPath)?JSON.parse(fs.readFileSync(tintPath)):null;
const tintValidationPath=`${root}/tint-wgsl/validation.json`;
const tintValidation=fs.existsSync(tintValidationPath)?JSON.parse(fs.readFileSync(tintValidationPath)):null;
if(tint){
 const errors=tint.profiles.map(p=>({profile:p.profile,total:p.total,emitted:p.emitted,wgslValid:p.wgslValid,failures:p.results.filter(r=>!r.wgslValid).map(r=>{
  const stage=r.conversion??r.validation??r.revalidation;
  const text=fs.readFileSync(stage.stderr,'utf8');
  const message=text.split(/\r?\n/).find(l=>l.includes('error:')&&!/internal compiler error|Failed to parse SPIR-V/.test(l))??text.split(/\r?\n/)[0];
  return {shader:r.name,stage:r.stage,status:stage.status,message,stdout:stage.stdout,stderr:stage.stderr};
 })}));
 fs.writeFileSync(`${root}/tint-errors.json`,JSON.stringify({executable:tint.executable,executableSha256:tint.executableSha256,profiles:errors},null,2));
}
const failures=edge.results.filter(r=>!r.moduleValid);
const errors=failures.map(r=>{const err=r.messages.find(m=>m.type==='error');return `| ${r.name.match(/shader_([A-F0-9]+)/)[1]} | ${err?.lineNum} | ${err?.message} |`;}).join('\n');
const lines=[
'# RESULTADO — WGSL y 44 operaciones de menú (Codex, 2026-10-11)',
'',
'## COMPROBADO',
'',
'Se leyeron CLAUDE.md, AGENTS.md, REGLAS.md y COORDINACION, incluidas las entradas de herramientas de apoyo y R5F rangos. Trabajo nuevo aislado; ninguna modificación de command_processor.cpp, audio/CPU, productor R5F, capturas ni recursos preparados. No GH3 ni publicación/deploy.',
'',
'Los 71 shaders provienen del corpus R4 de G0. Se repitieron las conversiones sobre dos entradas distintas, conservando hashes y todo stdout/stderr por shader. Naga 30.0.0 está en toolchain/r4-naga: la ruta sugerida D:/r4-naga no existe actualmente.',
'',
'| Entrada / prueba | Conversión a WGSL | Revalidación Naga | Módulos Edge |',
'|---|---:|---:|---:|',
'| SPIR-V R4 original, sin adaptar | 0/71 | 0/71 | Sin WGSL para probar |',
'| Perfil R4 ya adaptado (spirv-repacked) | 71/71 | 71/71 | 65/71 |',
'',
'El SPIR-V original falla primero con XeSystemConstants: miembro8 offset496 cruza span496. Las adaptaciones existentes ordenan miembros, sustituyen el array de bindings por un binding de memoria y repaquetan constantes504→528B. No se rehicieron ni cambiaron esas adaptaciones; se verificaron hashes de entrada. Las 71 salidas nuevas son byte a byte iguales a las salidas anteriores. Los warnings de Restrict/NoContraction permanecen conservados; revalidar no certifica precisión numérica.',
'',
`Edge ${edge.browser}: 37/37 vertex y28/34 fragment válidos. Los seis fallos, sin suprimir derivative_uniformity:`,
'',
'| Hash fragment | Línea WGSL | Error |',
'|---|---:|---|',errors,
'',
'Errores y notas de flujo completos: edge-modules.json. Los módulos válidos no se cuentan como pipelines ni draws de otros materiales.',
'',
'## Dibujo y comparación con los replays existentes',
'',
'Entrada exacta: artifacts/gpu-capture/r5f-v2/prep-new/menu-layers.json (SHA256 '+draw.fixtureSha256+'). Cuadro3;44 operaciones395–438 identificadas por posición395−144…438−144, índices nuevos1205–1248. No se alinearon por igualdad de hash de imagen.',
'',
'Se suministró el WGSL recién convertido de B43CF443883B8351 (VS) y526B394DE2AB8891 (PS). Se reutilizó sin editar el renderer de diagnóstico que produjo la referencia; todos los recursos264/264 y el fixture coinciden con los hashes registrados. Ambas salidas WGSL también coinciden con sus hashes registrados. El target acumula capas, sin limpiar entre cada DRAW.',
'',
`Resultado: ${draw.draws.length}/44 draws ejecutados, ${draw.draws.filter(r=>r.vsD3D12.identical).length}/44 lecturas acumuladas idénticas byte a byte al replay D3D12 de RenderDoc y44/44 a Edge anterior. Imagen final Vulkan igual en RGB: ${draw.final.vulkanRGB.identical}; el BMP no permite comparar alfa. Cero errores de GPU/página.`,
'',
'Referencia: artifacts/gpu-capture/runs/v2-44 (se reutilizó su extracción D3D12 y BMP Vulkan; no se lanzó otro replay nativo). Por cada operación se comprobó etiqueta de textura y cantidad de índices antes de comparar; los shaders se proporcionaron recién convertidos, no solo las salidas de la tanda anterior.',
'',
'Esto comprueba conversión reproducible y estabilidad entre Edge y los replays de nuestro renderer. No es una referencia de consola, no es el cuadro completo319draws/13COPY, y no prueba imagen viva ni superficies EDRAM previas. La pareja utilizada no incluye los6PS rechazados.',
'',
'## Productor R5F — línea separada',
'',
`Pendiente: en cuadro3 hay ${mips.uniqueDescriptors} descriptores distintos (${mips.textureReferences} referencias) con mipMax>0 y mipBytes=0; ${mips.selected44References} en las44 operaciones verificadas. missing-mips.json conserva fetch, direcciones, mipMin/Max y tamaños. Esto prueba ausencia del payload separado, no que cada DRAW necesite ese mip: verificar selección, LOD y packed-tail antes de concluir que faltan bytes usados. Codex no modificó el productor.`,
'',
'## Tint y pendientes',
'',
tint?`Tint standalone ejecutado desde D:/guitar hero/toolchain/r4-tint/Dawn-c943ea32b614ff53e4fe410fc8f4968b6b8fe46d-windows-latest-Release/bin/tint.exe: ${tint.profiles.map(p=>`${p.profile}: ${p.emitted}/71 emitidos, ${p.wgslValid}/71 revalidados`).join('; ')}. Logs completos en tint/.`:'Tint standalone no instalado. Solicitada autorización de descarga del paquete oficial Dawn Windows119MB; mientras no haya respuesta no se descarga. La validación de WGSL en Edge (Dawn/Tint) está comprobada65/71, pero NO se presenta como conversión SPIR-V→WGSL con Tint standalone. Esa comparación permanece pendiente.',
'',
...(tint?[
'Santi autorizó la descarga y pidió instalación en D:. Paquete oficial Dawn v20261009.190412,119251849B. SHA256 verificado contra GitHub: ba97fa93b5e1c265b8a4411698169b40e7696e7e8d574482c94efce6e3ff4228. Extracción portable íntegra en toolchain/r4-tint; sin PATH ni instalación global. Metadatos/hash/listado/archive/help y stdout/stderr conservados en logs/.',
'',
'Comparación sobre las MISMAS entradas: Tint baseline71/71 rechazos por miembro7 offset28 sin alineación16 de Uniform. Tint repacked71/71 abortos internos (status3221226505) en validación IR previa a DeadCodeElimination:37VS por invariant en interpoladores sin position;34PS por invariant en fragment output. tint-errors.json identifica cada uno con su error y rutas de logs completos. No se borraron decoraciones ni se suprimieron validadores para obtener éxito.',
'',
`Control positivo: el SPIR-V compute propio convierte con Tint=${tintValidation?.positive.ok}. Validación/re-emisión standalone del WGSL recién generado por Naga=${tintValidation?.valid}/71. Son los mismos6PS/dpdyCoarse rechazados por Edge, con las mismas líneas. Esto distingue la falla del lector SPIR-V de Tint de la validez del WGSL; no contar65WGSL válidos como65conversiones SPIR-V de Tint. Evidencia: tint-wgsl/validation.json y logs completos.`,
'',
'Decisión dentro de esta tanda: conservar Naga como convertidor para el perfil repacked y Tint/Edge como controles de WGSL. La comparación solicitada está completada, aunque Tint no genera shaders del corpus. No se vuelve a correr GPU: Tint no produjo WGSL nuevo para dibujar y los71WGSL de Naga son los mismos que ya dieron44/44.',
]:[]),
'',
'Fuentes oficiales consultadas para localizar Tint: https://github.com/google/dawn/releases y revisión c943ea32b614ff53e4fe410fc8f4968b6b8fe46d. Los archivos de empaquetado consultados quedaron en logs/. No se atribuyen características del convertidor a los resultados de Naga.',
'',
'Hipótesis: corregir la estructura de flujo de las derivadas podría habilitar los6PS. No se ejecutó ni se cambió el traductor para probar esa hipótesis en esta tanda.',
'',
'## Regresiones, archivos y reproducción',
'',
'npm test24/24. check-reader pasó originales y8corruptos rechazados. Antes de editar, respaldo artifacts/respaldo/2026-10-11-wgsl-menu-44/. Turno reservado con identificador codex-wgsl; liberado solo el propio en finally. Edge/servidor propios cerrados;5394 intacto.',
'',
'- tools/r4-wgsl-menu-44/convert.mjs: barrido Naga o Tint, hashes y stdout/stderr por etapa; rechaza sobrescribir una corrida previa.',
'- verify.mjs: reserva, valida71módulos, dibuja44 y compara con referencia existente; mips.mjs: inventario offline; report.mjs: informe.',
'- artifacts/r4-wgsl-menu-44/naga/conversion.json y naga/{baseline,repacked}/logs: conversión y errores completos.',
'- edge-modules.json, edge-44.json, edge-44/final.png y draw-*.rgba: validación y píxeles nuevos.',
'- missing-mips.json y logs/{verify,mips,npm,reader}.{stdout,stderr}.txt.',
'',
tint?'Próximo: resolver los6PS de derivadas y avanzar con COPY/EDRAM en el backend; investigar los abortos de Tint por invariant antes de considerarlo convertidor alternativo. Zona libre.':'Próximo: completar comparación Tint cuando esté disponible; después resolver los6PS y avanzar con COPY/EDRAM en el backend. Zona libre.',
''];
fs.writeFileSync(`${root}/RESULTADO-WGSL-MENU-44.md`,lines.join('\n'));
console.log(JSON.stringify({report:`${root}/RESULTADO-WGSL-MENU-44.md`,naga:71,edge:edge.valid,draws:draw.draws.length,tint:!!tint}));
