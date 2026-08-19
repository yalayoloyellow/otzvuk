// ============================================================================
//  ИНТЕРФЕЙС — DOM, запуск звука, отрисовка, запись.
//  Вся композиция — в composer.js; сюда она приходит через узкий env.
// ============================================================================
import {makeComposer} from './composer.js';
import {extract} from './feat.js';
import {emptyModel, train, score as vscore, fitness, explain} from './vkus.js';

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

const WORKLET='engine.worklet.js?v='+Date.now();
const composer=makeComposer({
  post:m=>{ node&&node.port.postMessage(m); },
  ctx:()=>ctx,
  workletUrl:WORKLET,
  swap:swapSource,
  onForm:renderForm
});

// Модуль прячет переменные от консоли; ручка для отладки и стенда сравнения.
window.dbg={get ctx(){return ctx},get node(){return node},
  get profile(){return composer.profile},
  get playing(){return playing},get started(){return composer.started},
  get pick(){return composer.pick}, composer};

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

// ============================================================================
//  НАСТРОЙКА ВКУСА
//  Восемь тем из десяти были «мимо» — значит главный вопрос не «какая из
//  двух лучше», а «годится ли вообще». Поэтому: восемнадцать признаков,
//  журнал каждого клика на диске и две модели (годность и предпочтение),
//  которые переобучаются на всём журнале после каждой пары.
//  Пар не десять, а сколько прокликаешь: закономерность видна на сотнях.
// ============================================================================
let calOn=false, calPair=null, calDone=0, calPlaying=null, calWasPlaying=false;
let calGen=0, calLog=[], calModel=emptyModel(), calAhead=null, calPending=false;
const CAL_DUR=3.2;               // короче: за 300 пар это часы разницы

function calReady(on){
  for(const id of ['#calA','#calB','#calnone','#calR']) $(id).disabled=!on;
}
function calStop(){ if(calPlaying){ try{calPlaying.stop();}catch(e){} calPlaying=null; } }
function calPlay(buf,label){
  calStop();
  const s=ctx.createBufferSource(); s.buffer=buf; s.connect(ctx.destination);
  s.start(); calPlaying=s;
  $('#calmsg').textContent=label;
}

// Кандидаты: пока модель ничего не знает — чистая случайность; как только
// журнал набрал вес, из пятёрки берём двух самых перспективных по модели.
// Так пары становятся всё лучше, а не остаются вечной лотереей.
async function calMakePair(){
  const pool=[], want=calLog.length>=25?5:2;
  for(let i=0;i<want;i++){
    const seed=(Math.random()*4294967295)>>>0;
    const r=await composer.renderCandidate(seed,CAL_DUR);
    pool.push({seed,buf:r.buf,mat:r.mat,f:extract(r.buf)});
  }
  if(pool.length>2){
    pool.sort((a,b)=>vscore(calModel,b.f)-vscore(calModel,a.f));
    // лучший против случайного из остальных: сравнивать только лидеров
    // бессмысленно, модели нужны и отрицательные примеры
    const rest=pool.slice(1);
    return {a:pool[0], b:rest[(Math.random()*rest.length)|0]};
  }
  return {a:pool[0], b:pool[1]};
}

async function calPrepareAhead(){
  if(calPending) return;
  calPending=true;
  try{ calAhead=await calMakePair(); }catch(e){} finally{ calPending=false; }
}

async function calNext(){
  const gen=++calGen;
  calReady(false);
  // Ждём готовую пару циклом, а не одним await: при быстрых кликах
  // накладывались поколения, и кнопки оставались навсегда серыми.
  let waited=0;
  while(!calAhead){
    if(gen!==calGen||!calOn) return;
    if(!calPending){ $('#calmsg').textContent='готовлю пару…'; calPrepareAhead(); }
    await new Promise(r=>setTimeout(r,120));
    waited+=120;
    if(waited>20000){ $('#calmsg').textContent='не получается собрать пару'; return; }
  }
  if(gen!==calGen||!calOn) return;
  calPair=calAhead; calAhead=null;
  calReady(true);
  calPrepareAhead();                       // следующая готовится, пока слушаешь
  await calAudition(gen);
}

async function calAudition(gen){
  if(gen===undefined) gen=calGen;
  if(!calPair) return;
  const ms=CAL_DUR*1000+120;
  calPlay(calPair.a.buf,'первая…  (можно выбирать не дослушивая)');
  await new Promise(r=>setTimeout(r,ms));
  if(gen!==calGen||!calOn) return;
  calPlay(calPair.b.buf,'вторая…');
  await new Promise(r=>setTimeout(r,ms));
  if(gen!==calGen||!calOn) return;
  calStop();
  $('#calmsg').textContent='какая цепляет?';
}

function calChoose(which){
  if(!calPair) return;
  calGen++; calStop();
  const {a,b}=calPair;
  const row={t:Date.now(), profile:composer.profile, win:which,
             a:a.f, b:b.f, matA:a.mat, matB:b.mat, seedA:a.seed, seedB:b.seed};
  calLog.push(row);
  fetch('/vkus',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(row)}).catch(()=>{});
  calModel=train(calModel,calLog);
  composer.setModel(calModel);
  calDone++; calPair=null;
  calShowStat();
  calNext();
}

function calShowStat(){
  const miss=calLog.filter(r=>r.win==='none').length;
  const pct=calLog.length?Math.round(100-miss/calLog.length*100):0;
  $('#caln').textContent=calLog.length+' пар · годных '+pct+'%';
  if(calLog.length>=12){
    const top=explain(calModel,4).map(r=>r.k).join(', ');
    $('#calhint').textContent='модель смотрит прежде всего на: '+top;
  }
}

async function calLoad(){
  try{
    const d=await fetch('/vkus',{cache:'no-store'}).then(r=>r.json());
    calLog=d.rows||[];
    if(calLog.length){ calModel=train(calModel,calLog); composer.setModel(calModel); }
  }catch(e){}
}

function calToggle(){
  calOn=!calOn;
  $('#calp').hidden=!calOn;
  $('#cal').classList.toggle('on',calOn);
  if(calOn){
    calWasPlaying=playing;
    if(playing) $('#run').click();
    calShowStat(); calNext();
  } else {
    calGen++; calStop(); calPair=null;
    if(calWasPlaying && !playing) $('#run').click();
  }
}
$('#cal').onclick=()=>{ if(ctx) calToggle(); };
$('#calA').onclick=()=>calChoose('a');
$('#calB').onclick=()=>calChoose('b');
$('#calnone').onclick=()=>calChoose('none');
$('#calR').onclick=()=>calAudition();
$('#calX').onclick=()=>{ if(calOn) calToggle(); };

// ---- запуск -------------------------------------------------------------------
async function boot(){
  ctx=new AudioContext({latencyHint:'interactive'});
  // у модулей воркета свой кэш: без метки браузер держит старый движок
  await ctx.audioWorklet.addModule(WORKLET);
  node=new AudioWorkletNode(ctx,'otzvuk',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  inGain=ctx.createGain(); inGain.connect(node); node.connect(ctx.destination);
  node.port.onmessage=e=>{
    const d=e.data;
    if(d.rec){ recL.push(d.l); recR.push(d.r); recN+=d.l.length; return; }
    draw(d);
  };
  composer.start();
  calLoad();
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
