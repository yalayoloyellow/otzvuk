// КАЧАНИЕ как ориентир плавности. Ухо слышит не положение ручки, а то, как
// быстро едет ПЕРИОД: он ходит на восемь октав, и это самое жёсткое
// требование на панели. Меряю скорость ухода периода, процентов в секунду.
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
function progon(mix, shag){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:1626943591, p:{sway:.55, tone:.5, depth:.75,
    range:.5, gryzn:0, golos:0, gen1:1,
    gen2:1, gen3:0, dirt:0, petlya:0, kuda:0, mix, zhat:0,
    master:.5}}});
  const L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
  for (let b = 0; b < 60; b++) c.process([[m]], [[L, R]]);
  c.port.onmessage({data:{t:'p', v:{...c.cel, sway: .55 + shag}}});
  let prosh = c.pr.swing.period, mx = 0, kogda = 0;
  for (let b = 0; b < Math.round(SR * 14 / N); b++){
    c.process([[m]], [[L, R]]);
    const per = c.pr.swing.period;
    const v = Math.abs(per / prosh - 1) / (N / SR) * 100;
    if (v > mx){ mx = v; kogda = (b + 1) * N / SR; }
    prosh = per;
  }
  return {mx, kogda};
}
console.log('шаг ручки   режим            макс скорость ухода периода');
for (const shag of [.02, .10]){
  for (const [imya, mix] of [['под пальцем', 0], ['микширование', 1]]){
    const r = progon(mix, shag);
    console.log(('+' + shag.toFixed(2)).padStart(9), '  ', imya.padEnd(14),
      r.mx.toFixed(1).padStart(6), '%/с   пик на', r.kogda.toFixed(2) + 'с');
  }
}
