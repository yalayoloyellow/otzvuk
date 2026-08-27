// РЕГРЕССИЯ У ХАОТИЧЕСКОГО ПРИБОРА — только статистикой.
//
// Посэмплово сверять НЕЛЬЗЯ, и это не лень: тепловой и фликкерный шум тянутся
// из Math.random(), который не сеется. Два прогона ОДНОГО И ТОГО ЖЕ ядра
// расходятся на 3.8e-1 — столько же, сколько разные ядра. Всякая сверка без
// контрольного прогона «ядро с самим собой» здесь бессмысленна.
//
// Сверяем распределения: уровень, крест-фактор, средняя частота, период
// качелей. Разброс СВОЕГО ядра между прогонами задаёт мерку — чужое ядро
// обязано лечь в неё.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
const НАБОРЫ=[
 ['спокойный', {sway:.55,tone:.5,depth:.75,range:.5,gryzn:.3,golos:.6,gen1:1,gen2:1,gen3:1,dirt:.2,petlya:0,
  kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,takt:.5,razved:0}],
 ['крайний',   {sway:.7,tone:.3,depth:1,range:.3,gryzn:.6,golos:1,gen1:1,gen2:1,gen3:1,dirt:.5,petlya:0,
  kuda:.5,zhat:.4,drive:.5,master:1,pit:0,set:1,sboy:0,gnut:.4,derzhi:0,takt:.8,razved:0}],
];
function мера(код,П,сек=4){
  let K=null; globalThis.registerProcessor=(n,k)=>K=k;
  new Function(код)();
  const c=new K(); c.port.onmessage({data:{t:'seed',v:1626943591}});
  c.port.onmessage({data:{t:'p',v:П}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const y=[]; let t=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){
    for(let i=0;i<n;i++){ вх[i]=Math.sin(2*Math.PI*220*t)*.5; t+=1/48000; }
    c.process([[вх]],[[L,R]]);
    for(let i=0;i<n;i++) y.push(L[i]);
  }
  const скз=Math.sqrt(y.reduce((s,x)=>s+x*x,0)/y.length);
  let пик=0; for(const v of y) if(Math.abs(v)>пик) пик=Math.abs(v);
  let сум=0,вес=0,п=0;
  for(let i=1;i<y.length;i++) if(y[i-1]<=0&&y[i]>0){ if(п){сум+=48000/(i-п);вес++;} п=i; }
  return {скз, крест:пик/скз, част:вес?сум/вес:0, период:c.pr.swing.period};
}
const пути=process.argv.slice(2);
if(пути.length<2){ console.log('  нужно: node stend_regr.mjs <прежнее.js> <нынешнее.js>'); process.exit(1); }
const A=readFileSync(пути[0],'utf8'), B=readFileSync(пути[1],'utf8');
for(const [имя,П] of НАБОРЫ){
  const a=[мера(A,П),мера(A,П),мера(A,П)], b=[мера(B,П),мера(B,П),мера(B,П)];
  console.log('  набор «'+имя+'»');
  for(const к of ['скз','крест','част','период']){
    const va=a.map(x=>x[к]), vb=b.map(x=>x[к]);
    const ср=v=>v.reduce((s,x)=>s+x,0)/v.length;
    const разбр=Math.max(...va)-Math.min(...va);
    const сдвиг=Math.abs(ср(vb)-ср(va));
    console.log('    '+к.padEnd(8)+' прежде '+ср(va).toFixed(4).padStart(10)+
      '   теперь '+ср(vb).toFixed(4).padStart(10)+
      '   сдвиг '+сдвиг.toFixed(4)+'   свой разброс '+разбр.toFixed(4)+
      (сдвиг<=Math.max(разбр,Math.abs(ср(va))*.02)?'  в мерке':'  ВЫШЕ МЕРКИ'));
  }
  console.log('');
}
