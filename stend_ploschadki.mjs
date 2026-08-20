// ПЛОЩАДКИ: насколько палец вообще меняет частоту, и одинаково ли он это
// делает наверху и внизу качелей. Площадка сейчас подключена ПАРАЛЛЕЛЬНО
// частотозадающей цепи, а та ездит от 50 кОм до мегаом.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const M = new Function(readFileSync('./chaos.worklet.js','utf8')
  + '\nreturn {Device, Build};')();
const sb = new M.Build(1626943591);
console.log('фоторезистор: свет', (sb.Rsvet/1e3).toFixed(0), 'кОм … темно',
            (sb.Rtemn/1e6).toFixed(1), 'МОм    утечка платы',
            (sb.Rpl/1e6).toFixed(1), 'МОм');
console.log('палец подключён параллельно, номинал 2.6 МОм / доля\n');
const BAZA = {sway:.55, tone:.5, depth:0, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
              petlya:0, kuda:0, naruzhu:0};
// depth=0 держит качели неподвижно, а ХАРАКТЕР ставит рабочую точку лампы
console.log('характер   без пальца   палец 1   палец 8   все восемь   сдвиг, %');
for (const tone of [0, .25, .5, .75, 1]){
  const f = [];
  for (const u of [0, .10, .10+8*.055, 3.0]){
    const d = new M.Device(1626943591);
    const p = {...BAZA, tone};
    for (let i = 0; i < 48000*4*1.2; i++) d.step(p, u, 0, 1, 0, 0);
    f.push(d.osn.f);
  }
  console.log(tone.toFixed(2).padStart(7),
    f.map(v => Math.round(v).toString().padStart(11)).join(''),
    ((f[3]/f[0]-1)*100).toFixed(1).padStart(10));
}
