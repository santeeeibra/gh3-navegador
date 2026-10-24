// Pairs observed in original R5L captures: YUV and YUV+alpha respectively.
export const binkPairs=new Map([
 ['CAC1FD2246E486B4','5E18383DE868947F'],
 ['57F6448DAC5BEB74','AB008EF1D1A8CB6D'],
]);
export const binkShaders=[...binkPairs.keys(),...binkPairs.values()];
export function isBinkDraw(d){return binkPairs.get(d.vs.toString(16).toUpperCase().padStart(16,'0'))===d.ps.toString(16).toUpperCase().padStart(16,'0');}
