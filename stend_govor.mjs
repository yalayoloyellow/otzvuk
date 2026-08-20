// ГОВОРИЛКА. Проверять формантный синтез по спектру голоса — гиблое дело:
// спектр там гребёнка с шагом в основной тон, и любой поиск пиков находит её
// зубцы, а не форманты. Поэтому проверка разделена на три части, и каждая
// отвечает ровно за одно.
import {readFileSync} from 'fs';
import {GLASNYE, SOGLASNYE, vFonemy, vTseli} from './govor.js';
globalThis.sampleRate = 48000;
globalThis.registerProcessor = () => {};
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
const M = new Function(readFileSync('./chaos.worklet.js','utf8')
  + '\nreturn {Rez, Govorilka};')();
const SR = 48000;
// ТРАКТ СРЕДНЕЙ ДЛИНЫ. Ручка ГОЛОС/ТРАКТ растягивает все форманты разом:
// dl = .86·1.45^тракт. Проверять форманты имеет смысл на dl = 1, иначе
// стенд честно показывал бы одну и ту же ошибку по всем шести гласным —
// не промах синтеза, а положение ручки.
const TRAKT = Math.log(1 / .86) / Math.log(1.45);

function fft(re, im){
  const n = re.length;
  for (let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b;
    if(i<j){ [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; } }
  for (let len=2;len<=n;len<<=1){ const ang=-2*Math.PI/len;
    for (let i=0;i<n;i+=len) for (let k=0;k<len/2;k++){
      const wr=Math.cos(ang*k), wi=Math.sin(ang*k);
      const ur=re[i+k], ui=im[i+k];
      const vr=re[i+k+len/2]*wr - im[i+k+len/2]*wi;
      const vi=re[i+k+len/2]*wi + im[i+k+len/2]*wr;
      re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi; } }
}

// ---- 1. РЕЗОНАТОР ----------------------------------------------------------
// Звенит ли он на той частоте, которую ему задали. Возбуждаю импульсом —
// спектр отклика гладкий, гребёнки нет, пик один и он же ответ.
console.log('1. РЕЗОНАТОР: задано → измерено по отклику на импульс');
let hudRez = 0;
for (const [F, BW] of [[240,80],[500,110],[700,80],[1080,110],[2250,170],[3200,170]]){
  const r = new M.Rez(); r.nastroy(F, BW);
  const N = 1<<14, re = new Float64Array(N), im = new Float64Array(N);
  re[0] = r.step(1);
  for (let i=1;i<N;i++) re[i] = r.step(0);
  fft(re, im);
  let mx = 0, gde = 0;
  for (let i=1;i<N/2;i++){ const a = Math.hypot(re[i], im[i]);
    if (a > mx){ mx = a; gde = i*SR/N; } }
  const osh = Math.abs(gde/F - 1)*100;
  if (osh > hudRez) hudRez = osh;
  console.log('   ', String(F).padStart(5), 'Гц →', gde.toFixed(0).padStart(5),
    'Гц   ошибка', osh.toFixed(2)+'%');
}
console.log('   худшая ошибка резонатора:', hudRez.toFixed(2)+'%\n');

// ---- 2. ФОРМАНТЫ ДОЕЗЖАЮТ --------------------------------------------------
// Язык имеет массу, форманты переезжают за десятки миллисекунд. Проверяю, что
// они приходят ИМЕННО туда, куда сказано таблицей.
console.log('2. ФОРМАНТЫ: куда приехали за полсекунды на гласном');
let hudF = 0;
for (const bukva of Object.keys(GLASNYE)){
  const g = new M.Govorilka();
  g.govori(vTseli([{f:bukva, dl:2, gl:1}]));
  for (let i=0;i<SR*.5;i++) g.step(.35, .5, 1, TRAKT, .5);
  const nado = GLASNYE[bukva];
  const osh = g.F.map((f,k)=>Math.abs(f/nado[k]-1)*100);
  hudF = Math.max(hudF, ...osh);
  console.log('   ', bukva, ' нужно', nado.join(' ').padEnd(16),
    'стало', g.F.map(f=>Math.round(f)).join(' ').padEnd(16),
    'ошибка', osh.map(o=>o.toFixed(2)+'%').join(' '));
}
console.log('   худшая ошибка форманты:', hudF.toFixed(2)+'%\n');

// ---- 3. ЖИВАЯ ФРАЗА --------------------------------------------------------
// Считается ли она вообще: уровень, отсутствие срывов, тишина в паузах и то,
// что взрывные согласные ДЕЛАЮТ смычку — то есть проваливаются в тишину.
console.log('3. ФРАЗА «привет как дела»');
{
  const f = vFonemy('привет как дела');
  const celi = vTseli(f);
  const g = new M.Govorilka();
  g.govori(celi);
  const dlit = celi.reduce((a,b)=>a+b.dl,0) / (.45+.5*2.2);
  const n = Math.round(SR*(dlit+.4));
  const y = new Float32Array(n);
  let nan = 0;
  for (let i=0;i<n;i++){ y[i] = g.step(.35, .5, 0, TRAKT, .5); if(!(y[i]===y[i])) nan++; }
  let pik=0, kv=0;
  for (let i=0;i<n;i++){ const a=Math.abs(y[i]); if(a>pik)pik=a; kv+=y[i]*y[i]; }
  // огибающая по 10 мс: у речи она обязана ходить, а не стоять
  const ok = Math.round(SR*.01), og=[];
  for (let o=0;o+ok<=n;o+=ok){ let s=0;
    for(let i=o;i<o+ok;i++) s+=y[i]*y[i]; og.push(Math.sqrt(s/ok)); }
  const mx = Math.max(...og), tihih = og.filter(v=>v<mx*.06).length;
  console.log('    фонем', f.length, ' длительность', dlit.toFixed(2)+'с',
    ' пик', pik.toFixed(3), ' скз', Math.sqrt(kv/n).toFixed(4));
  console.log('    NaN', nan, ' окон тише 6% от пика:', tihih, 'из', og.length,
    tihih>2 ? '← смычки и паузы есть' : '← ПОДОЗРИТЕЛЬНО РОВНО');
  console.log('    ' + f.map(x=>x.f+(x.myagko?'ʲ':'')).join(' '));
}
