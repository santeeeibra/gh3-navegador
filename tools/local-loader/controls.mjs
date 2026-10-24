// Read the same saved bindings used by the existing input layer. No remapping.
const frets=['verde','rojo','amarillo','azul','naranja'];
const menu=['A','B','Y','X','LB'],song=['LT','LB','RB','RT','A'];
const ps={A:'✕',B:'○',X:'□',Y:'△',LB:'L1',RB:'R1',LT:'L2',RT:'R2',Start:'Options',Back:'Share'};
const names={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Espacio',Escape:'Esc',Backspace:'Retroceso',NumpadEnter:'Enter num.'};
export const keyName=code=>names[code]||code?.replace(/^(Key|Digit)/,'')||'—';
export function createControls(){
  const guide=document.createElement('section');guide.id='controllerGuide';guide.className='card';
  guide.innerHTML=`<div class="guideHeading"><div><span class="eyebrow">TENÉ LAS TECLAS A MANO</span><h2>Controles</h2></div><span class="guideLive" id="guideMode">Menús</span></div>
    <div class="guideSwitch" role="group" aria-label="Ver botones del mando"><button type="button" data-platform="xbox" aria-pressed="true">Xbox</button><button type="button" data-platform="ps4" aria-pressed="false">PS4</button></div>
    <label class="guideContext">Mostrar <select id="guideContext"><option value="auto">Según el juego</option><option value="menu">Menús</option><option value="song">Canción</option></select></label>
    <div class="guideColumns"><span>Acción / tecla</span><span id="guidePlatform">Xbox</span></div><div id="guideRows"></div>
    <p class="guideHint" id="guideHint"></p><p class="note">Para tocar: mantené el color y rasgueá con ↑ o ↓. Las teclas se pueden cambiar en Ajustes.</p>`;
  let platform='xbox',signature='',rowKeys=[];const pressed=new Set();
  guide.querySelectorAll('[data-platform]').forEach(btn=>btn.onclick=()=>{platform=btn.dataset.platform;guide.querySelectorAll('[data-platform]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));btn.blur();refresh();});
  guide.querySelector('#guideContext').onchange=refresh;
  function refresh(){
    const G=window.gh3Input;if(!G?.getBinds)return;
    const choice=guide.querySelector('#guideContext').value,inSong=choice==='song'||choice==='auto'&&!!G.songMode?.();
    const binds=G.getBinds(),sig=JSON.stringify([platform,inSong,binds]);
    if(sig===signature)return;signature=sig;
    guide.querySelector('#guideMode').textContent=inSong?'Canción':'Menús';
    guide.querySelector('#guidePlatform').textContent=platform==='xbox'?'Xbox':'PS4';
    guide.querySelector('#guideHint').textContent=inSong?'En la canción se usa el esquema de GH3 para mando común.':'En los menús, A de Xbox / ✕ de PS4 confirma; B / ○ vuelve.';
    const rows=guide.querySelector('#guideRows');rows.replaceChildren();rowKeys=[];
    const entries=[...frets.map((f,i)=>[f,inSong?song[i]:menu[i],f]),['rasgueo arriba','↑'],['rasgueo abajo','↓'],['izquierda','←'],['derecha','→'],['Start / pausa','Start'],['Poder estelar','Back'],['Volver (menú)','B']];
    for(const [action,button,color] of entries){
      const row=document.createElement('div');row.className='guideRow';row.dataset.action=action;
      const keys=binds[action]?.filter(Boolean)||[],label=document.createElement('div');label.className='guideAction';
      const title=document.createElement('span');title.className='guideActionName';title.textContent=action[0].toUpperCase()+action.slice(1);
      if(color){const dot=document.createElement('i');dot.className='fretDot '+color;dot.setAttribute('aria-hidden','true');title.prepend(dot);}
      const caps=document.createElement('div');caps.className='keycaps';
      for(const key of keys){const cap=document.createElement('kbd');cap.textContent=keyName(key);caps.append(cap);}if(!keys.length)caps.textContent='Sin tecla';label.append(title,caps);
      const glyph=document.createElement('span');glyph.className='padGlyph '+(platform==='xbox'?'xb-'+button:'ps-glyph');glyph.textContent=platform==='ps4'?(ps[button]||button):button;glyph.setAttribute('aria-label',`${platform==='xbox'?'Xbox':'PS4'}: ${glyph.textContent}`);
      row.append(label,glyph);rows.append(row);rowKeys.push([row,keys]);
    }
    highlight();
  }
  function highlight(){for(const [row,keys] of rowKeys)row.classList.toggle('held',keys.some(k=>pressed.has(k)));}
  addEventListener('keydown',e=>{if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName))return;pressed.add(e.code);highlight();});
  addEventListener('keyup',e=>{pressed.delete(e.code);highlight();});addEventListener('blur',()=>{pressed.clear();highlight();});
  refresh();setInterval(refresh,300);
  return {element:guide,refresh};
}
