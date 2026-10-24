// Load the chart the original game actually opened, including unprepared songs.
// Generation checks prevent a slow read of the previous song overwriting it.
export function createChartLoader({song,readFile,decode,onError=()=>{},onLoaded=()=>{}}){
 let generation=0,current=null;
 const load=async(name,diff='medium')=>{
  if(!/^[a-z0-9_]+$/.test(name)||!['easy','medium','hard','expert'].includes(diff))throw Error('Canción o dificultad inválida.');
  const key=name+'/'+diff;
  if(current?.key===key)return current.promise;
  const ticket=++generation;
  const promise=Promise.resolve().then(async()=>{
   try{
    const file=await readFile(`DATA/COMPRESSED/SONGS/${name}_song.pak.xen`);
    const chart=await decode(file,name,diff);
    if(ticket!==generation)return null;
    chart.name=name;chart.diff=diff;song.chart=chart;onLoaded(chart);return chart;
   }catch(e){if(ticket===generation){current=null;onError(e);}throw e;}
  });
  current={key,promise};return promise;
 };
 return {load,cancel(){generation++;current=null;},get current(){return current?.key;}};
}
