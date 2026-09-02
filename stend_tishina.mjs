// ОХОТА НА ТИШИНУ. Жалоба: «звук иногда пропадает». Перебор настроек в поиске
// сочетания, при которых прибор замолкает или почти замолкает. Поиск не наугад:
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
const B = {sway:.55, depth:.75, gryzn:0, golos:0, petlya:0, kuda:0, mix:0, zhat:0, drive:.15,
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
console.log('ПОИСК ПО РУЧКАМ, один генератор (как на снимке)');
console.log('настройка                        скз      частота ген1');
const nabor = [
  ['как на снимке', {gryzn:.3, sway:.42}],
  ['импульс в ноль', {gen3:0}],
  ['импульс на полную', {gen3:0}],
  ['диапазон в ноль', {gen3:0}],
  ['диапазон на полную', {gen3:0}],
  ['характер в ноль', {gen3:0}],
  ['размах в ноль', {depth:0}],
  ['удар на полную', {gen3:0}],
  ['гейт на полную', {gryzn:1}],
  ['грязь снята', {dirt:1}],
  ['всё в ноль', {depth:0}],
  ['всё на полную', {depth:1}],
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
  const r = tiho({gen3:0}, 1626943591, pl);
  console.log('  прижато', p.toFixed(1), ' скз', r.rms.toFixed(5),
    ' частота', Math.round(r.f), r.rms < .004 ? '  ← ТИШИНА' : '');
}
if (bed.length) console.log('\nмолчит при:', bed.join(' · '));
