// ПЕТЛЯ. Теперь она входит в каскад, значит должна упираться в то же питание
// и краситься тем же капсюлем. Меряю: сколько прибора остаётся при вое и на
// какую частоту садится вой. Микрофон подменяю задержанной копией выхода —
// это и есть комната.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const SR = 48000, N = 128;
const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
              petlya:0, kuda:0, naruzhu:0, mix:0};
// комната: задержка 12 мс и затухание — путь от динамика до микрофона
function progon(petlya, komnata, sek = 8){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:1626943591, p:{...BAZA, petlya}}});
  const L = new Float32Array(N), R = new Float32Array(N);
  const zad = new Float32Array(Math.round(SR * .012)); let zi = 0;
  const mik = new Float32Array(N);
  let kv = 0, cnt = 0, pik = 0;
  const hvost = [];
  for (let b = 0; b < Math.round(SR*sek/N); b++){
    c.process([[mik]], [[L, R]]);
    for (let i = 0; i < N; i++){
      mik[i] = zad[zi] * komnata;             // комната вернула
      zad[zi] = L[i]; zi = (zi + 1) % zad.length;
      if (b > Math.round(SR*sek/N)*.35){
        kv += L[i]*L[i]; cnt++;
        if (Math.abs(L[i]) > pik) pik = Math.abs(L[i]);
        if (hvost.length < 1<<14) hvost.push(L[i]);
      }
    }
  }
  // на какую частоту сел вой — по нулям сигнала
  let per = 0, posl = -1;
  for (let i = 1; i < hvost.length; i++)
    if (hvost[i-1] <= 0 && hvost[i] > 0){ if (posl >= 0) per++; posl = i; }
  const f = per > 2 ? per * SR / hvost.length : 0;
  return {rms: Math.sqrt(kv/cnt), pik, f};
}
// Три РАЗНЫЕ комнаты: микрофон далеко, обычно, вплотную. Раскладка по
// положениям ручки обязана быть одинаковой во всех трёх — в этом весь смысл.
console.log('комната  петля    скз      пик    частота воя');
for (const km of [.12, .55, 1.6]){
  for (const u of [0, .5, 1]){
    const r = progon(u, km);
    console.log(km.toFixed(2).padStart(7), u.toFixed(1).padStart(6),
      r.rms.toFixed(4).padStart(9), r.pik.toFixed(3).padStart(8),
      (Math.round(r.f)+' Гц').padStart(12));
  }
  console.log();
}
