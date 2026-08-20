// УДАР ПО КОРПУСУ (пробел). Слышен ли он и звенит ли коробка своим низом.
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
           petlya:0, kuda:0, naruzhu:0, mix:0, zhat:0, master:.5,
           ist:0, ton:.35, temp:.5, povtor:0, trakt:.3};
// Пик — плохая мера для удара: если прибор и так у потолка, пик не сдвинется,
// а удар всё равно слышно. Мерю энергию НИЖЕ 200 Гц — там он и живёт.
const nizk = (y) => { let lp=0, kv=0; const k=1-Math.exp(-2*Math.PI*200/48000);
  for(let i=0;i<y.length;i++){ lp += (y[i]-lp)*k; kv += lp*lp; }
  return Math.sqrt(kv/y.length); };
console.log('сборка       корпус   низ фон   низ удар   громче в   звон, мс');
for (const s of [1626943591, 777, 3141592, 20260820, 42]){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:s, p:{...B}}});
  const L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
  for (let b = 0; b < Math.round(48000*3/N); b++) c.process([[m]], [[L, R]]);
  let fon = 0; const fonY = [];
  for (let b = 0; b < Math.round(48000/N); b++){ c.process([[m]], [[L, R]]);
    for (let i = 0; i < N; i++){ if (Math.abs(L[i]) > fon) fon = Math.abs(L[i]);
      fonY.push(L[i]); } }
  const nizFon = nizk(Float32Array.from(fonY.slice(-Math.round(48000*.04))));
  c.port.onmessage({data:{t:'kick'}});
  let pik = 0; const og = []; const udY = [];
  for (let b = 0; b < Math.round(48000*1.5/N); b++){ c.process([[m]], [[L, R]]);
    let mx = 0;
    for (let i = 0; i < N; i++){ const a = Math.abs(L[i]);
      if (a > mx) mx = a; if (a > pik) pik = a;
      if (udY.length < 48000*.04) udY.push(L[i]); }
    og.push(mx); }
  const nizUd = nizk(Float32Array.from(udY));
  let zvon = 0;
  for (let i = 0; i < og.length; i++) if (og[i] > fon*1.3) zvon = i;
  const sb = c.pr.sb;
  console.log(String(s).padEnd(12), (Math.round(sb.fKorp)+'Гц').padStart(6),
    nizFon.toFixed(4).padStart(9), nizUd.toFixed(4).padStart(10),
    (nizUd/nizFon).toFixed(2).padStart(10),
    Math.round(zvon*N/48000*1000).toString().padStart(10));
}
