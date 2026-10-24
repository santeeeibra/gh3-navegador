export function validateImage(im,name){
 const read=(x,y)=>{const px=Math.min(im.width-1,Math.floor(x*im.width/640)),py=Math.min(im.height-1,Math.floor(y*im.height/480));return [...im.data.subarray((py*im.width+px)*4,(py*im.width+px)*4+3)];};
 const points=name==='triangle'?[[320,160,[191,32,32]],[200,320,[64,165,26]],[440,320,[64,26,165]]]:name==='texture'?[[110,100,[200,32,80]],[170,100,[255,210,32]],[110,140,[255,210,32]],[170,140,[200,32,80]]]:[[200,160,[64,64,64]],[440,320,[191,191,64]],[320,240,[128,128,64]]];
 points.push([32,32,[32,96,160]]);
 const samples=points.map(([x,y,expected])=>{const actual=read(x,y);return{x,y,expected,actual,pass:expected.every((v,i)=>Math.abs(v-actual[i])<=5)};});
 return{width:im.width,height:im.height,samples,pass:samples.every(x=>x.pass)};
}
