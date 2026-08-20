// МИКШИРОВАНИЕ: проверяю, что перевод между двумя приборами держит громкость
// и не рвёт форму волны, а без режима смена остаётся мгновенной.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const SR = 48000, N = 128;
const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0,
              petlya:0, kuda:0, naruzhu:0, mix:0};

function progon(mix, novoe){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:1626943591, p:{...BAZA, mix}}});
  const L = new Float32Array(N), R = new Float32Array(N);
  const og = []; let posl = 0, razr = 0, razrFon = 0;
  const blokov = Math.round(SR * 9 / N), smena = Math.round(SR * 2.5 / N);
  for (let b = 0; b < blokov; b++){
    if (b === smena) c.port.onmessage({data:{t:'seed', v:novoe.seed, p:{...BAZA, ...novoe.p, mix}}});
    c.process([[]], [[L, R]]);
    let kv = 0;
    for (let i = 0; i < N; i++){
      kv += L[i]*L[i];
      const sk = Math.abs(L[i] - posl); posl = L[i];
      if (b > blokov*.2 && b < smena-2){ if (sk > razrFon) razrFon = sk; }
      if (b >= smena && b < smena+4){ if (sk > razr) razr = sk; }
    }
    og.push(Math.sqrt(kv/N));
  }
  return {og, smena, razr, razrFon, sryvy: c.sryvy};
}
function sgladi(og, okon){          // огибающая по 50 мс, а не по 2.7
  const m=[]; for(let i=0;i<og.length;i++){
    let s=0,k=0; for(let j=Math.max(0,i-okon+1);j<=i;j++){ s+=og[j]*og[j]; k++; }
    m.push(Math.sqrt(s/k)); }
  return m;
}
function razbor(imya, r){
  const {smena} = r;
  const og = sgladi(r.og, 19);
  const sr=(a,b)=>{let s=0;for(let i=a;i<b;i++)s+=og[i];return s/(b-a);};
  const do_ = sr(smena-80, smena-4), posle = sr(og.length-80, og.length);
  // провал в середине перевода — главный враг любого кроссфейда
  const seredina = Math.round(SR*.75/128);
  let min = 9e9;
  for (let i = smena; i < smena + seredina*2; i++) if (og[i] < min) min = og[i];
  // естественный разброс той же огибающей в покое — с чем сравнивать
  let fonMin = 9e9;
  for (let i = smena-160; i < smena-8; i++) if (og[i] < fonMin) fonMin = og[i];
  r.fon = fonMin/do_;
  console.log(imya.padEnd(28),
    'до', do_.toFixed(4), '→ после', posle.toFixed(4),
    ' провал', (min/Math.min(do_,posle)).toFixed(2),
    '(в покое', r.fon.toFixed(2)+')',
    ' разрыв', r.razr.toExponential(1), '(фон', r.razrFon.toExponential(1)+')',
    ' срывов', r.sryvy);
}
const drugoy = {seed: 2861234501, p:{sway:.78, tone:.72, range:.35, depth:.5}};
const taZhe  = {seed: 1626943591, p:{sway:.78, tone:.72, range:.35, depth:.5}};
console.log('ДРУГАЯ СБОРКА — перевод между двумя приборами');
razbor('  без микширования', progon(0, drugoy));
razbor('  с микшированием',  progon(1, drugoy));
console.log('ТА ЖЕ СБОРКА — второй прибор не нужен, едут движки');
razbor('  без микширования', progon(0, taZhe));
razbor('  с микшированием',  progon(1, taZhe));
