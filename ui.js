// ============================================================================
//  ИНТЕРФЕЙС — DOM, запуск звука, отрисовка, запись.
//  Вся композиция — в composer.js; сюда она приходит через узкий env.
// ============================================================================
import {makeComposer} from './composer.js';

const $=s=>document.querySelector(s);
const stateEl=$('#state'), formEl=$('#form'), tlEl=$('#tl');
const cv=$('#mem'), cx=cv.getContext('2d'), memlab=$('#memlab');
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

let ctx=null,node=null,inGain=null,srcNode=null,srcGain=null;
let playing=true;

function swapSource(buffer,fade){
  const t=ctx.currentTime;
  if(srcNode&&srcGain){
    const old=srcNode, og=srcGain;
    og.gain.cancelScheduledValues(t);
    og.gain.setValueAtTime(og.gain.value,t);
    og.gain.linearRampToValueAtTime(0,t+fade);
    setTimeout(()=>{ try{old.stop();}catch(e){} og.disconnect(); },(fade+.2)*1000);
  }
  srcGain=ctx.createGain();
  srcGain.gain.setValueAtTime(0,t);
  srcGain.gain.linearRampToValueAtTime(1,t+fade);
  srcGain.connect(inGain);
  srcNode=ctx.createBufferSource(); srcNode.buffer=buffer; srcNode.loop=true;
  srcNode.connect(srcGain); srcNode.start();
}

function renderForm(f){
  formEl.textContent=f.sec+' · '+f.mat+(f.groove?' · '+f.groove:'')+
    (f.perc?' · '+f.perc:'')+' · '+f.bars+' т. · '+f.bpm+' bpm';
  const bar=Math.round(f.tension*22);
  tlEl.innerHTML='<span class="now">'+f.sec+'</span>'+
    '<i>напряжение</i><span>'+'▮'.repeat(bar)+'▯'.repeat(22-bar)+'</span>';
}

const composer=makeComposer({
  post:m=>{ node&&node.port.postMessage(m); },
  ctx:()=>ctx,
  swap:swapSource,
  onForm:renderForm
});

// Модуль прячет переменные от консоли; ручка для отладки и стенда сравнения.
window.dbg={get ctx(){return ctx},get node(){return node},
  get profile(){return composer.profile},
  get playing(){return playing},get started(){return composer.started}};

