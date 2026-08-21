// УДАР ПО КОРПУСУ: что он делает и слышно ли это.
//
// Три пути, и каждый меряется отдельно:
//   звон платы   керамика бросает заряд в узлы — схема сбивается с шага
//   движок       пятно контакта подскакивает — сопротивление цепи прыгает
//   батарея      пружина держателя отпускает контакт — питание пропадает
//
// Мера — огибающая по десятимиллисекундным окнам вокруг момента удара, и
// доля ударов, на которых батарея правда отвалилась.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js', 'utf8'))();

const БАЗА = {volt:.5, bak:.5, sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35,
              spread:.15, drift:0, range:.5, gryzn:0, golos:0, gen1:1, gen2:1,
              gen3:0, link:0, dirt:0, petlya:0, kuda:0, naruzhu:0, zhat:0,
              drive:.15, master:1, pit:1, set:0};

function удар(seed, бить = true, кратко = false){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:БАЗА}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  // Окно в миллисекунду: обрыв контакта длится единицы миллисекунд, и
  // десятимиллисекундное окно его просто усредняло в ничто.
  const окно = 1;
  const ог = [], пит = [];
  const всего = Math.round(48000 * (кратко ? .35 : 1.2) / n), когда = Math.round(всего * .5);
  let kv = 0, k = 0, шаг = 0, Vmin = 1e9, рвало = false;
  for (let b = 0; b < всего; b++){
    if (b === когда && бить) c.port.onmessage({data:{t:'kick'}});
    c.process([[]], [[L, R]]);
    // Обрыв контакта живёт в множителе питания, до батареи он не доходит:
    // смотреть надо сюда, а не на bat.Vl.
    if (b >= когда && c.kont.dreb > 0) рвало = true;
    for (let i = 0; i < n; i++){ kv += L[i]*L[i]; k++; }
    if (b >= когда) Vmin = Math.min(Vmin, c.pr.bat.Vl);
    if (++шаг >= окно){ ог.push({t:(b - когда) * n / 48000, s:Math.sqrt(kv/k)});
                        kv = 0; k = 0; шаг = 0; }
  }
  return {ог, Vmin, рвало, EMF:c.pr.sb.EMF};
}

const СЕМЯ = 139297718;
const тихо = удар(СЕМЯ, false);
const ровно = тихо.ог.filter(x => x.t > -.2 && x.t < 0).reduce((a,b)=>a+b.s,0) / 20;

console.log('ОГИБАЮЩАЯ ВОКРУГ УДАРА (сборка ' + СЕМЯ + ')');
console.log('  мс     дБ от ровного');
const бит = удар(СЕМЯ, true);
for (const x of бит.ог){
  const мс = Math.round(x.t * 1000);
  if (мс < -12 || мс > 60) continue;
  const дб = 20 * Math.log10(Math.max(1e-6, x.s / ровно));
  console.log(String(мс).padStart(5) + дб.toFixed(1).padStart(10) + '  ' +
              '█'.repeat(Math.max(0, Math.round((дб + 40) / 2))));
}

console.log('\nСКОЛЬКО УДАРОВ РВЁТ ПИТАНИЕ (по сорок на сборку)');
for (const s of [1626943591, 139297718, 3016926094]){
  let рвало = 0;
  for (let i = 0; i < 40; i++){
    const r = удар(s, true, true);
    if (r.рвало) рвало++;
  }
  console.log(String(s).padEnd(14) + (Math.round(рвало/40*100) + '%').padStart(5));
}
