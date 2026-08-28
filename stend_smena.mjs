// СТЕНД СМЕНЫ СЕМЯН. Случайные пары сборок × случайные ручки, каждый случай
// в своём процессе с таймаутом: зависание ловится как таймаут, падение — как
// код выхода, NaN — по выходу. Этот перебор нашёл «всё зависло при плавном
// переходе» за один заход из тридцати двух случаев: ведение тянуло nGen
// дробным, cells[1.37] не существует, воркл умирал молча. Семь падений — у
// всех семи включён BEND; такой узор руками не составить, только перебором.
//
//   node stend_smena.mjs            — 32 случайных случая, 8 вширь
//   node stend_smena.mjs 96         — больше случаев
//   node stend_smena.mjs А Б РУЧКИ  — один случай (внутренний вызов)
import {readFileSync} from 'fs';
import {spawn} from 'child_process';

const ЗДЕСЬ = new URL('.', import.meta.url).pathname;

if (process.argv.length >= 5){
  // ---- один случай: семяА семяБ ручкиJSON; молчание дольше срока = зависание
  const [,, сА, сБ, ручкиС] = process.argv;
  globalThis.sampleRate = 48000;
  globalThis.AudioWorkletProcessor = class {
    constructor(){ this.port = {postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f}}; }};
  let K = null; globalThis.registerProcessor = (n, k) => K = k;
  new Function(readFileSync(ЗДЕСЬ + 'chaos.worklet.js', 'utf8'))();
  const c = new K();
  c.port.onmessage({data: {t: 'seed', v: +сА}});
  c.port.onmessage({data: {t: 'p', v: JSON.parse(ручкиС)}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n),
        вх = new Float32Array(n);
  for (let b = 0; b < 600; b++) c.process([[вх]], [[L, R]]);
  c.port.onmessage({data: {t: 'seed', v: +сБ}});
  let плохих = 0;
  for (let b = 0; b < 9000; b++){            // 12с перехода + 12с хвоста
    c.process([[вх]], [[L, R]]);
    if (!Number.isFinite(L[0]) || !Number.isFinite(L[n-1])) плохих++;
  }
  if (c.avaria)  { console.error('авария: ' + c.avaria.split('\n')[0]); process.exit(4); }
  if (плохих)    { console.error('NaN блоков: ' + плохих); process.exit(2); }
  if (c.vedenie) { console.error('переход не доехал: t=' + c.vedenie.t); process.exit(3); }
  console.log('чисто');
  process.exit(0);
}

// ---- водитель
const ИМЁН = ['sving','uzor','chop','skru','kolazh','cut','krik','okras','zhat',
  'drive','master','gryzn','gnut','golos','kuda','depth','sway','ton','trakt',
  'temp','razved','slip','takt','povtor','puls'];
// Пара хозяина, на которой зависло впервые (3→2 голоса), с его ручками + BEND.
const ЕГО = {pit:1, mix:1, sving:.5, uzor:.2, chop:.15, skru:.2, kolazh:.15,
  cut:.1, krik:.35, okras:.05, zhat:.05, drive:.05, master:.3, gryzn:.3, gnut:.4};
function ручки(){
  const p = {pit: 1, mix: 1};
  for (const и of ИМЁН) if (Math.random() < .5)
    p[и] = Math.round(Math.random() * 90) / 100;
  return p;
}
const скольких = +(process.argv[2] || 32);
const дела = [[2119607415, 3904565574, ЕГО]];
for (let i = 1; i < скольких; i++)
  дела.push([(Math.random()*4294967296)>>>0, (Math.random()*4294967296)>>>0, ручки()]);
let бед = 0;
async function гон([а, б, р]){
  return new Promise(res => {
    const д = spawn(process.execPath,
      [ЗДЕСЬ + 'stend_smena.mjs', String(а), String(б), JSON.stringify(р)]);
    let вых = '';
    д.stdout.on('data', x => вых += x); д.stderr.on('data', x => вых += x);
    const таймер = setTimeout(() => { д.kill('SIGKILL'); бед++;
      console.log('ЗАВИСЛО: ' + а + ' → ' + б + ' ' + JSON.stringify(р)); res(); }, 90000);
    д.on('exit', код => { clearTimeout(таймер);
      if (код !== 0){ бед++;
        console.log('УПАЛО ('+код+'): ' + а + ' → ' + б + ' ' + JSON.stringify(р) +
                    ' · ' + вых.trim().split('\n')[0]); }
      res(); });
  });
}
const оч = [...дела];
await Promise.all(Array.from({length: 8}, async () => {
  let д; while ((д = оч.shift())) await гон(д); }));
console.log('прогнано ' + дела.length + ' · бед ' + бед +
            (бед ? ' — СМЕНА СЕМЯН ЛОМАЕТ ПРИБОР' : ' — смена семян безопасна'));
process.exit(бед ? 1 : 0);
