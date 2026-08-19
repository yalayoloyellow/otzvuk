// Каждая ручка обязана быть слышна и делать СВОЁ. Плюс проверка уровня:
// клиппинг на краях диапазона — это не характер, это ошибка.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = {
  postMessage(){}, set onmessage(f){this._f=f}, get onmessage(){return this._f} }; } };
new Function(readFileSync('./хаос.worklet.js','utf8'))();
const SR = 48000;
const БАЗ = {качание:.55, характер:.5, размах:.75, импульс:.2, дребезг:.15,
             удар:.35, развод:.15, гуляние:0};
function прогон(p, сек, семя){
  const пр = new K();
  if (семя !== undefined) пр.port._f({data:{t:'семя', v:семя}});
  пр.port._f({data:{t:'p', v:{...БАЗ, ...p}}});
  const n = Math.round(SR*сек), L = new Float32Array(n), b = 128;
  for (let i = 0; i < n; i += b){
    const oL = new Float32Array(b), oR = new Float32Array(b);
    пр.process([], [[oL,oR]]);
    L.set(oL.subarray(0, Math.min(b, n-i)), i);
  }
  return L;
}
function спектр(L, N=8192){
  const из = L.length - N, м = [];
  for (let ф = 30; ф < 16000; ф *= 1.035){
    const ω = 2*Math.PI*ф/SR; let re = 0, im = 0;
    for (let i = 0; i < N; i++){
      const w = .5 - .5*Math.cos(2*Math.PI*i/N), s = L[из+i]*w;
      re += s*Math.cos(ω*i); im += s*Math.sin(ω*i);
    }
    м.push([ф, Math.sqrt(re*re+im*im)/N]);
  }
  return м;
}
// сколько отчётливых пиков — мера «богатства»
function пики(сп){
  const мх = Math.max(...сп.map(x=>x[1]));
  let n = 0;
  for (let i = 1; i < сп.length-1; i++)
    if (сп[i][1] > сп[i-1][1] && сп[i][1] > сп[i+1][1] && сп[i][1] > мх*.06) n++;
  return n;
}
// плоскость спектра: 1 — белый шум, к нулю — тон
function плоскость(сп){
  let лог = 0, ср = 0, n = 0;
  for (const [,a] of сп){ const v = Math.max(a, 1e-9); лог += Math.log(v); ср += v; n++; }
  return Math.exp(лог/n) / (ср/n);
}
function низ(L, гр){
  let lp = 0, э = 0, вс = 0; const k = 2*Math.PI*гр/SR;
  for (let i = 0; i < L.length; i++){ lp += (L[i]-lp)*k; э += lp*lp; вс += L[i]*L[i]; }
  return э/Math.max(1e-9, вс);
}
function уровни(L){
  let п = 0, э = 0;
  for (const v of L){ const a = Math.abs(v); if (a > п) п = a; э += v*v; }
  return [п, Math.sqrt(э/L.length)];
}
function строка(имя, L){
  const сп = спектр(L), [п, скз] = уровни(L);
  return '  ' + имя.padEnd(14) +
    'пиков ' + String(пики(сп)).padStart(3) +
    '   шумность ' + плоскость(сп).toFixed(3) +
    '   низ<100 ' + (низ(L,100)*100).toFixed(0).padStart(3) + '%' +
    '   пик ' + п.toFixed(2) + '  скз ' + скз.toFixed(3);
}
console.log('РАЗВОД (унисон → треск и шум)');
for (const v of [0,.15,.35,.6,1]) console.log(строка('развод '+v, прогон({развод:v}, 5)));
console.log('\nДРЕБЕЗГ');
for (const v of [0,.3,.7,1]) console.log(строка('дребезг '+v, прогон({дребезг:v}, 5)));
console.log('\nУДАР');
for (const v of [0,.4,1]) console.log(строка('удар '+v, прогон({удар:v}, 5)));
console.log('\nИМПУЛЬС');
for (const v of [0,.5,1]) console.log(строка('импульс '+v, прогон({импульс:v}, 5)));
console.log('\nСБОРКИ (Tab)');
for (const с of [1, 12345, 777777, 4242424]) console.log(строка('семя '+с, прогон({}, 5, с)));
console.log('\nУРОВЕНЬ НА КРАЯХ (клиппинга быть не должно)');
for (const [имя,p] of [['всё в ноль',{размах:0,импульс:0,дребезг:0,удар:0,развод:0}],
                       ['всё на максимум',{размах:1,импульс:1,дребезг:1,удар:1,развод:1}],
                       ['удар+импульс',{удар:1,импульс:1}],
                       ['низкий характер',{характер:0,удар:1}],
                       ['высокий характер',{характер:1,развод:1}]]){
  const [п,скз] = уровни(прогон(p, 4));
  console.log('  ' + имя.padEnd(18) + 'пик ' + п.toFixed(3) + '   скз ' + скз.toFixed(3));
}
