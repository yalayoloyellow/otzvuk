// Прогон ядра вне браузера: обвязка, дающая worklet-окружение, чтобы можно
// было рендерить звук в файл и мерить. Тот же самый хаос.worklet.js, что
// играет в инструменте, — не копия.
import {readFileSync, writeFileSync} from 'fs';
globalThis.sampleRate = 48000;
let Кл = null;
globalThis.registerProcessor = (имя, k) => { Кл = k; };
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = {
  postMessage(){}, set onmessage(f){ this._f = f; }, get onmessage(){ return this._f; } }; } };
const src = readFileSync(new URL('./хаос.worklet.js', import.meta.url), 'utf8');
new Function(src)();

export function прогон(парам, секунд){
  const пр = new Кл();
  if (пр.port._f) пр.port._f({data:{t:'p', v:парам||{}}});
  const n = Math.round(48000*секунд), L = new Float32Array(n), R = new Float32Array(n);
  const блок = 128;
  for (let i = 0; i < n; i += блок){
    const oL = new Float32Array(блок), oR = new Float32Array(блок);
    пр.process([], [[oL, oR]]);
    L.set(oL.subarray(0, Math.min(блок, n-i)), i);
    R.set(oR.subarray(0, Math.min(блок, n-i)), i);
  }
  return {L, R, пр};
}

export function wav(L, R, sr){
  const n = L.length, b = Buffer.alloc(44 + n*4);
  b.write('RIFF',0); b.writeUInt32LE(36+n*4,4); b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(2,22);
  b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*4,28); b.writeUInt16LE(4,32); b.writeUInt16LE(16,34);
  b.write('data',36); b.writeUInt32LE(n*4,40);
  for (let i=0;i<n;i++){
    b.writeInt16LE(Math.max(-1,Math.min(1,L[i]))*32767, 44+i*4);
    b.writeInt16LE(Math.max(-1,Math.min(1,R[i]))*32767, 46+i*4);
  }
  return b;
}

if (process.argv[1].endsWith('стенд_хаос.mjs')){
  const сцены = {
    'захват':   {связь:.08, питание:.15, пульс:.35, делёж:.3, качели:.5, просадка:.5,
                 частота:.3, разброс:.45, грязь:.25, струна:.45, натяг:.3, мягкость:.5,
                 фильтр:.5, логика:.25, сворачивание:0},
    'дышит':    {связь:.45, питание:.3, пульс:.4, делёж:.42, качели:.62, просадка:.55,
                 частота:.33, разброс:.5, грязь:.35, струна:.5, натяг:.32, мягкость:.6,
                 фильтр:.55, логика:.35, сворачивание:.15},
    'край':     {связь:.72, питание:.45, пульс:.45, делёж:.55, качели:.58, просадка:.6,
                 частота:.36, разброс:.6, грязь:.5, струна:.45, натяг:.35, мягкость:.7,
                 фильтр:.6, логика:.45, сворачивание:.3},
    'распад':   {связь:.95, питание:.7, пульс:.5, делёж:.7, качели:.5, просадка:.7,
                 частота:.4, разброс:.75, грязь:.65, струна:.35, натяг:.4, мягкость:.8,
                 фильтр:.65, логика:.6, сворачивание:.5}
  };
  for (const [имя, p] of Object.entries(сцены)){
    const {L,R,пр} = прогон(p, 8);
    writeFileSync(`/private/tmp/claude-502/-Users-yala/15a2ff36-fbf8-4b1e-9532-7ad769179edd/scratchpad/хаос-${имя}.wav`, wav(L,R,48000));
    let пик=0, сум=0; for(let i=0;i<L.length;i++){ const a=Math.abs(L[i]); if(a>пик)пик=a; сум+=L[i]*L[i]; }
    console.log(имя.padEnd(8), 'пик', пик.toFixed(3), 'ср', Math.sqrt(сум/L.length).toFixed(3),
                'разброс', ((пр.разбр||0)*100).toFixed(0)+'%', 'срывы', пр.срывы||0);
  }
}
