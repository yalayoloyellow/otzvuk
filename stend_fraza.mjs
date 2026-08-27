// ФРАЗА — мемфисский семплер педалью. Проверки:
// 1. Захват вперёд: нажал → запись со следующего такта; отпустил →
//    доигрывается до целого такта; петля замещает прибор.
// 2. Петля ПОВТОРЯЕТСЯ: корреляция выхода со сдвигом на длину фразы ~1.
// 3. Сброс: короткое нажатие возвращает живой прибор, петля исчезает.
// 4. Прибор под петлёй жив: после сброса не тишина и не NaN.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
let K=null; globalThis.registerProcessor=(n,k)=>K=k;
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const c=new K(); c.port.onmessage({data:{t:'seed',v:1626943591}});
c.port.onmessage({data:{t:'metr',v:120}});
c.port.onmessage({data:{t:'p',v:{pit:1}}});
const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
const сек=с=>Math.round(48000*с/n);
const гнать=(бл,сбор)=>{ for(let b=0;b<бл;b++){ c.process([[вх]],[[L,R]]);
  if(сбор) for(let i=0;i<n;i++) сбор.push(L[i]); } };
гнать(сек(3));
c.port.onmessage({data:{t:'fraza',v:1}});          // нажал
гнать(сек(2.5));                                    // такт начался, пишем
c.port.onmessage({data:{t:'fraza',v:0}});          // отпустил в середине
гнать(сек(3));                                      // дописалось, крутится
console.log('состояние после записи: '+c.frSost+' (ждём 3=играет) · тактов '+c.frTaktov+
  ' · длина '+(c.frN/48000).toFixed(2)+'с (такт 2.00с)');
const y=[]; гнать(сек(6), y);
let s1=0,sa=0,sb2=0;
for(let i=c.frN;i<y.length;i++){ s1+=y[i]*y[i-c.frN]; sa+=y[i]*y[i]; sb2+=y[i-c.frN]*y[i-c.frN]; }
console.log('корреляция со сдвигом на фразу: '+(s1/Math.sqrt(sa*sb2)).toFixed(3)+' (петля = 1.000)');
// Сброс коротким нажатием.
c.port.onmessage({data:{t:'fraza',v:1}});
гнать(2);
c.port.onmessage({data:{t:'fraza',v:0}});
const посл=[]; гнать(сек(3), посл);
const скз=Math.sqrt(посл.reduce((s,v)=>s+v*v,0)/посл.length);
console.log('после сброса: состояние '+c.frSost+' (ждём 0) · скз '+скз.toFixed(4)+
  ' · срывов '+c.sryvy+(скз===скз&&скз>1e-4?' — прибор жив':' — БЕДА'));
