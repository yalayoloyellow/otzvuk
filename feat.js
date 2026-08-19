// ============================================================================
//  ПРИЗНАКИ ТЕМЫ — подробное описание звука числами.
//  Четырёх было мало: yala отверг восемь тем из десяти, то есть отбор
//  ранжировал негодное. Чем больше осей, тем больше шансов, что среди них
//  найдётся та, вдоль которой лежит его вкус.
//  Всё считается своими руками: ноль зависимостей — принцип проекта.
// ============================================================================

// Радикс-2 БПФ на месте. Шестьдесят строк вместо библиотеки.
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
  }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang);
    for(let i=0;i<n;i+=len){
      let cr=1, ci=0;
      for(let k=0;k<len/2;k++){
        const ur=re[i+k], ui=im[i+k];
        const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci;
        const vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi;
        re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr;
      }
    }
  }
}

const N=2048, HOP=1024;
function spectra(x,sr){
  const win=new Float32Array(N);
  for(let i=0;i<N;i++) win[i]=.5-.5*Math.cos(2*Math.PI*i/N);
  const frames=[];
  for(let s=0;s+N<=x.length;s+=HOP){
    const re=new Float32Array(N), im=new Float32Array(N);
    for(let i=0;i<N;i++) re[i]=x[s+i]*win[i];
    fft(re,im);
    const m=new Float32Array(N/2);
    for(let k=0;k<N/2;k++) m[k]=Math.hypot(re[k],im[k]);
    frames.push(m);
  }
  return frames;
}

const mean=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
const sd=a=>{ const m=mean(a); return Math.sqrt(mean(a.map(v=>(v-m)*(v-m)))); };
const clip=(v,a,b)=>v<a?a:v>b?b:v;

export function extract(buf){
  const sr=buf.sampleRate, L=buf.getChannelData(0), R=buf.getChannelData(1);
  const n=L.length, x=new Float32Array(n), side=new Float32Array(n);
  for(let i=0;i<n;i++){ x[i]=(L[i]+R[i])*.5; side[i]=(L[i]-R[i])*.5; }

  const F=spectra(x,sr), bin=sr/N;
  const cent=[],spread=[],roll=[],flat=[],flux=[],hf=[];
  let prev=null;
  for(const m of F){
    let sum=0,ws=0,geo=0,cnt=0,hi=0;
    for(let k=1;k<m.length;k++){
      const v=m[k]+1e-12, f=k*bin;
      sum+=v; ws+=v*f; geo+=Math.log(v); cnt++;
      if(f>4000) hi+=v;
    }
    if(sum<1e-9){ continue; }
    const c=ws/sum;
    cent.push(c);
    let sp=0; for(let k=1;k<m.length;k++){ const f=k*bin; sp+=m[k]*(f-c)*(f-c); }
    spread.push(Math.sqrt(sp/sum));
    let acc=0,rf=0;
    for(let k=1;k<m.length;k++){ acc+=m[k]; if(acc>=sum*.85){ rf=k*bin; break; } }
    roll.push(rf);
    flat.push(Math.exp(geo/cnt)/(sum/cnt));
    hf.push(hi/sum);
    if(prev){ let d=0; for(let k=1;k<m.length;k++){ const q=m[k]-prev[k]; if(q>0) d+=q; }
      flux.push(d/sum); }
    prev=m;
  }

  // огибающая 10 мс — временные признаки
  const W=Math.round(sr*.01), K=Math.floor(n/W), e=new Float32Array(K);
  for(let k=0;k<K;k++){ let s=0; for(let i=k*W;i<(k+1)*W;i++) s+=x[i]*x[i]; e[k]=Math.sqrt(s/W); }
  const em=mean([...e]);
  let peak=0; for(let i=0;i<n;i++){ const a=Math.abs(x[i]); if(a>peak)peak=a; }
  let rms=0; for(let i=0;i<n;i++) rms+=x[i]*x[i]; rms=Math.sqrt(rms/n);

  // атаки: сколько заметных нарастаний в секунду
  let onsets=0;
  for(let k=2;k<K;k++) if(e[k]-e[k-1]>em*.6 && e[k-1]<=e[k-2]) onsets++;
  // тишина: доля окон ниже десятой доли среднего
  let quiet=0; for(let k=0;k<K;k++) if(e[k]<em*.1) quiet++;

  // автокорреляция огибающей — периодичность рисунка
  const d=new Float32Array(K); for(let k=0;k<K;k++) d[k]=e[k]-em;
  let e0=0; for(let k=0;k<K;k++) e0+=d[k]*d[k];
  let per=0, perLag=0;
  if(e0>1e-12) for(let lag=20;lag<Math.min(K-4,250);lag++){
    let s=0; for(let k=0;k+lag<K;k++) s+=d[k]*d[k+lag];
    const c=s/e0; if(c>per){ per=c; perLag=lag*.01; }
  }

  // тональность: автокорреляция волны
  let ton=0, tonHz=0;
  { const lo=Math.floor(sr/500), hi=Math.floor(sr/50), m2=Math.min(n,sr*2);
    let en=0; for(let i=0;i<m2;i++) en+=x[i]*x[i];
    if(en>1e-9) for(let lag=lo;lag<=hi;lag+=2){
      let s=0,a2=0,b2=0;
      for(let i=0;i+lag<m2;i+=4){ s+=x[i]*x[i+lag]; a2+=x[i]*x[i]; b2+=x[i+lag]*x[i+lag]; }
      const dd=Math.sqrt(a2*b2);
      if(dd>1e-12){ const c=s/dd; if(c>ton){ ton=c; tonHz=sr/lag; } }
    } }

  // ширина стерео и переходы через ноль (шумность)
  let sE=0,mE=0; for(let i=0;i<n;i++){ sE+=side[i]*side[i]; mE+=x[i]*x[i]; }
  let zc=0; for(let i=1;i<n;i++) if((x[i]>0)!==(x[i-1]>0)) zc++;

  const f={
    centroid: clip(mean(cent)/6000,0,1),
    centroidVar: clip(sd(cent)/3000,0,1),
    spread: clip(mean(spread)/5000,0,1),
    rolloff: clip(mean(roll)/12000,0,1),
    flatness: clip(mean(flat)*6,0,1),
    flux: clip(mean(flux)*7,0,1),
    hfShare: clip(mean(hf)*3,0,1),
    crest: clip((peak/(rms+1e-9))/12,0,1),
    onsetRate: clip(onsets/(n/sr)/12,0,1),
    roughness: clip(sd([...e])/(em+1e-9)*.9,0,1),
    quietShare: clip(quiet/K,0,1),
    periodicity: clip(per,0,1),
    periodSec: clip(perLag/2.5,0,1),
    tonality: clip(ton,0,1),
    pitchHz: clip(Math.log2((tonHz||55)/40)/4,0,1),
    width: clip(Math.sqrt(sE/(mE+1e-12))*2,0,1),
    noisiness: clip(zc/n*sr/4000,0,1),
    dynRange: clip((Math.max(...e)-em)/(em+1e-9)/4,0,1)
  };
  return f;
}

export const KEYS=['centroid','centroidVar','spread','rolloff','flatness','flux',
  'hfShare','crest','onsetRate','roughness','quietShare','periodicity','periodSec',
  'tonality','pitchHz','width','noisiness','dynRange'];
