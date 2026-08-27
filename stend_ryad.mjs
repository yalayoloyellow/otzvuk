// УНТЕРТОНОВЫЙ РЯД НА ЗВУКОВЫХ ЯЧЕЙКАХ — есть ли устойчивая ступень.
//
// Для медленного узла язык захвата померен: слишком крепкая связь валит в
// унисон, слишком слабая не держит, между ними ряд делений. Для звуковых
// ячеек то же самое не мерялось ни разу — глубина бралась на глаз.
//
// Мера устойчивости — РАЗБРОС ПЕРИОДА от цикла к циклу. Ступень существует
// только там, где он мал: медиана может лечь на красивое целое и при
// разбросе в сто процентов, просто потому что циклы скачут между соседними
// кратными. Такое целое — не строй, а видимость.
//
// Период меряется опросом триггера НА КАЖДОМ отсчёте. Два прежних захода
// намерили чушь на опросе по блокам: потолок 375 Гц, и полторы тысячи герц
// читались как девяносто.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={sway:.55,depth:.75,gryzn:0,golos:0,petlya:0,
 kuda:.5,zhat:0,drive:.15,master:1,pit:1,sboy:0,gnut:0,derzhi:0,takt:0};
const ВХ=900;
function прогон(seed, golos, сек=2){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, golos}}});
  const n=1,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  let t=0; const пер=[[],[],[]], было=[0,0,0], посл=[0,0,0]; let s=0;
  for(let b=0;b<48000*сек;b++){
    вх[0]=golos?Math.sin(2*Math.PI*ВХ*t):0; t+=1/48000; s++;
    c.process([[вх]],[[L,R]]);
    for(let k=0;k<3;k++){ const q=c.pr.cells[k].q?1:0;
      if(было[k]===0&&q===1){ if(посл[k]&&s>36000) пер[k].push((s-посл[k])/48000); посл[k]=s; }
      было[k]=q; }
  }
  return пер.map(a=>{
    if(a.length<4) return {f:0, рз:1};
    const b=a.slice().sort((x,y)=>x-y), T=b[b.length>>1];
    return {f:1/T, рз:Math.sqrt(a.reduce((s,v)=>s+(v-T)*(v-T),0)/a.length)/T};
  });
}
const ст=f=>{ if(f<5) return '  —  ';
  const o=f>ВХ?f/ВХ:ВХ/f, ц=Math.round(o);
  return (ц>=1&&ц<=16&&Math.abs(o-ц)/ц<.04)?(f>ВХ?ц+':1':'1/'+ц).padStart(5):('('+(f/ВХ).toFixed(2)+')').padStart(5); };
for(const seed of [1626943591, 770901]){
  console.log('  сборка '+seed+'  ·  вход '+ВХ+' Гц в узлы  ·  DETUNE 0.5');
  console.log('   ГОЛОС        ген1              ген2              ген3');
  for(const g of [0,.02,.05,.1,.2,.35,.5,.7,1]){
    const r=прогон(seed,g);
    console.log('    '+g.toFixed(2)+'   '+r.map(x=>
      x.f.toFixed(0).padStart(5)+'Гц '+ст(x.f)+' ±'+(x.рз*100).toFixed(0).padStart(3)+'%').join('  ')+
      (g?'':'   ← контроль, входа нет'));
  }
  console.log('');
}