// ---- запись -----------------------------------------------------------------
let recOn=false, recL=[], recR=[], recN=0, recT0=0;
function wav(l,r,n,sr){
  const buf=new ArrayBuffer(44+n*4), v=new DataView(buf);
  const str=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  str(0,'RIFF'); v.setUint32(4,36+n*4,true); str(8,'WAVEfmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*4,true);
  v.setUint16(32,4,true); v.setUint16(34,16,true);
  str(36,'data'); v.setUint32(40,n*4,true);
  let o=44, k=0;
  for(let b=0;b<l.length;b++){
    const L=l[b], R=r[b];
    for(let i=0;i<L.length&&k<n;i++,k++){
      v.setInt16(o,clamp(L[i],-1,1)*32767,true); o+=2;
      v.setInt16(o,clamp(R[i],-1,1)*32767,true); o+=2;
    }
  }
  return new Blob([buf],{type:'audio/wav'});
}
$('#rec').onclick=async()=>{
  if(!ctx) return;
  recOn=!recOn;
  node.port.postMessage({t:'rec',v:recOn?1:0});
  $('#rec').classList.toggle('on',recOn);
  if(recOn){ recL=[];recR=[];recN=0; recT0=Date.now(); $('#rec').textContent='■ стоп'; return; }
  $('#rec').textContent='● запись';
  if(!recN) return;
  const blob=wav(recL,recR,recN,ctx.sampleRate);
  const d=new Date(), p=x=>String(x).padStart(2,'0');
  const name=`отзвук-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.wav`;
  stateEl.textContent='сохраняю '+(blob.size/1048576).toFixed(1)+' МБ…';
  try{
    const res=await fetch('/rec',{method:'POST',headers:{'X-Name':name},body:blob});
    const j=await res.json();
    stateEl.textContent = j.ok ? ('записано: '+name) : ('не сохранилось: '+(j.error||''));
  }catch(e){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=name; a.click();
    stateEl.textContent='сервер не принял, скачиваю файлом';
  }
  recL=[];recR=[];recN=0;
};

// ---- кнопки -----------------------------------------------------------------
$('#prof').onclick=()=>{ $('#prof').textContent=composer.nextProfile(); };
$('#ref').onclick=()=>composer.refresh();
function doVote(good){
  if(!composer.vote(good)) return;
  $('#like').classList.toggle('on',good);
  setTimeout(()=>$('#like').classList.remove('on'),400);
}
$('#like').onclick=()=>doVote(true);
$('#dis').onclick=()=>doVote(false);
$('#run').onclick=()=>{
  playing=!playing;
  $('#run').classList.toggle('on',playing);
  $('#run').textContent=playing?'■ стоп':'▶ пуск';
  node&&node.port.postMessage({t:'run',v:playing?1:0});
};
addEventListener('keydown',e=>{
  if(/INPUT|SELECT/.test(e.target.tagName)) return;
  const k=e.key.toLowerCase();
  if(k==='arrowup') doVote(true);
  else if(k==='arrowdown') doVote(false);
  else if(k==='p') $('#prof').click();
  else if(k===' '){ e.preventDefault(); $('#ref').click(); }
});

// ---- запуск -------------------------------------------------------------------
async function boot(){
  ctx=new AudioContext({latencyHint:'interactive'});
  // у модулей воркета свой кэш: без метки браузер держит старый движок
  await ctx.audioWorklet.addModule('engine.worklet.js?v='+Date.now());
  node=new AudioWorkletNode(ctx,'otzvuk',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  inGain=ctx.createGain(); inGain.connect(node); node.connect(ctx.destination);
  node.port.onmessage=e=>{
    const d=e.data;
    if(d.rec){ recL.push(d.l); recR.push(d.r); recN+=d.l.length; return; }
    draw(d);
  };
  composer.start();
  // Первый клик страницы и запускает движок, и может попасть по «стоп»:
  // переключение тогда уходит в ещё не созданный узел и теряется.
  node.port.postMessage({t:'run',v:playing?1:0});
}
addEventListener('pointerdown',async function once(){
  removeEventListener('pointerdown',once);
  if(!composer.started){ await boot(); await ctx.resume(); }
},{once:true});

// ---- отрисовка -----------------------------------------------------------------
function draw(d){
  composer.onBar(d,playing);
  const w=cv.width,h=cv.height; cx.clearRect(0,0,w,h);
  if(d.bins){
    const b=d.bins,N=b.length,bw=w/N;
    let mx=.01; for(let i=0;i<N;i++) if(b[i]>mx) mx=b[i];
    for(let i=0;i<N;i++){
      const v=Math.pow(b[i]/mx,.55);
      cx.fillStyle='rgba(216,255,74,'+(.08+.6*v)+')';
      const bh=Math.max(1,v*(h-44));
      cx.fillRect(i*bw,(h-bh)/2+9,bw-1,bh);
    }
    for(const p of (d.heads||[])){
      const px=clamp(p,0,1)*w;
      cx.fillStyle='rgba(255,138,61,.85)';
      cx.fillRect(px-1,0,2,h); cx.fillRect(px-4,h-5,8,5);
    }
  }
  memlab.textContent='материал '+d.sec.toFixed(1)+' с';
  const rt=recOn?' · запись '+((Date.now()-recT0)/1000|0)+' с':'';
  stateEl.textContent=(d.lufs>-60?d.lufs.toFixed(1)+' LUFS · ':'')+
    Math.round(d.bpm)+' bpm · такт '+d.bar+(playing?'':' · пауза')+rt;
}
