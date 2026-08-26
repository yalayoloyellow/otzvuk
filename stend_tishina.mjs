// ОХОТА НА ТИШИНУ. yala: «звук иногда пропадает». Перебираю настройки и ищу
// сочетания, при которых прибор замолкает или почти замолкает. Ищу не наугад:
// подозрение на ЗАПИРАНИЕ генератора — когда точка покоя разряда уходит выше
// нижнего порога, конденсатор до него не доползает и триггер больше не
// щёлкает. С одним включённым генератором это сразу тишина.
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
const B = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
           range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, dirt:0,
           petlya:0, kuda:0, mix:0, zhat:0, drive:.15,
           ist:0, ton:.35, temp:.5, povtor:0, trakt:.3};
function tiho(iz, semya, pl){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:semya, p:{...B, ...iz}}});
  if (pl) c.port.onmessage({data:{t:'pads', v:pl}});
  const L=new Float32Array(N), R=new Float32Array(N), m=new Float32Array(N);
  let kv = 0, n = 0, shchel = 0;
  for (let b = 0; b < Math.round(SR*6/N); b++){
    c.process([[m]],[[L,R]]);
    if (b <= Math.round(SR*2/N)) continue;
    for (let i = 0; i < N; i++){ kv += L[i]*L[i]; n++; }
  }
  for (const g of c.pr.cells) if (g.f > 0) shchel++;
  return {rms: Math.sqrt(kv/n), f: c.pr.osn.f, zhivyh: shchel};
}
console.log('ПОИСК ПО РУЧКАМ, один генератор (как на снимке yala)');
console.log('настройка                        скз      частота ген1');
const nabor = [
  ['как на снимке', {gen2:0, gen3:0, range:.14, pulse:.14, gryzn:.3, sway:.42}],
  ['импульс в ноль', {gen2:0, gen3:0, pulse:0}],
  ['импульс на полную', {gen2:0, gen3:0, pulse:1}],
  ['диапазон в ноль', {gen2:0, gen3:0, range:0}],
  ['диапазон на полную', {gen2:0, gen3:0, range:1}],
  ['характер в ноль', {gen2:0, gen3:0, tone:0}],
  ['размах в ноль', {gen2:0, gen3:0, depth:0}],
  ['удар на полную', {gen2:0, gen3:0, hit:1}],
  ['гейт на полную', {gen2:0, gen3:0, gryzn:1}],
  ['грязь снята', {gen2:0, gen3:0, dirt:1}],
  ['всё в ноль', {gen2:0, gen3:0, pulse:0, range:0, tone:0, depth:0, hit:0}],
  ['всё на полную', {gen2:0, gen3:0, pulse:1, range:1, tone:1, depth:1, hit:1}],
];
let bed = [];
for (const [imya, iz] of nabor){
  const r = tiho(iz, 1626943591);
  const plohо = r.rms < .004;
  if (plohо) bed.push(imya);
  console.log(imya.padEnd(30), r.rms.toFixed(5).padStart(9),
    Math.round(r.f).toString().padStart(10), plohо ? '   ← ТИШИНА' : '');
}
console.log('\nПЛОЩАДКИ: палец поднимает управляющее напряжение выше питания');
for (const p of [0, .5, 1, 2, 3]){
  const pl = new Array(9).fill(0); for (let i=1;i<=8;i++) pl[i]=p/8;
  const r = tiho({gen2:0, gen3:0, pulse:.14, range:.14}, 1626943591, pl);
  console.log('  прижато', p.toFixed(1), ' скз', r.rms.toFixed(5),
    ' частота', Math.round(r.f), r.rms < .004 ? '  ← ТИШИНА' : '');
}
if (bed.length) console.log('\nмолчит при:', bed.join(' · '));
