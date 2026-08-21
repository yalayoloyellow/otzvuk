// СТЕНД УДАРА И ПЛОЩАДОК. Проверяем ровно то, ради чего всё затевалось:
// удар не ДОБАВЛЯЕТ звук, а ВОЗМУЩАЕТ схему, и палец на площадке тянет
// частоту вниз ёмкостью тела, а не только сажает цепь сопротивлением.
//
// Мера возмущения — насколько прибор после толчка ушёл от того, каким он был
// бы без толчка. Считается по ОДНОЙ И ТОЙ ЖЕ сборке с одним и тем же
// состоянием: два прогона, в одном бьём, в другом нет.
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

function прогон(seed, событие, сек = 2){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:БАЗА}});
  const n = 128, bl = Math.round(48000 * сек / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  const след = [];
  for (let b = 0; b < bl; b++){
    if (b === Math.round(bl * .5) && событие) событие(c);
    c.process([[]], [[L, R]]);
    if (b >= bl * .5) след.push(...L);
  }
  return {след, f: c.pr.osn.f};
}

// Расхождение двух следов: скз разности к скз самого следа.
function расхождение(a, b){
  let d = 0, s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++){ const r = a[i] - b[i]; d += r * r; s += a[i] * a[i]; }
  return Math.sqrt(d / (s || 1e-12));
}

const СЕМЕНА = [1626943591, 139297718, 3016926094, 1745968737, 2850544998];

console.log('УДАР ПО КОРПУСУ — насколько прибор ушёл от себя же без удара');
console.log('сборка          расхождение   частота до → после');
for (const s of СЕМЕНА){
  const тихо = прогон(s, null);
  const бей  = прогон(s, c => c.pr.bey(1));
  console.log(String(s).padEnd(14) +
    (расхождение(тихо.след, бей.след) * 100).toFixed(0).padStart(9) + '%' +
    ('   ' + Math.round(тихо.f) + ' → ' + Math.round(бей.f) + ' Гц').padStart(22));
}

console.log('\nПАЛЕЦ НА ПЛОЩАДКЕ — тянет ли ёмкость тела частоту вниз');
console.log('сборка          без пальца   с пальцем   сдвиг');
for (const s of СЕМЕНА){
  const без = прогон(s, null, 3);
  const с   = прогон(s, c => c.port.onmessage({data:{t:'pads',
                 v:[0,1,0,0,0,0,0,0,0]}}), 3);
  const сдв = (с.f / без.f - 1) * 100;
  console.log(String(s).padEnd(14) + Math.round(без.f).toString().padStart(9) + ' Гц' +
    Math.round(с.f).toString().padStart(11) + ' Гц' +
    (сдв.toFixed(1) + '%').padStart(9));
}
