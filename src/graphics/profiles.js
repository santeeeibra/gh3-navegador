export const GRAPHICS_PROFILES = Object.freeze({
 performance: Object.freeze({id:'performance',label:'Máximo rendimiento',description:'Reduce la resolución interna y desactiva el antialiasing para bajar la carga gráfica.',maxPixels:1280*720,resolutionScale:0.65,maxPixelRatio:1,samples:1,anisotropy:1}),
 optimal: Object.freeze({id:'optimal',label:'Óptimo',description:'Equilibra nitidez y carga gráfica. Es el ajuste inicial.',maxPixels:1920*1080,resolutionScale:0.85,maxPixelRatio:1.5,samples:1,anisotropy:4}),
 quality: Object.freeze({id:'quality',label:'Máxima calidad',description:'Usa mayor resolución, antialiasing y filtrado. Puede consumir más batería.',maxPixels:2560*1440,resolutionScale:1,maxPixelRatio:2,samples:4,anisotropy:8}),
});
export const PROFILE_STORAGE_KEY='riff-duel-original-graphics-v1';
export function graphicsProfile(id){return Object.hasOwn(GRAPHICS_PROFILES,id)?GRAPHICS_PROFILES[id]:GRAPHICS_PROFILES.optimal;}
export function loadGraphicsProfile(storage){try{return graphicsProfile(storage?.getItem(PROFILE_STORAGE_KEY)).id;}catch{return 'optimal';}}
export function saveGraphicsProfile(storage,id){const profile=graphicsProfile(id);try{storage?.setItem(PROFILE_STORAGE_KEY,profile.id);}catch{}return profile;}
export function renderPlan(id,{width,height,pixelRatio=1,maxDimension=4096,samples=[1,4],maxAnisotropy=16}){
 const p=graphicsProfile(id);
 const finite=(n,fallback)=>Number.isFinite(n)&&n>0?n:fallback;
 const ratio=Math.min(finite(pixelRatio,1),p.maxPixelRatio)*p.resolutionScale;
 let w=Math.max(1,Math.round(finite(width,1)*ratio)),h=Math.max(1,Math.round(finite(height,1)*ratio));
 const bound=Math.max(1,Math.floor(finite(maxDimension,4096))),scale=Math.min(1,bound/w,bound/h,Math.sqrt(p.maxPixels/(w*h)));
 w=Math.max(1,Math.floor(w*scale));h=Math.max(1,Math.floor(h*scale));
 return {profile:p.id,width:w,height:h,pixels:w*h,samples:samples.includes(p.samples)?p.samples:1,anisotropy:Math.max(1,Math.min(p.anisotropy,finite(maxAnisotropy,1)))};
}
