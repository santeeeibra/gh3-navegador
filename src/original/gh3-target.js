// Identidad de la copia requerida por Guitar-Hero-3-Recomp-.
// Coincidir con estos datos valida la copia, no la ejecucion en navegador.
export const GH3_X360_TARGET = Object.freeze({
  edition: 'Guitar Hero III: Legends of Rock — Xbox 360 USA Rev 1',
  size: 11055104,
  sha256: '1d67d98fbb0e35ac086d6354f3e49985698c83298226eafdec756e2a9e799a14',
  source: 'https://github.com/luisxl15/Guitar-Hero-3-Recomp-',
});
export function identifyGh3Xex({header, size, sha256}) {
  const target = GH3_X360_TARGET;
  const xex2 = [0x58,0x45,0x58,0x32].every((byte,i) => header?.[i] === byte);
  if (!xex2) return {copyCompatible:false, reason:'not-xex2', message:'Este archivo no es un ejecutable XEX2 de Xbox 360. La copia de Windows no sirve para esta recompilacion.'};
  if (size !== target.size) return {copyCompatible:false, reason:'wrong-size', message:`El XEX2 no tiene el tamano de la revision compatible (${target.size} bytes).`};
  if (!sha256) return {copyCompatible:null, reason:'hash-required', message:'El tamano coincide; falta comprobar SHA-256 para confirmar la revision.'};
  if (sha256.toLowerCase() !== target.sha256) return {copyCompatible:false, reason:'wrong-hash', message:'El SHA-256 no coincide con GH3 Xbox 360 USA Rev 1. No usar este ejecutable para generar el port.'};
  return {copyCompatible:true, reason:'verified-copy', message:'La copia coincide con GH3 Xbox 360 USA Rev 1. El motor web aun no ejecuta el juego.'};
}
