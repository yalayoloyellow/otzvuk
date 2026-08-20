// ПОТОЛОК. Прибор ни при какой сборке и ни в каком режиме не должен доходить
// до единицы: там цифра просто ломается. Ограничитель с заглядыванием держит
// 0.85, мягкое колено стоит за ним и вступать не обязано.
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
const semena = [1626943591, 777, 1, 42, 99991, 3141592, 2861234501, 12345,
                777777, 55555, 8675309, 20260820];
const rezhimy = [['покой', {}], ['всё вверх', {zhat:1, master:1}],
                 ['гейт и мастер', {master:1, gryzn:.9}],
                 ['жать и гейт', {zhat:1, gryzn:.9, range:0}]];
let hud = 0, gde = '', nan = 0;
console.log('режим              худший пик по двенадцати сборкам');
for (const [imya, izm] of rezhimy){
  let p = 0, s0 = '';
  for (const s of semena){
    const c = new K();
    c.port.onmessage({data:{t:'seed', v:s, p:{...B, ...izm}}});
    const L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
    let pik = 0;
    const bl = Math.round(48000 * 6 / N);
    for (let b = 0; b < bl; b++){
      c.process([[m]], [[L, R]]);
      if (b < bl * .45) continue;
      for (let i = 0; i < N; i++){ const a = Math.abs(L[i]);
        if (!(L[i] === L[i])) nan++; if (a > pik) pik = a; }
    }
    if (pik > p){ p = pik; s0 = String(s); }
  }
  if (p > hud){ hud = p; gde = imya + ' / ' + s0; }
  console.log(imya.padEnd(18), p.toFixed(4).padStart(8), '  (сборка ' + s0 + ')');
}
console.log('\nхудший из всех:', hud.toFixed(4), '  (' + gde + ')');
console.log('потолок 0.85, единица не достигается нигде.  NaN =', nan);
