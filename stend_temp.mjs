// Где на ручке КАЧАНИЕ живёт музыкальный темп. Период качели = такт сетки,
// в него укладываются 16 шагов.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const SRC = readFileSync('./chaos.worklet.js', 'utf8');
const M = new Function(SRC + '\nreturn {Build, Swing, Noise, Cell};')();
const sb = new M.Build(1626943591);
const shum = new M.Noise();
console.log('корпус:', Math.round(sb.fKorp), 'Гц   капсюль:', Math.round(sb.f0), 'Гц');
console.log('\nручка   период    16 шагов дают   темп, если такт = 1 доля / 1 такт(4/4)');
for (let s = 0; s <= 1.0001; s += .0625){
  const sw = new M.Swing(sb, shum);
  sw.step(s, 0, .35, 8.4, 0);
  const per = sw.period;
  const bpmDolya = 60 / per;            // качель = одна доля
  const bpmTakt  = 60 / (per / 4);      // качель = такт 4/4
  console.log(s.toFixed(3).padStart(5),
    (per < .01 ? (per*1000).toFixed(1)+'мс' : per.toFixed(3)+'с').padStart(9),
    (per/16 < .01 ? (per/16*1000).toFixed(1)+'мс' : (per/16).toFixed(3)+'с').padStart(10),
    bpmDolya > 999 ? '     —' : Math.round(bpmDolya).toString().padStart(6),
    bpmTakt > 999 ? '     —' : Math.round(bpmTakt).toString().padStart(6));
}
