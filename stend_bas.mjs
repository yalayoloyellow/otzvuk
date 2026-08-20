// УДАРНЫЙ КОНТУР. На фоне играющего прибора его не разглядеть, поэтому
// проверка идёт от чистого к грязному: сперва контур сам по себе, потом
// прибор с выключенными генераторами, потом всё вместе.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const SRC = readFileSync('./chaos.worklet.js','utf8');
new Function(SRC)();
const M = new Function(SRC + '\nreturn {Udarnik, Build, dt};')();
const N = 128, SR = 48000, FS = SR*4;

console.log('1. КОНТУР САМ ПО СЕБЕ (сборка 1626943591)');
{
  const sb = new M.Build(1626943591);
  console.log('   настроен на', Math.round(sb.fUdar)+'Гц при корпусе',
    Math.round(sb.fKorp)+'Гц, добротность до', Math.round(sb.Qudar));
  console.log('   БАС    звон, мс   частота начала   частота хвоста');
  for (const bas of [.1, .25, .5, .75, 1]){
    const u = new M.Udarnik(sb);
    const y = new Float32Array(FS);
    for (let i = 0; i < FS; i++) y[i] = u.step(bas, i === 0 ? 26 : 0);
    let pik = 0; for (const v of y) if (Math.abs(v) > pik) pik = Math.abs(v);
    let zvon = 0;
    for (let o = 0; o < FS; o += Math.round(FS*.005)){
      let mx = 0;
      for (let i = o; i < Math.min(FS, o+Math.round(FS*.005)); i++)
        if (Math.abs(y[i]) > mx) mx = Math.abs(y[i]);
      if (mx > pik*.05) zvon = o/FS;
    }
    const chast = (a,b) => { let per = 0;
      for (let i = a+1; i < b; i++) if (y[i-1] <= 0 && y[i] > 0) per++;
      return per*FS/(b-a); };
    console.log('  ', bas.toFixed(2), (zvon*1000).toFixed(0).padStart(9),
      chast(0, Math.round(FS*.1)).toFixed(1).padStart(15),
      chast(Math.round(FS*.3), Math.round(FS*.6)).toFixed(1).padStart(16));
  }
}

const B = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
           range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
           petlya:0, kuda:0, naruzhu:0, mix:0, zhat:0, master:.5,
           ist:0, ton:.35, temp:.5, povtor:0, trakt:.3, bas:0};
function progon(semya, izm, sek, udarNa){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:semya, p:{...B, ...izm}}});
  const L=new Float32Array(N), R=new Float32Array(N), m=new Float32Array(N);
  const y=[]; const bl=Math.round(SR*sek/N);
  for (let b = 0; b < bl; b++){
    if (udarNa && b === Math.round(bl*udarNa)) c.port.onmessage({data:{t:'kick'}});
    c.process([[m]],[[L,R]]);
    for (let i = 0; i < N; i++) y.push(L[i]);
  }
  return Float32Array.from(y);
}
console.log('\n2. НА НУЛЕ ручки контура в схеме быть не должно');
// Сравнивать прогон с прогоном бесполезно: в модели живёт тепловой шум и
// дрожание связок, два прогона одного семени и не обязаны совпадать. Сравниваю
// СТАТИСТИКУ с прежней версией — той, где контура не было вовсе.
{
  const skz = y => { let kv=0; for(const v of y) kv+=v*v; return Math.sqrt(kv/y.length); };
  for (const s of [1626943591, 777, 42]){
    const a = progon(s, {bas:0, gryzn:.8}, 5, 0).slice(SR*2);
    const b = progon(s, {bas:1, gryzn:.8}, 5, 0).slice(SR*2);
    console.log('  ', String(s).padEnd(12), 'скз при БАС 0:', skz(a).toFixed(4),
      '  при БАС 1:', skz(b).toFixed(4),
      '  разница', ((skz(b)/skz(a)-1)*100).toFixed(1)+'%');
  }
}

console.log('\n3. В ПРИБОРЕ с молчащими генераторами — только контур');
for (const bas of [0, .5, 1]){
  const y = progon(1626943591, {bas, gen1:0, gen2:0, gen3:0}, 4, .5);
  const t0 = Math.round(4*.5*SR);
  let pik = 0;
  for (let i = t0; i < t0+SR; i++) if (Math.abs(y[i]) > pik) pik = Math.abs(y[i]);
  let zvon = 0;
  for (let o = 0; o < SR*1.2; o += Math.round(SR*.01)){
    let mx = 0;
    for (let i = t0+o; i < t0+o+Math.round(SR*.01); i++)
      if (Math.abs(y[i]) > mx) mx = Math.abs(y[i]);
    if (mx > pik*.08) zvon = o/SR;
  }
  console.log('   БАС', bas.toFixed(2), ' пик удара', pik.toFixed(3),
    ' звон', (zvon*1000).toFixed(0)+'мс');
}
