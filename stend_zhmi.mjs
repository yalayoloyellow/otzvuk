// КОМПРЕССОР: правда ли он сжимает, а не только подтягивает. Мера — крест-
// фактор, отношение пика к средней: у несжатого прибора он около четырёх,
// и если ручка его не двигает, то никакого сжатия нет.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const N = 128;
const B = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
           range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
           petlya:0, kuda:0, naruzhu:0, mix:0, zhat:0, master:.5};
function zam(semya, z){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:semya, p:{...B, zhat:z}}});
  const L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
  let pik = 0, kv = 0, n = 0;
  const bl = Math.round(48000 * 12 / N);
  for (let b = 0; b < bl; b++){
    c.process([[m]], [[L, R]]);
    if (b < bl * .4) continue;
    for (let i = 0; i < N; i++){ const a = Math.abs(L[i]);
      if (a > pik) pik = a; kv += L[i]*L[i]; n++; }
  }
  const rms = Math.sqrt(kv/n);
  return {pik, rms, kf: pik/rms};
}
console.log('ЖАТЬ    пик      скз    крест-фактор');
for (const z of [0, .25, .5, .75, 1]){
  const r = zam(1626943591, z);
  console.log(z.toFixed(2).padStart(5), r.pik.toFixed(3).padStart(8),
    r.rms.toFixed(4).padStart(9), r.kf.toFixed(2).padStart(10));
}
console.log('\nтри разные по громкости сборки:');
console.log('семя           без ЖАТЬ           при ЖАТЬ 0.7');
for (const s of [3141592, 1626943591, 777]){
  const a = zam(s, 0), b = zam(s, .7);
  console.log(String(s).padEnd(12), 'скз', a.rms.toFixed(4), 'крест', a.kf.toFixed(2),
    '  →  скз', b.rms.toFixed(4), 'крест', b.kf.toFixed(2), 'пик', b.pik.toFixed(3));
}
