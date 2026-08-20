// ГРОМКОСТЬ. Три вопроса: приходят ли разные сборки к одной громкости,
// не съедена ли при этом динамика, и сколько времени занимает выход.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const N = 128, SR = 48000;
const B = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
           range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
           petlya:0, kuda:0, naruzhu:0, mix:0, zhat:0, rel:.45,
           ist:0, ton:.35, temp:.5, povtor:0, trakt:.3};
function progon(semya, izm, sek){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:semya, p:{...B, ...izm}}});
  const L=new Float32Array(N), R=new Float32Array(N), m=new Float32Array(N);
  const y=[];
  for (let b = 0; b < Math.round(SR*sek/N); b++){
    c.process([[m]],[[L,R]]);
    for (let i = 0; i < N; i++) y.push(L[i]);
  }
  return {y: Float32Array.from(y), c};
}
console.log('семя           LUFS    усиление   пик     крест-фактор');
const lu = [], kf = [];
for (const s of [1626943591, 777, 3141592, 20260820, 42, 99991]){
  const {y, c} = progon(s, {}, 20);
  const hv = y.slice(SR*12);
  let pik = 0, kv = 0;
  for (const v of hv){ const a = Math.abs(v); if (a > pik) pik = a; kv += v*v; }
  const rms = Math.sqrt(kv/hv.length);
  lu.push(c.grom.lufs); kf.push(pik/rms);
  console.log(String(s).padEnd(13), c.grom.lufs.toFixed(1).padStart(6),
    (c.grom.db>=0?'+':'')+c.grom.db.toFixed(1)+' дБ',
    pik.toFixed(3).padStart(9), (pik/rms).toFixed(2).padStart(11));
}
console.log('\nразброс громкости: был 18.3 дБ, стал',
  (Math.max(...lu)-Math.min(...lu)).toFixed(1), 'дБ');
console.log('крест-фактор', Math.min(...kf).toFixed(2), '…', Math.max(...kf).toFixed(2),
  ' (без петли был 2.9…4.2 — динамика цела, если не съехал к единице)');
