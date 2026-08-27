// СЧЁТ ПЕРЕД ДЕЛОМ: могут ли площадки работать вообще.
//
// Условие срыва выводится, а не подбирается. Узел заряжается к пределу
//
//     Vпред = Vпит · Rп / (Rп + Rз)
//
// где Rз — сопротивление цепи заряда, Rп — сопротивление пальца на землю.
// Генератор продолжает колебаться, только если предел выше верхнего порога:
//
//     Rп / (Rп + Rз) > вверх    ⇔    Rз > Rп · (1 − вверх) / вверх
//
// То есть при заданном пальце срыв наступает, когда цепь заряда превысила
//
//     Rкрит = Rп · (1 − вверх) / вверх
//
// Значит вопрос один: БЫВАЕТ ЛИ у нас Rз выше этого, и как часто.
//
// Отдельно считаем случай «палец на весу»: там путь ёмкостный, а ёмкость
// постоянного тока не проводит вовсе — предел не сдвигается, сорвать нельзя
// ни при каком размахе. Это не оценка, а следствие.
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

const КОЖА = 2e6;          // два пальца: две кожи по мегаому последовательно

function прогон(seed, изм, сек = 6){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:{...БАЗА, ...изм}}});
  const n = 128, bl = Math.round(48000 * сек / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  const R0 = [];
  let периодов = 0, прошлыйU = 0, качелей = 0;
  for (let b = 0; b < bl; b++){
    c.process([[]], [[L, R]]);
    if (b < bl * .25) continue;
    R0.push(c.pr.Rzar[0]);
    const u = c.pr.swing.u;
    if (прошлыйU < .5 && u >= .5) качелей++;
    прошлыйU = u;
  }
  R0.sort((a, b) => a - b);
  const вверх = c.pr.sb.vt[0].vverh;
  const Rкрит = КОЖА * (1 - вверх) / вверх;
  const выше = R0.filter(r => r > Rкрит).length / R0.length;
  return {
    мин: R0[0], сер: R0[R0.length >> 1], макс: R0[R0.length - 1],
    вверх, Rкрит, доля: выше,
    качели: качелей / (R0.length * n / 48000),
    C: c.pr.sb.C[0],
  };
}

const М = r => r >= 1e6 ? (r / 1e6).toFixed(2) + 'М' : Math.round(r / 1e3) + 'к';

// Доля цикла, на которой палец данного сопротивления срывает генератор.
function долиПоКоже(seed, изм, кожи){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:{...БАЗА, ...изм}}});
  const n = 128, bl = Math.round(48000 * 6 / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  const R0 = [];
  for (let b = 0; b < bl; b++){
    c.process([[]], [[L, R]]);
    if (b >= bl * .25) R0.push(c.pr.Rzar[0]);
  }
  const вверх = c.pr.sb.vt[0].vverh;
  return кожи.map(Rп => {
    const Rкрит = Rп * (1 - вверх) / вверх;
    return R0.filter(r => r > Rкрит).length / R0.length;
  });
}

console.log('СОПРОТИВЛЕНИЕ ЦЕПИ ЗАРЯДА ЗА ЦИКЛ И КУДА ПОПАДАЕТ ПАЛЕЦ');
console.log('палец двумя контактами: 2 МОм\n');
console.log('сборка          порог   Rкрит     Rз: мин / серед / макс     срыв, % времени');
const СЕМЕНА = [1626943591, 139297718, 3016926094, 1745968737, 2850544998];
for (const s of СЕМЕНА){
  const r = прогон(s, {});
  console.log(String(s).padEnd(14) + r.вверх.toFixed(3).padStart(6) +
    М(r.Rкрит).padStart(9) +
    ('   ' + М(r.мин) + ' / ' + М(r.сер) + ' / ' + М(r.макс)).padEnd(28) +
    (r.доля * 100).toFixed(0).padStart(8) + '%');
}

console.log('\nОТ ЧЕГО ЗАВИСИТ — размах качелей и рабочая точка (сборка 139297718)');
console.log('настройка                  Rз: мин / серед / макс     срыв, %   качели, Гц');
const ВАРИАНТЫ = [
  ['по умолчанию',            {}],
  ['размах в ноль',           {depth:0}],
  ['размах на полную',        {depth:1}],
  // Строки «характер вниз/вверх» убраны: TONE переехал в зерно, ручки нет,
  // и стенд крутил бы мёртвый параметр, печатая умолчание под двумя именами.
  ['качели медленно',         {sway:0}],
  ['качели быстро',           {sway:1}],
  ['качели быстро, размах 1', {sway:1, depth:1}],
];
for (const [имя, изм] of ВАРИАНТЫ){
  const r = прогон(139297718, изм);
  console.log(имя.padEnd(26) +
    ('  ' + М(r.мин) + ' / ' + М(r.сер) + ' / ' + М(r.макс)).padEnd(28) +
    (r.доля * 100).toFixed(0).padStart(6) + '%' +
    r.качели.toFixed(1).padStart(12));
}

const КОЖИ = [.3e6, .5e6, .7e6, 1e6, 1.4e6, 2e6, 3e6, 5e6];
console.log('\nГЛАВНОЕ ЧИСЛО: доля цикла со срывом в зависимости от сопротивления пальца');
console.log('сборка        ' + КОЖИ.map(r => М(r).padStart(7)).join(''));
for (const s2 of СЕМЕНА){
  const d = долиПоКоже(s2, {}, КОЖИ);
  console.log(String(s2).padEnd(14) + d.map(x => ((x*100).toFixed(0)+'%').padStart(7)).join(''));
}
console.log('\nто же на разных настройках (сборка 139297718)');
for (const [имя, изм] of ВАРИАНТЫ.slice(0, 5)){
  const d = долиПоКоже(139297718, изм, КОЖИ);
  console.log(имя.padEnd(14) + d.map(x => ((x*100).toFixed(0)+'%').padStart(7)).join(''));
}
