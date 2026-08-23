// ДЛИНА ТРЕСКА ПОСЛЕ УДАРА. Не «слышно ли», а сколько это тянется и насколько
// густо. Треск после удара держит одна переменная — расшатанность контакта, —
// и мерить надо её последствия: сколько обрывов в секунду и какую долю
// времени прибор обесточен.
//
// Считаем прямо по срабатываниям: dreb переходит из нуля в единицу — это
// обрыв. Огибающая тут не годится, обрывы короче её окна.
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
const СЕК = 18, ОКНО = .5;

function прогон(seed){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:БАЗА}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  const всего = Math.round(48000 * SEC_ / n), когда = Math.round(48000 * .3 / n);
  const окон = Math.ceil(SEC_ / ОКНО);
  const счёт = new Int32Array(окон), рвано = new Float64Array(окон);
  let былДреб = 0, последний = -1, шаг0 = 0;
  for (let b = 0; b < всего; b++){
    if (b === когда) c.port.onmessage({data:{t:'kick'}});
    c.process([[]], [[L, R]]);
    // Блок из 128 отсчётов — но kont.step() зовётся посэмплово, а мы видим
    // только состояние на конце блока. Для частот до сотен в секунду этого
    // мало: считаем по расшатанности напрямую, а обрывы — по флагу.
    const t = (b - когда) * n / 48000;
    if (t < 0) continue;
    const w = Math.min(окон - 1, Math.floor(t / ОКНО));
    if (c.kont.dreb > 0){
      рвано[w] += n / 48000;
      if (!былДреб) { счёт[w]++; последний = t; }
      былДреб = 1;
    } else былДреб = 0;
    if (c.kont.rasshat > .001) шаг0 = t;
  }
  return {счёт, рвано, последний, доРасшат:шаг0, окон};
}
const SEC_ = СЕК;

const СЕМЕНА = [139297718, 22001, 770901, 4242424, 909091];
const окон = Math.ceil(СЕК / ОКНО);
const сум = new Float64Array(окон), дол = new Float64Array(окон);
let посл = 0, расш = 0;
for (const s of СЕМЕНА){
  const r = прогон(s);
  for (let w = 0; w < окон; w++){ сум[w] += r.счёт[w] / СЕМЕНА.length;
                                  дол[w] += r.рвано[w] / ОКНО / СЕМЕНА.length; }
  посл += r.последний / СЕМЕНА.length;
  расш += r.доРасшат / СЕМЕНА.length;
}
console.log('ТРЕСК ПОСЛЕ УДАРА — среднее по ' + СЕМЕНА.length + ' сборкам');
console.log('  окно, с   обрывов/с   доля времени в обрыве');
for (let w = 0; w < окон; w++){
  const t = (w * ОКНО).toFixed(1).padStart(6);
  if (сум[w] < .05 && w > 2 && сум[w-1] < .05) continue;
  console.log('  ' + t + '     ' + (сум[w]/ОКНО).toFixed(1).padStart(7)
              + '        ' + (дол[w]*100).toFixed(1).padStart(5) + ' %');
}
console.log('  последний обрыв: ' + посл.toFixed(2) + ' с');
console.log('  расшатанность держится: ' + расш.toFixed(2) + ' с');
