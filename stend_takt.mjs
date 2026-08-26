// ТАКТ — захват качелей внешним ритмом.
//
// Не часы и не счётчик: прибор притягивается к чужому периоду, как звуковой
// генератор притягивается к чужой высоте. Проверяем ровно это — встают ли
// качели на период лупа, и с контрольным прогоном, потому что без него любая
// таблица выглядит убедительно.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
 drift:0,range:.5,gryzn:0,golos:.6,gen1:1,gen2:1,gen3:1,link:0,dirt:0,petlya:0,
 kuda:0,naruzhu:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,takt:0};

// Луп: короткий удар каждые 1/бпм*60 секунд — то, что на входе и бывает.
function прогон(п, bpm, seed, сек=12){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА,...п}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const шаг=60/bpm; let t=0;
  // Моменты, когда медленный узел переваливает через середину вверх — по ним
  // и меряется период качелей.
  const фронты=[]; let было=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){
    for(let i=0;i<n;i++){
      const ф=(t%шаг)/шаг;
      вх[i]= bpm ? Math.exp(-ф*26)*Math.sin(2*Math.PI*70*t)*.8 : 0;
      t+=1/48000;
    }
    c.process([[вх]],[[L,R]]);
    const u=c.pr.swing.u;
    if(b>Math.round(48000*4/n)){ if(было<=.5 && u>.5) фронты.push(b*n/48000); было=u; }
  }
  const пер=[]; for(let i=1;i<фронты.length;i++) пер.push(фронты[i]-фронты[i-1]);
  if(!пер.length) return {период:0, разброс:0, ударов:0};
  const мед=a=>{const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1];};
  const m=мед(пер);
  return {период:m, разброс:Math.sqrt(пер.reduce((s,v)=>s+(v-m)*(v-m),0)/пер.length)/m,
          ударов:пер.length};
}
const дроб=(a,b)=>{ if(!(a>0&&b>0)) return '—'; const r=a/b;
  for(let p=1;p<=8;p++) for(let q=1;q<=8;q++)
    if(Math.abs(r-p/q)/(p/q)<.03) return p+':'+q;
  return r.toFixed(2); };

// НА СВОИХ НОМИНАЛАХ, ПО СБОРКАМ И ТЕМПАМ. Качели всюду сведены мимо лупа.
const дроб2=дроб;
for(const БПМ of [100,140]){
  const ШАГ=60/БПМ;
  console.log('\n══ луп '+БПМ+' уд/мин — удар каждые '+ШАГ.toFixed(3)+' с');
  console.log('  сборка       свои качели   такт 0.6      такт 1.0');
  for(const seed of [1626943591,139297718,770901]){
    const один=(t)=>{
      const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
      c.port.onmessage({data:{t:'p',v:{...БАЗА,takt:t,sway:.42}}});
      const n=128,L=new Float32Array(n),R2=new Float32Array(n),вх=new Float32Array(n);
      let tm=0,было=0; const фр=[];
      for(let b=0;b<Math.round(48000*12/n);b++){
        for(let i=0;i<n;i++){ const ф=(tm%ШАГ)/ШАГ;
          вх[i]= t===null?0:Math.exp(-ф*26)*Math.sin(2*Math.PI*70*tm)*.8; tm+=1/48000; }
        c.process([[вх]],[[L,R2]]);
        const u=c.pr.swing.u;
        if(b>Math.round(48000*4/n)){ if(было<=.5&&u>.5) фр.push(b*n/48000); было=u; }
      }
      const пер=[]; for(let i=1;i<фр.length;i++) пер.push(фр[i]-фр[i-1]);
      const b2=пер.slice().sort((x,y)=>x-y); return b2.length?b2[b2.length>>1]:0;
    };
    const св=один(null), a=один(.6), b=один(1);
    const п=v=>(v?v.toFixed(3):'—')+' '+дроб2(v,ШАГ).padStart(5);
    console.log('  '+String(seed).padStart(10)+'   '+п(св)+'   '+п(a)+'   '+п(b));
  }
}
