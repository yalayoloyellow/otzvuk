// ВЕРЕТЕНО — сеть связей от энтропии курсора. Проверки:
// 1. Без энтропии и с выключенным тумблером сеть пуста, тракт прежний.
// 2. Энтропия при включённом тумблере вьёт нити; чем дольше, тем больше;
//    появляются мета-нити (связи, ведущие связи).
// 3. Смещения ограничены третью хода; NaN и срывов нет.
// 4. Выключение — сеть тает до нуля.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
let K=null; globalThis.registerProcessor=(n,k)=>K=k;
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const c=new K(); c.port.onmessage({data:{t:'seed',v:1626943591}});
c.port.onmessage({data:{t:'metr',v:120}});
c.port.onmessage({data:{t:'p',v:{pit:1, vite:1, cut:.4, uzor:.4}}});
const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
const гнать=с=>{ for(let b=0;b<Math.round(48000*с/n);b++) c.process([[вх]],[[L,R]]); };
const мышь=()=>{ const д=[]; for(let i=0;i<16;i++) д.push((Math.random()*40-20)|0);
  c.port.onmessage({data:{t:'vite', d:д}}); };
гнать(2);
console.log('до вождения: нитей '+c.viteN);
// «Водим» 4 секунды.
for(let s2=0;s2<4;s2++){ for(let k=0;k<7;k++){ мышь(); гнать(.15); } }
const н4=c.viteN;
let мет=0; for(let i=0;i<c.vMeta.length;i++) if(c.vMeta[i]>=0 && c.vZhiv[i]>0) мет++;
console.log('после 4 с вождения: нитей '+н4+' (мета: '+мет+')');
// Ещё 8 секунд.
for(let s2=0;s2<8;s2++){ for(let k=0;k<7;k++){ мышь(); гнать(.15); } }
let мет2=0; for(let i=0;i<c.vMeta.length;i++) if(c.vMeta[i]>=0 && c.vZhiv[i]>0) мет2++;
console.log('после 12 с: нитей '+c.viteN+' (мета: '+мет2+') — растёт: '+(c.viteN>=н4?'да':'НЕТ'));
// Смещения в пределах.
let макс=0; for(let j=0;j<c.vSm.length;j++) макс=Math.max(макс,Math.abs(c.vSm[j]));
console.log('наибольшее смещение приёмника: '+макс.toFixed(3)+' (предел .35 до клампа)');
// Живёт без движения.
гнать(4);
let кв=0,N=0; for(let b=0;b<Math.round(48000*2/n);b++){ c.process([[вх]],[[L,R]]);
  for(let i=0;i<n;i++){кв+=L[i]*L[i];N++;} }
console.log('без движения 6 с: нитей '+c.viteN+' · скз '+Math.sqrt(кв/N).toFixed(4)+' · срывов '+c.sryvy);
// Выключение — тает.
c.port.onmessage({data:{t:'p',v:{vite:0}}});
гнать(12);
console.log('после выключения и 12 с: нитей '+c.viteN+' (ждём 0)');
// Швы: перешивание сборки. Снимок номиналов до, вождение, снимок после —
// сборка обязана УЙТИ; выключение швы не откатывает (перешитое перешито).
const c2=new K(); c2.port.onmessage({data:{t:'seed',v:770901}});
c2.port.onmessage({data:{t:'metr',v:120}});
c2.port.onmessage({data:{t:'p',v:{pit:1, vite:1, gryzn:.4}}});
const гнать2=с=>{ for(let b=0;b<Math.round(48000*с/n);b++) c2.process([[вх]],[[L,R]]); };
const мышь2=()=>{ const д=[]; for(let i=0;i<16;i++) д.push((Math.random()*40-20)|0);
  c2.port.onmessage({data:{t:'vite', d:д}}); };
гнать2(2);
const до={Rvhod:c2.pr.sb.Rvhod.slice(), ves:c2.pr.sb.ves.slice(), ris:c2.pr.sb.risunok,
          perem:c2.pr.sb.perem, tone:c2.pr.sb.zTone};
for(let s2=0;s2<15;s2++){ for(let k=0;k<7;k++){ мышь2(); гнать2(.15); } }
const sb=c2.pr.sb;
let сдвигов=0;
for(let i=0;i<до.Rvhod.length;i++) if(Math.abs(sb.Rvhod[i]/до.Rvhod[i]-1)>.02) сдвигов++;
for(let i=0;i<до.ves.length;i++) if(Math.abs(sb.ves[i]/до.ves[i]-1)>.02) сдвигов++;
if(sb.risunok!==до.ris) сдвигов++;
if(sb.perem!==до.perem) сдвигов++;
if(Math.abs(sb.zTone-до.tone)>.01) сдвигов++;
console.log('швы за 15 с вождения: '+c2.mShvov+' · полей сборки уехало: '+сдвигов+
  ' · Rvet цел: '+(sb.Rvet.length===sb.ves.length && sb.Rvet.every(v=>v===v)?'да':'НЕТ')+
  ' · срывов '+c2.sryvy);
let кв2=0,N2=0; for(let b=0;b<Math.round(48000*2/n);b++){ c2.process([[вх]],[[L,R]]);
  for(let i=0;i<n;i++){кв2+=L[i]*L[i];N2++;} }
console.log('после перешивки скз '+Math.sqrt(кв2/N2).toFixed(4)+' — прибор жив');
