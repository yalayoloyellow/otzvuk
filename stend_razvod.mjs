// РАЗВОД ТРЁХ МЕДЛЕННЫХ УЗЛОВ — ложатся ли они на РАЗНЫЕ целые доли входа.
//
// Замысел: SYNC сажает каждый узел на своё целое от чужого ритма, SPLAY
// решает, насколько они разойдутся. Три слоя фактуры в разных долях.
//
// Контроль обязателен, и здесь их два. Первый — SPLAY в нуле: три узла должны
// идти ВМЕСТЕ, иначе прибор перестал звучать как прежде. Второй — SYNC в
// нуле: узлы разведены, но ни на что не сели, отношения нецелые.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
 drift:0,range:.5,gryzn:0,golos:.6,gen1:1,gen2:1,gen3:1,link:0,dirt:0,petlya:0,
 kuda:0,naruzhu:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,
 takt:0,razved:0};
const BPM=110, доля=60/BPM;
function прогон(sway, takt, razved, сек=20){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, sway, takt, razved}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const шаг=доля; let t=0;
  const фр=[[],[],[]], было=[0,0,0], ниж=[1,1,1], вер=[0,0,0];
  const пропуск=Math.round(48000*8/n);
  for(let b=0;b<Math.round(48000*сек/n);b++){
    for(let i=0;i<n;i++){ const ф=(t%шаг)/шаг;
      вх[i]=Math.exp(-ф*26)*Math.sin(2*Math.PI*70*t)*.8; t+=1/48000; }
    c.process([[вх]],[[L,R]]);
    const в=n/48000/3;
    for(let k=0;k<3;k++){
      const u=c.pr.swings[k].u;
      ниж[k]=Math.min(u,ниж[k]+(u-ниж[k])*в); вер[k]=Math.max(u,вер[k]+(u-вер[k])*в);
      const сер=(ниж[k]+вер[k])*.5;
      if(b>пропуск && вер[k]-ниж[k]>.02 && было[k]<=сер && u>сер) фр[k].push(b*n/48000);
      было[k]=u;
    }
  }
  return фр.map(a=>{
    const п=[]; for(let i=1;i<a.length;i++) п.push(a[i]-a[i-1]);
    if(п.length<2) return {T:0,сц:0};
    const s=п.slice().sort((x,y)=>x-y);
    let sx=0, sy=0;
    for(const f of a){ const φ=2*Math.PI*((f%шаг)/шаг); sx+=Math.cos(φ); sy+=Math.sin(φ); }
    return {T:s[s.length>>1], сц:Math.sqrt(sx*sx+sy*sy)/a.length};
  });
}
const дел=T=>{ if(!T) return '  —  ';
  const о=T/доля, ц=Math.round(о);
  return (ц>=1&&ц<=8&&Math.abs(о-ц)/ц<.06)?(ц+':1').padStart(5):('('+о.toFixed(2)+')').padStart(5); };
const стр=r=>r.map(x=>x.T.toFixed(2)+'с '+дел(x.T)+' сц'+x.сц.toFixed(2)).join('  ');
console.log('Вход '+BPM+' уд/мин, доля '+доля.toFixed(3)+' с. Три медленных узла.\n');
for(const sway of [.55,.70]){
  console.log('  ручка КАЧАНИЕ '+sway.toFixed(2));
  console.log('   SPLAY 0.0 SYNC 0.0  '+стр(прогон(sway,0,0))+'   ← контроль: узлы вместе');
  console.log('   SPLAY 1.0 SYNC 0.0  '+стр(прогон(sway,0,1))+'   ← контроль: врозь, но не сели');
  // SYNC на упоре не годится: там язык 1:1 самый широкий и проглатывает всё.
  // Полиритм живёт там, где держатся деления — это померено в stend_delenie.
  for(const tk of [.6,.75,.9])
    for(const rz of [.5,1])
      console.log('   SPLAY '+rz.toFixed(1)+' SYNC '+tk.toFixed(2)+'  '+стр(прогон(sway,tk,rz)));
  console.log('');
}
