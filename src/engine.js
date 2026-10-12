export class Engine{
 constructor(chart){this.chart=chart;this.reset();}
 reset(){this.notes=this.chart.map(n=>({...n,state:'pending',sustainUntil:null}));this.score=0;this.streak=0;this.best=0;this.hits=0;this.misses=0;this.energy=0;this.starUntil=0;this.lastHit=false;this.lastTime=0;this.phrases=new Set();this.feedback='';}
 multiplier(time){return Math.min(4,1+Math.floor(this.streak/10))*(time<this.starUntil?2:1);}
 matches(note,frets){return note.lanes.length>1?frets.size===note.lanes.length&&note.lanes.every(l=>frets.has(l)):frets.has(note.lanes[0])&&![...frets].some(l=>l>note.lanes[0]);}
 hit(time,frets,strum=true){
  const note=this.notes.find(n=>n.state==='pending');
  if(!note||Math.abs(note.time-time)>.14||!this.matches(note,frets)||(!strum&&(!note.hopo||!this.lastHit))){
   if(strum&&time>=0){this.streak=0;this.lastHit=false;this.feedback='RASGUEO DE MÁS';}return false;
  }
  note.state='hit';note.sustainUntil=note.duration?note.time+note.duration:null;
  this.score+=50*note.lanes.length*this.multiplier(time);this.streak++;this.hits++;this.best=Math.max(this.best,this.streak);this.lastHit=true;
  this.feedback=Math.abs(note.time-time)<.065?'PERFECTO':'BIEN';
  if(note.phrase!==null&&!this.phrases.has(note.phrase)){
   const phrase=this.notes.filter(n=>n.phrase===note.phrase);
   if(phrase.every(n=>n.state==='hit')){this.energy=Math.min(100,this.energy+25);this.phrases.add(note.phrase);}
  }return true;
 }
 update(time,frets){
  const previous=this.lastTime;this.lastTime=time;
  for(const note of this.notes){
   if(note.state==='pending'&&time>note.time+.14){note.state='miss';this.misses++;this.streak=0;this.lastHit=false;this.feedback='FALLO';}
   if(note.sustainUntil!==null){
    if(!note.lanes.every(l=>frets.has(l))){note.sustainUntil=null;continue;}
    const dt=Math.max(0,Math.min(time,note.sustainUntil)-Math.max(previous,note.time));this.score+=dt*25*note.lanes.length*this.multiplier(time);
    if(time>=note.sustainUntil)note.sustainUntil=null;
   }
  }
 }
 activate(time){if(this.energy<50||time<this.starUntil)return false;this.starUntil=time+8*(this.energy/50);this.energy=0;return true;}
 snapshot(){return{score:Math.floor(this.score),hits:this.hits,misses:this.misses,streak:this.streak,best:this.best};}
}