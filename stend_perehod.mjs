// Как звучит ПЕРЕКЛЮЧЕНИЕ. Меряю огибающую выхода в момент щелчка тумблера:
// сколько длится въезд и выезд, есть ли разрыв (щелчок) и приседают ли
// соседние ветви, когда приходит новая.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const M = new Function(readFileSync('./chaos.worklet.js','utf8') + '\nreturn {Device};')();

const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15,
              drift:0, range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0,
              link:0, dirt:0, petlya:0, kuda:0, naruzhu:0};
const SR = 48000, OV = 4;

// огибающая по выходу прибора, шаг 5 мс
function ogibayuschaya(izmenenie, kogda = 1.0, vsego = 2.6){
  const d = new M.Device(1626943591);
  const p = {...BAZA};
  const okno = Math.round(SR * OV * .005);
  const og = []; let kv = 0, k = 0;
  for (let i = 0; i < SR * OV * vsego; i++){
    if (i === Math.round(SR * OV * kogda)) Object.assign(p, izmenenie);
    const y = d.step(p, 0, 0, 1, 0, 0);
    kv += y * y;
    if (++k >= okno){ og.push(Math.sqrt(kv / okno)); kv = 0; k = 0; }
  }
  return og;
}
// уровень до события и время выхода на новый уровень
function razbor(imya, izm){
  const og = ogibayuschaya(izm);
  const shag = .005, tsob = 1.0;
  const i0 = Math.round(tsob / shag);
  const sr = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += og[i]; return s/(b-a); };
  const bylo = sr(i0 - 60, i0 - 4);            // 300 мс до
  const stalo = sr(og.length - 40, og.length); // хвост
  // где огибающая прошла половину пути
  let tpol = null;
  for (let i = i0; i < og.length; i++){
    const d = (og[i] - bylo) / ((stalo - bylo) || 1e-9);
    if (d >= .5){ tpol = (i - i0) * shag; break; }
  }
  // самый резкий скачок между соседними окнами сразу после события
  let skachok = 0;
  for (let i = i0; i < i0 + 6; i++) skachok = Math.max(skachok, Math.abs(og[i+1] - og[i]));
  console.log(imya.padEnd(26),
    'до', bylo.toFixed(3), '→ после', stalo.toFixed(3),
    ' полпути за', tpol === null ? '—' : (tpol*1000).toFixed(0)+'мс',
    ' макс скачок за 5мс', skachok.toFixed(3));
  return {bylo, stalo};
}
console.log('ТУМБЛЕРЫ ГЕНЕРАТОРОВ');
razbor('ген3 включаю', {gen3:1});
razbor('ген2 выключаю', {gen2:0});
razbor('ген2 выкл + ген3 вкл', {gen2:0, gen3:1});
console.log('\nвзаимодействие ветвей: приход третьей ветви должен ПРИСАДИТЬ первые две');
