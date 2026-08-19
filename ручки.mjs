// Каждая ручка обязана менять звук. Меряю по одной: крайние положения и
// разница между ними по нескольким независимым признакам.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = {
  postMessage(){}, set onmessage(f){this._f=f}, get onmessage(){return this._f} }; } };
new Function(readFileSync('./хаос.worklet.js','utf8'))();
const SR = 48000;
const БАЗ = {качание:.55, характер:.5, размах:.75, импульс:.2,
             удар:.35, развод:.15, гуляние:0, питч:.5,
             ген2:1, ген3:0, связь:0, грязь:0, диапазон:.5};
const КРУТИЛКИ = ['качание','характер','размах','импульс','удар','развод','гуляние','питч'];
function прогон(p, сек){
  const пр = new K();
  пр.port._f({data:{t:'p', v:{...БАЗ, ...p}}});
  const n = Math.round(SR*сек), L = new Float32Array(n), b = 128;
  const частоты = [];
  for (let i = 0; i < n; i += b){
    const oL = new Float32Array(b), oR = new Float32Array(b);
    пр.process([], [[oL,oR]]);
    L.set(oL.subarray(0, Math.min(b, n-i)), i);
    if (i > n*.15 && пр.пр.осн.f > 1) частоты.push(пр.пр.осн.f);
  }
  return {L, частоты, пр};
}
function признаки(r){
  const {L, частоты} = r;
  let п = 0, э = 0;
  for (const v of L){ const a = Math.abs(v); if (a > п) п = a; э += v*v; }
  const скз = Math.sqrt(э/L.length);
  const с = [...частоты].sort((a,b)=>a-b);
  const низ = с.length ? с[Math.floor(с.length*.03)] : 0;
  const верх = с.length ? с[Math.floor(с.length*.97)] : 0;
  // яркость
  const N = 8192, из = L.length-N;
  let цс = 0, цв = 0;
  for (let ф = 40; ф < 14000; ф *= 1.07){
    const ω = 2*Math.PI*ф/SR; let re = 0, im = 0;
    for (let i = 0; i < N; i++){
      const w = .5-.5*Math.cos(2*Math.PI*i/N), s = L[из+i]*w;
      re += s*Math.cos(ω*i); im += s*Math.sin(ω*i);
    }
    const a = Math.sqrt(re*re+im*im)/N; цс += a*ф; цв += a;
  }
  // энергия низа
  let lp = 0, эн = 0, вс = 0;
  const k = 2*Math.PI*110/SR;
  for (let i = 0; i < L.length; i++){ lp += (L[i]-lp)*k; эн += lp*lp; вс += L[i]*L[i]; }
  // джиттер периода в самой схеме
  let др = 0, кд = 0;
  for (let i = 1; i < частоты.length; i++)
    if (частоты[i] !== частоты[i-1]){ др += Math.abs(частоты[i]-частоты[i-1])/частоты[i-1]; кд++; }
  return { скз, пик: п, низ, верх,
           яркость: цв > 0 ? цс/цв : 0,
           бас: эн/Math.max(1e-9,вс),
           джиттер: кд ? др/кд : 0,
           скваж: r.пр.пр.осн.скв };
}
const ключи = ['скз','низ','верх','яркость','бас','джиттер','скваж'];
console.log('ручка      положение    скз    низ Гц  верх Гц  яркость   бас%  джиттер%  скваж%');
for (const имя of КРУТИЛКИ){
  const строки = [];
  const знач = {};
  for (const v of [0, 1]){
    const пр = признаки(прогон({[имя]: v}, 4));
    знач[v] = пр;
    строки.push(`  ${имя.padEnd(10)} ${String(v).padEnd(10)} ` +
      `${пр.скз.toFixed(3)}  ${пр.низ.toFixed(0).padStart(6)}  ${пр.верх.toFixed(0).padStart(7)}  ` +
      `${пр.яркость.toFixed(0).padStart(7)}  ${(пр.бас*100).toFixed(1).padStart(5)}  ` +
      `${(пр.джиттер*100).toFixed(2).padStart(7)}  ${(пр.скваж*100).toFixed(0).padStart(6)}`);
  }
  // насколько вообще что-то изменилось
  let макс = 0, чем = '';
  for (const k of ключи){
    const a = знач[0][k], b = знач[1][k];
    const о = Math.abs(b-a)/Math.max(1e-6, Math.abs(a)+Math.abs(b));
    if (о > макс){ макс = о; чем = k; }
  }
  console.log(строки.join('\n') + `   → ${макс < .04 ? 'НЕ РАБОТАЕТ' : 'ведёт ' + чем + ' на ' + (макс*100).toFixed(0) + '%'}`);
}
