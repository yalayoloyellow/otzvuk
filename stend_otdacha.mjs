// Почему одни сборки вдвое-впятеро громче других. Корпус отдаёт тем больше,
// чем плотнее к нему привинчен капсюль и чем гулче он сам, — и оба множителя
// разбросаны сборкой. Ищу, чем именно это описывается.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
globalThis.registerProcessor = () => {};
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const M = new Function(readFileSync('./chaos.worklet.js','utf8')
  + '\nreturn {Device, Build};')();
const p = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
           range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
           petlya:0, kuda:0, naruzhu:0, mix:0};
const semena = [1626943591, 777, 1, 42, 99991, 3141592, 2861234501, 12345,
                777777, 55555, 8675309, 20260820];
console.log('семя         vkladk  Qкорп  fкорп  Bl    mms     пик     скз');
const stroki = [];
for (const s of semena){
  const sb = new M.Build(s);
  const d = new M.Device(s);
  let pik = 0, kv = 0, n = 0;
  for (let i = 0; i < 192000 * 4; i++){
    const y = d.step(p, 0, 0, 1, 0, 0, 0);
    if (i > 192000 * 1.5){ if (Math.abs(y) > pik) pik = Math.abs(y); kv += y*y; n++; }
  }
  const r = {s, sb, pik, rms: Math.sqrt(kv/n)};
  stroki.push(r);
  console.log(String(s).padEnd(12), sb.vkladk.toFixed(2).padStart(6),
    sb.Qkorp.toFixed(2).padStart(6), Math.round(sb.fKorp).toString().padStart(6),
    sb.Bl.toFixed(2).padStart(5), (sb.mms*1e3).toFixed(3).padStart(6),
    pik.toFixed(3).padStart(8), r.rms.toFixed(4).padStart(8));
}
const piki = stroki.map(r => r.pik);
console.log('\nразброс по пику:', (Math.max(...piki)/Math.min(...piki)).toFixed(1), 'раз');
// проверяю догадку: отдача корпуса ∝ vkladk · Qкорп, а мембраны ∝ Bl/mms
console.log('\nсемя        пик   vkladk·Qк   пик/(vkladk·Qк)');
for (const r of stroki){
  const pr = r.sb.vkladk * r.sb.Qkorp;
  console.log(String(r.s).padEnd(12), r.pik.toFixed(3).padStart(6),
    pr.toFixed(2).padStart(10), (r.pik/pr).toFixed(4).padStart(16));
}
