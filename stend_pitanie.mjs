// СТЕНД ВЫКЛЮЧАТЕЛЯ ПИТАНИЯ. Проверяем, что выключение — это РАЗРЯД, а не
// обрыв: прибор должен оседать по громкости и по высоте, а не смолкать
// щелчком. И что включение поднимает его обратно.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js', 'utf8'))();

const БАЗА = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15,
              drift:0, range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0,
              link:0, dirt:0, petlya:0, kuda:0, naruzhu:0,
              zhat:0, drive:.15, master:1, pit:1};

// Ведём прибор во времени и снимаем срез каждые десять миллисекунд.
function хроника(seed, события){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:БАЗА}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  const срез = Math.round(48000 * .01 / n);          // десять миллисекунд
  const ряд = [];
  let kv = 0, cnt = 0, шаг = 0;
  const всего = Math.round(48000 * 4.6 / n);
  for (let b = 0; b < всего; b++){
    const t = b * n / 48000;
    for (const [когда, что] of события)
      if (!что.сделано && t >= когда){ что.сделано = true;
        c.port.onmessage({data:{t:'p', v:{...БАЗА, ...что.v}}}); }
    c.process([[]], [[L, R]]);
    for (let i = 0; i < n; i++){ kv += L[i] * L[i]; cnt++; }
    if (++шаг >= срез){
      ряд.push({t, скз: Math.sqrt(kv / cnt), V: c.pr.bat.Vl});
      kv = 0; cnt = 0; шаг = 0;
    }
  }
  return ряд;
}

const события = [[.5, {v:{pit:0}}], [4.0, {v:{pit:1}}]];
const ряд = хроника(139297718, события);
console.log('время, с    питание, В    уровень, дБ от начального');
const нач = ряд[20].скз;
for (const r of ряд){
  const мс = Math.round(r.t * 1000);
  // Смотрим в упор на оба перехода, между ними ничего не происходит.
  if (мс < 440) continue;
  if (мс > 560 && мс < 3900 && мс % 200 > 12) continue;
  if (мс > 4200) continue;
  const дб = 20 * Math.log10(Math.max(1e-7, r.скз / нач));
  const полоса = '█'.repeat(Math.max(0, Math.round((дб + 60) / 3)));
  console.log(String(мс).padStart(7) + r.V.toFixed(2).padStart(12) +
              дб.toFixed(1).padStart(10) + '  ' + полоса);
}
