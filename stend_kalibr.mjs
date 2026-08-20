// Уровень записи: собрал ли он десятикратный разброс сборок в один диапазон,
// и не съел ли при этом динамику внутри фразы.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
              petlya:0, kuda:0, naruzhu:0, mix:0};
const semena = [1626943591, 777, 1, 42, 99991, 3141592, 2861234501, 12345,
                777777, 55555, 8675309, 20260820];
console.log('семя           пик      скз    крест-фактор   усиление');
const piki = [], krest = [];
for (const s of semena){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:s, p:{...BAZA}}});
  const N = 128, L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
  let pik = 0, kv = 0, n = 0;
  const blokov = Math.round(48000 * 12 / N);
  for (let b = 0; b < blokov; b++){
    c.process([[m]], [[L, R]]);
    if (b < blokov * .5) continue;              // даём уровню выставиться
    for (let i = 0; i < N; i++){
      const a = Math.abs(L[i]); if (a > pik) pik = a; kv += L[i]*L[i]; n++;
    }
  }
  const rms = Math.sqrt(kv/n), kf = pik/rms;
  piki.push(pik); krest.push(kf);
  console.log(String(s).padEnd(13), pik.toFixed(3).padStart(6), rms.toFixed(4).padStart(9),
    kf.toFixed(1).padStart(12), c.uroven.g.toFixed(2).padStart(11));
}
console.log('\nразброс по пику был 10.3 раз, стал',
  (Math.max(...piki)/Math.min(...piki)).toFixed(1), 'раз');
console.log('пик выше 0.95 хоть у одной сборки:', piki.some(p => p > .95) ? 'ДА' : 'нет');
console.log('крест-фактор', Math.min(...krest).toFixed(1), '…', Math.max(...krest).toFixed(1),
            '— динамика внутри фразы цела, если он не съехал к единице');
