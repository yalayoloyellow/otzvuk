// Замер УРОВНЕЙ: насколько сам прибор громче или тише того, что добавляют
// петля и голос наружу. Ничего не чинится — только мерится, чтобы разговор шёл
// по числам.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const SRC = readFileSync('./chaos.worklet.js', 'utf8');
new Function(SRC)();

function progon(nastr, sek = 3, seed = 1626943591){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:nastr}});
  const n = 128, blokov = Math.round(48000 * sek / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  let pik = 0, kv = 0, cnt = 0;
  for (let b = 0; b < blokov; b++){
    c.process([[]], [[L, R]]);
    if (b < blokov * .15) continue;             // переходный процесс не считаем
    for (let i = 0; i < n; i++){
      const a = Math.abs(L[i]); if (a > pik) pik = a;
      kv += L[i] * L[i]; cnt++;
    }
  }
  return {pik, rms: Math.sqrt(kv / cnt)};
}

const BAZA = {sway:.55, depth:.75, gryzn:0, golos:0, petlya:0, kuda:0};

console.log('НАСТРОЙКА                         пик      скз');
const varianty = [
  ['по умолчанию',            {}],
  ['гейт на полную',          {gryzn:1}],
  ['все три генератора',      {gen3:1}],
  ['низ диапазона (рокот)',   {range:0}],
  ['верх диапазона (писк)',   {range:1}],
  ['размах в ноль',           {depth:0}],
  ['удар на полную',          {gryzn:.8}],
  ['грязь снята',             {dirt:1}],
];
const ur = {};
for (const [imya, izm] of varianty){
  const r = progon({...BAZA, ...izm});
  ur[imya] = r;
  console.log(imya.padEnd(32), r.pik.toFixed(3).padStart(7), r.rms.toFixed(3).padStart(8));
}
const vse = Object.values(ur);
const srPik = vse.reduce((a,b)=>a+b.pik,0)/vse.length;
const srRms = vse.reduce((a,b)=>a+b.rms,0)/vse.length;
console.log('\nсредний пик прибора', srPik.toFixed(3), ' средний скз', srRms.toFixed(3));
console.log('петля и голос идут ветвями суммирующего узла — своего предела');
console.log('у них больше нет: их держит тот же каскад, что и прибор.');
