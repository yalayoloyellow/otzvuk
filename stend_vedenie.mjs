// ВЕДЕНИЕ НОМИНАЛОВ вместо кроссфейда. Проверяю три вещи:
//   1. приезжает ли прибор ровно в целевую сборку;
//   2. нет ли по дороге событий — разрывов формы, провалов, срывов;
//   3. похоже ли то, что получилось, на честно собранный прибор с тем семенем.
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
const M = new Function(SRC + '\nreturn {Build};')();
const SR = 48000, N = 128;
const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, dirt:0,
              petlya:0, kuda:0, mix:1, zhat:0, master:.5};
const A = 1626943591, B = 777;

const c = new K();
c.port.onmessage({data:{t:'seed', v:A, p:{...BAZA}}});
const L = new Float32Array(N), R = new Float32Array(N), m = new Float32Array(N);
const og = []; let posl = 0, razr = [], sryvNach = 0;
const bl = b => { c.process([[m]], [[L, R]]);
  let kv = 0, mx = 0;
  for (let i = 0; i < N; i++){ kv += L[i]*L[i];
    const d = Math.abs(L[i] - posl); posl = L[i]; if (d > mx) mx = d; }
  og.push(Math.sqrt(kv/N)); razr.push(mx); };
for (let b = 0; b < Math.round(SR*3/N); b++) bl(b);
const nachalo = og.length;
sryvNach = c.sryvy;
c.port.onmessage({data:{t:'seed', v:B, p:{...BAZA}}});
for (let b = 0; b < Math.round(SR*20/N); b++) bl(b);

// 1. приехали ли номиналы
const cel = new M.Build(B), zhiv = c.pr.sb;
let hudshee = 0, hudshiy = '';
for (const k in cel){
  const v = cel[k];
  if (typeof v === 'number' && v !== 0){
    const o = Math.abs(zhiv[k]/v - 1);
    if (o > hudshee){ hudshee = o; hudshiy = k; }
  }
}
console.log('1. ПРИЕХАЛИ ЛИ. Худшее расхождение с целевой сборкой:',
  (hudshee*100).toFixed(4)+'%', 'у', hudshiy);
console.log('   рисунок:', zhiv.risunok, 'нужен', cel.risunok,
            '  имя:', zhiv.imya, 'нужно', cel.imya);

// 2. события по дороге
const sgl = (a, o) => a.map((_,i) => {
  let s=0,k=0; for(let j=Math.max(0,i-o+1);j<=i;j++){ s+=a[j]*a[j]; k++; }
  return Math.sqrt(s/k); });
const ogs = sgl(og, 19);
const pokoy = ogs.slice(10, nachalo-4);
const put = ogs.slice(nachalo, nachalo + Math.round(SR*13/N));
const razmah = a => Math.max(...a)/Math.min(...a);
console.log('2. СОБЫТИЯ. Разброс огибающей в покое', razmah(pokoy).toFixed(2),
            ' по дороге', razmah(put).toFixed(2));
// Разрыв надо мерить ОТНОСИТЕЛЬНО текущей громкости: по дороге прибор
// становится вшестеро громче, и абсолютный разрыв растёт вместе с ним, ничего
// при этом не означая.
const otn = razr.map((v,i) => v / Math.max(ogs[i], 1e-6));
const rFon = Math.max(...otn.slice(10, nachalo-4));
const put2 = otn.slice(nachalo, nachalo + Math.round(SR*13/N));
const rPut = Math.max(...put2);
const gde = put2.indexOf(rPut) * N / SR;
console.log('   разрыв формы к громкости: фон', rFon.toFixed(2),
            ' по дороге', rPut.toFixed(2), '(на', gde.toFixed(1)+'с)',
            rPut > rFon*1.6 ? '  ← ЕСТЬ СОБЫТИЕ' : '  ← событий нет');
console.log('   срывов за переход:', c.sryvy - sryvNach);

// 3. похоже ли на честно собранный
const chest = new K();
chest.port.onmessage({data:{t:'seed', v:B, p:{...BAZA, mix:0}}});
let kv1=0,kv2=0,n1=0;
for (let b = 0; b < Math.round(SR*6/N); b++){
  chest.process([[m]], [[L, R]]);
  if (b > Math.round(SR*2/N)) for (let i=0;i<N;i++){ kv1 += L[i]*L[i]; n1++; }
}
for (let b = 0; b < Math.round(SR*4/N); b++){
  c.process([[m]], [[L, R]]);
  if (b > Math.round(SR*1/N)) for (let i=0;i<N;i++) kv2 += L[i]*L[i];
}
console.log('3. ПОХОЖЕ ЛИ. скз честно собранного', Math.sqrt(kv1/n1).toFixed(4),
            ' приехавшего', Math.sqrt(kv2/(n1*3/4)).toFixed(4));
