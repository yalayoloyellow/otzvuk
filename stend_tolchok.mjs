// ТОЛЧОК (пробел) — сброс ±1 В на конденсаторы трёх звуковых узлов. Вопрос
// один: меняет ли он что-нибудь СВЕРХ того, что прибор и так делает сам.
// Сравниваю расхождение спектра после толчка с расхождением двух соседних
// отрезков без него — если второе не меньше, толчок ничего не значит.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const N = 128, SR = 48000;
const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15, drift:0,
              range:.5, gryzn:0, golos:0, gen1:1, gen2:1, gen3:1, link:0, dirt:0,
              petlya:0, kuda:0, naruzhu:0, mix:0, zhat:0, master:.5,
              ist:0, ton:.35, temp:.5, povtor:0, trakt:.3};
function fft(re,im){ const n=re.length;
  for(let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b;
    if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];} }
  for(let len=2;len<=n;len<<=1){ const ang=-2*Math.PI/len;
    for(let i=0;i<n;i+=len) for(let k=0;k<len/2;k++){
      const wr=Math.cos(ang*k),wi=Math.sin(ang*k);
      const ur=re[i+k],ui=im[i+k];
      const vr=re[i+k+len/2]*wr-im[i+k+len/2]*wi, vi=re[i+k+len/2]*wi+im[i+k+len/2]*wr;
      re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;} } }
function spektr(y){
  const M=1<<12, ak=new Float64Array(M/2); let ok=0;
  for(let o=0;o+M<=y.length;o+=M/2){
    const re=new Float64Array(M), im=new Float64Array(M);
    for(let i=0;i<M;i++) re[i]=y[o+i]*(.5-.5*Math.cos(2*Math.PI*i/M));
    fft(re,im);
    for(let i=0;i<M/2;i++) ak[i]+=Math.hypot(re[i],im[i]);
    ok++;
  }
  let s=0; for(let i=0;i<M/2;i++){ ak[i]/=ok; s+=ak[i]; }
  for(let i=0;i<M/2;i++) ak[i]/=(s||1);
  return ak;
}
const rashod=(a,b)=>{ let d=0; for(let i=0;i<a.length;i++) d+=Math.abs(a[i]-b[i]); return d; };
function otrezok(c, sek){
  const L=new Float32Array(N), R=new Float32Array(N), m=new Float32Array(N);
  const y=[];
  for(let b=0;b<Math.round(SR*sek/N);b++){ c.process([[m]],[[L,R]]);
    for(let i=0;i<N;i++) y.push(L[i]); }
  return Float32Array.from(y);
}
console.log('семя      сам по себе   после толчка   во сколько раз');
let sum=0, n=0;
for (const semya of [1626943591, 777, 42, 3141592, 20260820]){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:semya, p:{...BAZA}}});
  otrezok(c, 3);                      // переходный процесс
  const a = spektr(otrezok(c, 1.5));
  const b = spektr(otrezok(c, 1.5));  // сам по себе, без вмешательства
  const fon = rashod(a, b);
  c.port.onmessage({data:{t:'kick'}});
  const d = spektr(otrezok(c, 1.5));
  const posle = rashod(b, d);
  sum += posle/fon; n++;
  console.log(String(semya).padEnd(12), fon.toFixed(4).padStart(8),
    posle.toFixed(4).padStart(13), (posle/fon).toFixed(2).padStart(14));
}
console.log('\nв среднем толчок меняет спектр в', (sum/n).toFixed(2),
            'раза сильнее, чем прибор меняется сам');
