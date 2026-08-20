// Замер НАГРУЗКИ. Сколько машинного времени уходит на блок из 128 отсчётов
// при 48 кГц. Бюджет звукового потока — 2.667 мс на блок; всё, что выше,
// это срыв.
//
// Абсолютное число на занятой машине врёт: соседние процессы, планировщик,
// частота ядра. Поэтому, если дать вторым доводом старое ядро, оба
// считаются ВПЕРЕМЕЖКУ в одном процессе, заход за заходом. Помеха тогда
// действует на оба одинаково, и отношение остаётся верным, даже когда сами
// числа плывут.
//
//   node stend_nagruzka.mjs [старое.js]
import {readFileSync} from 'fs';

const BLOK = 2.667;   // мс бюджета на 128 отсчётов при 48 кГц
const SEK = 2, ZAHODOV = 3;

function zavesti(put){
  globalThis.sampleRate = 48000;
  let K = null;
  globalThis.registerProcessor = (n, k) => K = k;
  globalThis.AudioWorkletProcessor = class {
    constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                                 get onmessage(){return this._f} }; }
  };
  new Function(readFileSync(put, 'utf8'))();
  return K;
}

function gotov(K, nastr, seed = 1626943591){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:nastr}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  for (let b = 0; b < 400; b++) c.process([[]], [[L, R]]);   // прогрев
  return {c, L, R, blokov: Math.round(48000 * SEK / 128)};
}
function zahod(g){
  const t0 = process.hrtime.bigint();
  for (let b = 0; b < g.blokov; b++) g.c.process([[]], [[g.L, g.R]]);
  return Number(process.hrtime.bigint() - t0) / 1e6 / g.blokov;
}

const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15,
              drift:0, range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0,
              link:0, dirt:0, petlya:0, kuda:0, naruzhu:0};

const REZHIMY = [
  ['покой (два генератора)',    {}],
  ['все три генератора',        {gen3:1}],
  ['три + связь + грязь',       {gen3:1, link:1, dirt:1}],
  ['верх диапазона (писк)',     {gen3:1, range:1}],
  ['гейт на полную',            {gen3:1, gryzn:1}],
  ['голос наружу',              {gen3:1, ist:1, naruzhu:.7, golos:.5}],
  ['пост на полную',            {gen3:1, zhat:1, drive:.8}],
  ['всё разом',                 {gen3:1, link:1, dirt:1, gryzn:1, zhat:1,
                                 drive:.8, ist:1, naruzhu:.7, golos:.5}],
];

const staroe = process.argv[2];
const Kn = zavesti('./chaos.worklet.js');
const Ks = staroe ? zavesti(staroe) : null;

console.log(staroe ? 'РЕЖИМ                          мс/блок   бюджета    было   быстрее в'
                   : 'РЕЖИМ                          мс/блок   бюджета');
let hud = 0, sumN = 0, sumS = 0;
for (const [imya, izm] of REZHIMY){
  const nastr = {...BAZA, ...izm};
  const gn = gotov(Kn, nastr), gs = Ks ? gotov(Ks, nastr) : null;
  let mn = Infinity, ms = Infinity;
  // Вперемежку: заход нового, заход старого, и так пять раз. Берём лучший —
  // шум измерения бывает только вверх, и минимум есть настоящая цена.
  for (let z = 0; z < ZAHODOV; z++){
    const a = zahod(gn); if (a < mn) mn = a;
    if (gs){ const b = zahod(gs); if (b < ms) ms = b; }
  }
  if (mn > hud) hud = mn;
  sumN += mn; sumS += ms;
  console.log(imya.padEnd(30) + mn.toFixed(3).padStart(7) +
              ((100 * mn / BLOK).toFixed(0) + '%').padStart(8) +
              (gs ? ms.toFixed(3).padStart(8) + ('×' + (ms/mn).toFixed(2)).padStart(12) : ''));
}
console.log('\nхудший режим:', (100*hud/BLOK).toFixed(0) + '% бюджета,',
            'запас по вкладкам ×' + (BLOK/hud).toFixed(1));
if (Ks) console.log('в среднем быстрее в', (sumS/sumN).toFixed(2), 'раза');
