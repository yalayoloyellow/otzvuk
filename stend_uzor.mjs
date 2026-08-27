// УЗОР ВРЕМЕНИ — гросбит из зерна. Проверки:
// 1. PATTERN в нуле — тракт прежний (та же ветвь, что и раньше).
// 2. На полном узоре выход ОТЛИЧАЕТСЯ и в нём появляются повторы: корреляция
//    выхода со сдвигом на полдоли/долю выше, чем без узора.
// 3. Порог-проявление: полузор трогает меньше шагов, чем полный.
// 4. Шестнадцать семян — без бед; узоры напечатаны, у коробок они разные.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
let K=null; globalThis.registerProcessor=(n,k)=>K=k;
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const ОП=['·','повт','полу','разв','стоп'];
function мера(seed, uzor, сек=6){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'metr',v:120}});
  c.port.onmessage({data:{t:'p',v:{uzor}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  for(let b=0;b<Math.round(48000*2/n);b++) c.process([[вх]],[[L,R]]);
  const y=[];
  for(let b=0;b<Math.round(48000*сек/n);b++){ c.process([[вх]],[[L,R]]);
    for(let i=0;i<n;i++) y.push(L[i]); }
  return {y, sb:c.pr.sb, ср:c.sryvy};
}
// Мера по ОКНАМ в полдоли: скз стационарного шума не меняется от
// перестановки кусков, а вот мгновенная «высота» — переходы через ноль —
// на полускорости падает вдвое, на стопе к нулю, на скольжении едет.
function окна(y, шаг){
  const из=[];
  for(let о=0;о+шаг<=y.length;о+=шаг){
    let н=0,пп=0;
    for(let i=о;i<о+шаг;i++){ if(пп<=0&&y[i]>0)н++; пп=y[i]; }
    из.push(н);
  }
  return из;
}
const скз=y=>Math.sqrt(y.reduce((s,v)=>s+v*v,0)/y.length);
const ПОЛДОЛИ=Math.round(48000*60/120/2);
const семена=[1626943591,139297718,770901,7,777,12345,31337,555];
console.log('доля 0.5 с, полдоли '+ПОЛДОЛИ+' отсчётов\n');
console.log('  семя        узор                                мин/мед/МАКС: без       с узором');
let бед=0, жив=0, писков=0;
for(const s of семена){
  const a=мера(s,0), b=мера(s,1);
  if(a.ср||b.ср||!(скз(b.y)===скз(b.y))) бед++;
  const у=b.sb.uzor.map(з=>ОП[з.op]).join(' ');
  const оа=окна(a.y,ПОЛДОЛИ).sort((x,q)=>x-q), об=окна(b.y,ПОЛДОЛИ).sort((x,q)=>x-q);
  const мина=оа[0], меда=оа[оа.length>>1], макса=оа[оа.length-1];
  const минб=об[0], медб=об[об.length>>1], максб=об[об.length-1];
  // Узор жив, если худшее окно просело сильнее, чем у сухого прогона.
  if (минб < мина * .6) жив++;
  // ДЕТЕКТОР ПИСКОВ. Первая редакция «скользила» позицией — чтение неслось
  // в восемь раз быстрее письма и чирпало на октавы вверх. В таблице это
  // было видно (окна с узором ВЫШЕ сухих), и я это проглядел. Теперь
  // проверяется явно: узор режет и тянет вниз, но не звенит выше сухого.
  const писк = максб > макса * 1.3;
  if (писк) писков++;
  console.log('  '+String(s).padStart(10)+'  '+у.padEnd(36).slice(0,36)+'  '+
    String(мина).padStart(4)+'/'+String(меда)+'/'+String(макса).padEnd(5)+'  '+
    String(минб).padStart(4)+'/'+String(медб)+'/'+String(максб)+(писк?'  ПИСК':''));
}
console.log('\n  бед: '+бед+' · узор слышен у '+жив+' из '+семена.length+' · писков: '+писков);
