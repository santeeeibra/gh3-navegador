// Local catalog metadata only; song data is read from the user's copy.
const rows=`slowride|Slow Ride
talkdirtytome|Talk Dirty to Me
hitmewithyourbestshot|Hit Me with Your Best Shot
storyofmylife|Story of My Life
mississippiqueen|Mississippi Queen
schoolsout|School's Out
sunshineofyourlove|Sunshine of Your Love
barracuda|Barracuda
bullsonparade|Bulls on Parade
whenyouwereyoung|When You Were Young
missmurder|Miss Murder
theseeker|The Seeker
laydown|Lay Down
paintitblack|Paint It Black
paranoid|Paranoid
anarchyintheuk|Anarchy in the U.K.
koolthing|Kool Thing
mynameisjonas|My Name Is Jonas
evenflow|Even Flow
holidayincambodia|Holiday in Cambodia
rockulikeahurricane|Rock You Like a Hurricane
sameoldsonganddance|Same Old Song and Dance
lagrange|La Grange
welcometothejungle|Welcome to the Jungle
blackmagicwoman|Black Magic Woman
cherubrock|Cherub Rock
blacksunshine|Black Sunshine
themetal|The Metal
pridenjoy|Pride and Joy
beforeiforget|Before I Forget
stricken|Stricken
threesandsevens|3's & 7's
knightsofcydonia|Knights of Cydonia
cultofpersonality|Cult of Personality
rainingblood|Raining Blood
cliffsofdover|Cliffs of Dover
numberofthebeast|The Number of the Beast
one|One
sabotage|Sabotage
reptilia|Reptilia
suckmykiss|Suck My Kiss
citiesonflame|Cities on Flame with Rock and Roll
helicopter|Helicopter
monsters|Monsters
rocknrollallnite|Rock and Roll All Nite
avalancha|Avalancha
bellyofashark|In the Belly of a Shark
cantbesaved|Can't Be Saved
closer|Closer
dontholdback|Don't Hold Back
downndirty|Down 'n Dirty
fcpremix|F.C.P.R.E.M.I.X.
generationrock|Generation Rock
gothatfar|Go That Far
hierkommtalex|Hier kommt Alex
imintheband|I'm in the Band
impulse|Impulse
inlove|In Love
mauvaisgarcon|Mauvais Garçon
metalheavylady|Metal Heavy Lady
minuscelsius|Minus Celsius
mycurse|My Curse
nothingformehere|Nothing for Me Here
prayeroftherefugee|Prayer of the Refugee
radiosong|Radio Song
ruby|Ruby
shebangsadrum|She Bangs the Drums
takethislife|Take This Life
thewayitends|The Way It Ends
thrufireandflames|Through the Fire and Flames`;
const titles=Object.fromEntries(rows.split('\n').map(row=>row.split('|')));
export const FIRST_FOUR=['slowride','talkdirtytome','hitmewithyourbestshot','storyofmylife'];
export function discoverSongPackages(files){
 const byPath=new Map(files.map(f=>[f.path.toLowerCase(),f])),packages={},excluded=[];
 for(const [id,title] of Object.entries(titles)){
  const found=[`data/compressed/songs/${id}_song.pak.xen`,...['dat','fsb'].map(ext=>`data/music/${id}.${ext}.xen`)].map(p=>byPath.get(p));
  if(found.some(f=>!f))throw Error('Faltan archivos de '+title);
  packages[id]={title,files:found.map(f=>f.id),status:id==='slowride'?'tested-slowride':'assets-verified-gameplay-pending'};
 }
 for(const f of files){const m=f.path.toLowerCase().match(/^data\/compressed\/songs\/([a-z0-9_]+)_song\.pak\.xen$/);if(m&&!titles[m[1]])excluded.push({id:m[1],reason:'battle-tutorial-or-test-chart'});}
 return {packages,excluded};
}
export const songIds=m=>Object.keys(m.packages).filter(id=>id!=='base');
export function selectedPackages(m,selection){
 const ids=selection==='all'?songIds(m):selection==='first4'?FIRST_FOUR:[selection];
 if(!ids.length||ids.some(id=>id==='base'||!m.packages[id]))throw Error('Selección de canciones inválida.');
 return ['base',...ids];
}
export function restoreSelection(m,packages){
 const ids=packages.filter(id=>id!=='base'),same=other=>other.length===ids.length&&other.every(id=>ids.includes(id));
 if(ids.length===1&&m.packages[ids[0]])return ids[0];
 if(same(FIRST_FOUR))return 'first4';
 if(same(songIds(m)))return 'all';
 return 'slowride';
}
export function populateSongOptions(select,m){
 const ids=songIds(m),previous=select.value,choices=[];
 if(FIRST_FOUR.every(id=>m.packages[id]))choices.push(['first4','Las primeras cuatro']);
 if(ids.length>4)choices.push(['all',`Todas las canciones (${ids.length})`]);
 for(const id of ids)choices.push([id,m.packages[id].title]);
 select.replaceChildren(...choices.map(([id,title])=>{const o=document.createElement('option');o.value=id;o.textContent=title;return o;}));
 select.value=choices.some(([id])=>id===previous)?previous:choices[0][0];
}
export function renderSelectedSongs(container,m,selection){
 container.replaceChildren(...selectedPackages(m,selection).slice(1).map((id,i)=>{
  const row=document.createElement('div'),number=document.createElement('small'),title=document.createElement('b');
  number.textContent=String(i+1).padStart(2,'0');title.textContent=m.packages[id].title;row.append(number,title);return row;
 }));
}
