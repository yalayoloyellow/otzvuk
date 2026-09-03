// СТЕНД: СЕТЬ ВЕРЕТЕНА ПЕРЕЖИВАЕТ ПРЕСЕТ.
//
// Пресет писал семя, ручки, тумблеры и текст — и молчал про сеть. Сеть при
// этом живёт в ядре и решает звук: нити смещают ручки, а ШВЫ вписываются в
// сборку насовсем. Сохранил звук, свитый веретеном, вернулся — звук другой.
//
// Проверяется ровно это: свить сеть → снять снимок → пересобрать прибор с
// нуля → вернуть снимок → сеть та же и сборка та же.
//
//   node stend_vite_preset.mjs
import {readFileSync} from 'fs';

globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = {отдано: [],
    postMessage(m){ this.отдано.push(m); },
    set onmessage(f){ this._f = f }, get onmessage(){ return this._f }}; }};
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
new Function(readFileSync(new URL('.', import.meta.url).pathname +
                          'chaos.worklet.js', 'utf8'))();

const N = 128, L = new Float32Array(N), R = new Float32Array(N),
      вх = new Float32Array(N);
const гони = (c, блоков) => { for (let b = 0; b < блоков; b++) c.process([[вх]], [[L, R]]); };

// Сеть решает только при движении курсора: без заряда она стоит на месте.
function свивай(c, заходов){
  for (let i = 0; i < заходов; i++){
    const дв = [];
    for (let j = 0; j < 64; j++) дв.push((i * 977 + j * 31) % 1000);
    c.port.onmessage({data: {t: 'vite', d: дв}});
    гони(c, 40);
  }
}

function снимок(c){
  c.port.отдано.length = 0;
  c.port.onmessage({data: {t: 'vite_day'}});
  const м = c.port.отдано.find(x => x && x.t === 'vite_sost');
  return м && м.v;
}

// ---- свиваем сеть на первом приборе
const СЕМЯ = 1626943591;
const a = new K();
a.port.onmessage({data: {t: 'seed', v: СЕМЯ}});
a.port.onmessage({data: {t: 'p', v: {pit: 1, mix: 1, vite: 1, gnut: .4, sving: .5}}});
гони(a, 200);
свивай(a, 220);

const был = снимок(a);
if (!был){ console.error('снимок не пришёл вовсе'); process.exit(1); }

const живых = был.cel.filter(x => x > 0).length;
const швов  = был.mvid.filter(x => x >= 0).length;
console.log(`свито: живых нитей ${живых}, швов в работе ${швов}, швов за жизнь ${был.shvov}`);
if (живых === 0 && был.shvov === 0){
  console.error('сеть не свилась — проверять нечего'); process.exit(1);
}

// ---- второй прибор: то же семя, те же ручки, но сети нет
const b = new K();
b.port.onmessage({data: {t: 'seed', v: СЕМЯ}});
b.port.onmessage({data: {t: 'p', v: {pit: 1, mix: 1, vite: 1, gnut: .4, sving: .5}}});
гони(b, 200);
const чистый = снимок(b);

// ---- возвращаем снимок и сверяем
b.port.onmessage({data: {t: 'vite_vstav', v: был}});
const стал = снимок(b);

let бед = 0;
const сверь = (имя, п, н) => {
  if (Array.isArray(п)){
    const разошлось = п.reduce((s, v, i) => s + (Math.abs(v - н[i]) > 1e-6 ? 1 : 0), 0);
    if (разошлось){ console.log(`  РАЗОШЛОСЬ ${имя}: ${разошлось} из ${п.length}`); бед++; }
  } else if (Math.abs(п - н) > 1e-9){
    console.log(`  РАЗОШЛОСЬ ${имя}: ${п} против ${н}`); бед++;
  }
};

console.log('\n== сеть после возврата ==');
for (const k of ['n','shvov','ist','pr','meta','gl','iner','kr','kv','sost',
                 'kvzn','zhiv','cel','mt','sm','mvid','mind','mtek','mcel','mk','mzhdet'])
  сверь(k, был[k], стал[k]);

console.log('== сборка после возврата ==');
for (const k of ['Rvhod','ves','razv','razvM','Rperem','risunok',
                 'zTone','zTilt','zRange','zVolt','zSag'])
  сверь('sborka.' + k, был.sborka[k], стал.sborka[k]);

// Контроль: до возврата сборка ДОЛЖНА была отличаться, иначе тест пустой.
let отличий = 0;
for (const k of ['Rvhod','ves','razv','razvM']){
  const п = был.sborka[k], ч = чистый.sborka[k];
  отличий += п.reduce((s, v, i) => s + (Math.abs(v - ч[i]) > 1e-9 ? 1 : 0), 0);
}
for (const k of ['Rperem','risunok','zTone','zTilt','zRange','zVolt','zSag'])
  if (Math.abs(был.sborka[k] - чистый.sborka[k]) > 1e-9) отличий++;
const нитейБыло = чистый.cel.filter(x => x > 0).length;

console.log(`\nконтроль: до возврата сборка расходилась в ${отличий} полях, ` +
            `живых нитей у чистого ${нитейБыло}`);
if (отличий === 0 && живых === нитейБыло)
  console.log('  ВНИМАНИЕ: чистый прибор и так совпал — тест ничего не доказал');

// ---- прибор после возврата обязан остаться живым
гони(b, 400);
let плохих = 0;
for (let b2 = 0; b2 < 200; b2++){
  b.process([[вх]], [[L, R]]);
  if (!Number.isFinite(L[0]) || !Number.isFinite(L[N-1])) плохих++;
}
if (b.avaria){ console.log('  АВАРИЯ: ' + String(b.avaria).split('\n')[0]); бед++; }
if (плохих){ console.log(`  NaN в ${плохих} блоках после возврата`); бед++; }

console.log(бед ? `\nбед ${бед} — СЕТЬ ПРЕСЕТ НЕ ПЕРЕЖИВАЕТ`
                : '\nбед 0 — сеть и сборка возвращаются точно');
process.exit(бед ? 1 : 0);
