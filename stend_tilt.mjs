// TILT — СЛОИ РАСХОДЯТСЯ ХАРАКТЕРОМ. Отвод в цепи каждой лампы: первой
// глубже в треск (ударный слой), третьей — пол поднят над треском (гул).
//
// Мера честная, по звуку самих генераторов: частота переключений каждого
// в окнах по сто миллисекунд. Ударному слою положено НЫРЯТЬ — минимум окна
// падает к нулю (треск редких щелчков); гулу положено ПЕТЬ — минимум окна
// поднимается и коридор сужается.
//
// Контроль: TILT в нуле — характер у всех трёх один (коридоры совпадают с
// точностью до номиналов своих ячеек). Качели общие (SPLAY 0), чтобы
// разница шла ТОЛЬКО от ламп.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={sway:.55,tone:.5,depth:.75,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,petlya:0,
 kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,
 takt:0,razved:0,slip:0,tilt:0,derzhi2:0,derzhi3:0};
function прогон(tilt, сек=14){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, tilt}}});
  const n=1,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const окна=[[],[],[]], сч=[0,0,0], было=[0,0,0];
  const окно=4800; let вОкне=0;
  for(let s=0;s<48000*сек;s++){
    c.process([[вх]],[[L,R]]);
    if(s<48000*2) continue;
    for(let k=0;k<3;k++){ const q=c.pr.cells[k].q?1:0;
      if(было[k]===0&&q===1) сч[k]++; было[k]=q; }
    if(++вОкне>=окно){
      for(let k=0;k<3;k++){ окна[k].push(сч[k]*10); сч[k]=0; }
      вОкне=0;
    }
  }
  return окна.map(a=>{
    const b=a.slice().sort((x,y)=>x-y);
    return {низ:b[Math.floor(b.length*.1)], верх:b[Math.floor(b.length*.9)]};
  });
}
const стр=r=>r.map(x=>String(Math.round(x.низ)).padStart(5)+'…'+String(Math.round(x.верх)).padEnd(5)).join('  ');
console.log('Коридор частоты переключений (десятый…девяностый процентиль), Гц.');
console.log('Качели общие: разница только от ламп.\n');
console.log('   TILT       ген1 (бит)      ген2         ген3 (гул)');
for(const t of [0,.5,1])
  console.log('   '+t.toFixed(2)+'   '+стр(прогон(t))+(t?'':'   ← контроль'));
