// ЧТО ДЕЛАЕТ КАЖДАЯ ПЛОЩАДКА И КАЖДАЯ ПАРА.
//
// Мера — насколько прибор ушёл ОТ СЕБЯ ЖЕ нетронутого: та же сборка, то же
// состояние, два прогона. Расхождение около нуля значит «палец не заметен»,
// около ста процентов — «пошло совсем другое».
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js', 'utf8'))();

const БАЗА = {sway:.55, depth:.75, gryzn:0, golos:0, petlya:0, kuda:0, zhat:0,
              drive:.15, master:1, pit:1, set:0};
const ИМЕНА = ['', 'узел 1', 'узел 2', 'узел 3', 'выход эл.', 'качели',
               'накал', 'питание', 'общий'];

// Расхождение следов в хаосе бесполезно: любые два прогона разъезжаются
// полностью от любой мелочи. Меряем УСТОЙЧИВЫЕ признаки — среднюю частоту за
// окно, долю времени в срыве и громкость. Их хаос не размывает.
function прогон(seed, площадки, сек = 4, изм = {}){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:{...БАЗА, ...изм}}});
  const n = 128, bl = Math.round(48000 * сек / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  let kv = 0, cnt = 0, tihih = 0, blokov = 0;
  const sf3 = [0,0,0], sn3 = [0,0,0];
  for (let b = 0; b < bl; b++){
    if (b === Math.round(bl * .35) && площадки){
      const v = new Array(9).fill(0);
      for (const i of площадки) v[i] = 1;
      c.port.onmessage({data:{t:'pads', v}});
    }
    c.process([[]], [[L, R]]);
    if (b < bl * .35) continue;
    // Смотрим ВСЕ ТРИ генератора: палец на втором узле первый не трогает,
    // и метрика по одному ядру показывала бы немоту там, где её нет.
    for (let g = 0; g < 3; g++){
      const f = c.pr.cells[g].f;
      if (f > 0 && f < 20000){ sf3[g] += f; sn3[g]++; }
    }
    let kvb = 0;
    for (let i = 0; i < n; i++){ kv += L[i]*L[i]; kvb += L[i]*L[i]; cnt++; }
    // блок считается провалом, если он тише сотой доли от полного размаха
    if (Math.sqrt(kvb / n) < .004) tihih++;
    blokov++;
  }
  return {скз: Math.sqrt(kv / cnt), дыры: tihih / blokov,
          f3: sf3.map((x, i) => sn3[i] ? x / sn3[i] : 0)};
}

const СЕМЯ = 139297718;
const тихо = прогон(СЕМЯ, null);

const Ч = r => r.f3.map(x => Math.round(x).toString().padStart(5)).join('');
console.log('нетронутый: ' + Ч(тихо).trim() + ' Гц\n');
console.log('ОДНА ПЛОЩАДКА              ген1  ген2  ген3  громк.  дыры');
for (let i = 1; i <= 8; i++){
  const r = прогон(СЕМЯ, [i]);
  console.log((i + '  ' + ИМЕНА[i]).padEnd(25) + Ч(r) +
    ((r.скз/тихо.скз).toFixed(2) + '×').padStart(8) +
    ((r.дыры*100).toFixed(0) + '%').padStart(6));
}

console.log('\nПАРЫ — те, где интереснее всего');
const ПАРЫ = [[1,8],[2,8],[3,8],[5,8],[1,2],[1,3],[2,3],[1,4],[1,6],[1,7],[5,1],[1,2,3]];
for (const п of ПАРЫ){
  const r = прогон(СЕМЯ, п);
  console.log(п.map(i => ИМЕНА[i]).join('+').padEnd(25) + Ч(r) +
    ((r.скз/тихо.скз).toFixed(2) + '×').padStart(8) +
    ((r.дыры*100).toFixed(0) + '%').padStart(6));
}

// Меняет ли палец ВЕСЬ прибор или только свой генератор — зависит от
// связи генераторов. Постоянной связи (тумблер link) больше нет — вырезана
// по замеру как сварка в унисон; связь осталась сетке импульсом. Проверяем
// при трёх генераторах и при разводе.
for (const [имя, изм] of [['три генератора', {gen3:1}],
                          ['три + развод', {gen3:1}]]){
  const т = прогон(СЕМЯ, null, 4, изм);
  console.log('\n' + имя + ' — нетронутый: ' + Ч(т).trim());
  console.log('площадка                   ген1  ген2  ген3  громк.  дыры');
  for (const п of [[1],[2],[5],[7],[1,8],[1,2]]){
    const r = прогон(СЕМЯ, п, 4, изм);
    console.log(п.map(i => ИМЕНА[i]).join('+').padEnd(25) + Ч(r) +
      ((r.скз/т.скз).toFixed(2) + '×').padStart(8) +
      ((r.дыры*100).toFixed(0) + '%').padStart(6));
  }
}

console.log('\nДЕРЖАТЬ ДОЛЬШЕ — кожа потеет (узел 1 + общий)');
for (const сек of [1, 2, 4, 8]){
  const т = прогон(СЕМЯ, null, сек);
  const r = прогон(СЕМЯ, [1,8], сек);
  console.log(('через ' + сек + ' с').padEnd(25) + Ч(r) +
    ((r.скз/т.скз).toFixed(2) + '×').padStart(8) +
    ((r.дыры*100).toFixed(0) + '%').padStart(6));
}
