// ПОРТРЕТ ЗВУКА — один прогон, три вида на него сразу.
//
// Зачем. Я не слышу. Звукового входа у меня нет и не будет, и всякий раз,
// когда я говорю «должно звучать так-то», это догадка, которую проверяет
// только ухо человека — то есть каждый мой промах стоит ему прослушивания.
// Четыре промаха подряд это и показали.
//
// Смотреть я умею. Значит из тех же самых отсчётов надо сделать КАРТИНКУ,
// устроенную так, чтобы на ней было видно ровно то, что слышно уху: не
// инженерный график, а перцептивный портрет.
//
//   · частота по ЛОГАРИФМУ — ухо слышит октавы, а не герцы
//   · громкость по децибелам — ухо слышит отношения, а не разы
//   · спектр ОГИБАЮЩЕЙ — то, чего на обычной спектрограмме не видно вовсе,
//     а слышно лучше всего: медленнее пяти в секунду читается событиями,
//     от пяти до двадцати зерном, выше двадцати тембром. Комичность живёт
//     в первой полосе, и здесь она видна пятном, а не выводится числом
//   · шина рядом и по той же оси времени — видно, что звук делает с питанием
//
// И тот же прогон пишется в WAV: человек слушает ровно то, на что я смотрю.
// Не «похожее», а те же самые отсчёты — иначе мы опять будем обсуждать
// разные вещи.
//
//   node portret.mjs имя [--сборка N] [--сек 8] [ключ=знач ...] [--против ключ=знач ...]
//
// «--против» рисует два портрета один под другим в общем масштабе: слева
// направо время, сверху базовый прогон, снизу изменённый. Разницу видно
// глазом, а не вычитанием чисел.
import {readFileSync, writeFileSync, mkdirSync} from 'fs';
import {deflateSync} from 'zlib';
import {homedir} from 'os';

// ---- разбор доводов --------------------------------------------------------
const дов = process.argv.slice(2);
let имя = 'портрет', семя = 1626943591, сек = 8;
const прав = {}, против = {};
let куда = прав;
for (let i = 0; i < дов.length; i++){
  const a = дов[i];
  if (a === '--против'){ куда = против; continue; }
  if (a === '--сборка'){ семя = +дов[++i]; continue; }
  if (a === '--сек'){ сек = +дов[++i]; continue; }
  if (a.includes('=')){ const [k,v] = a.split('='); куда[k] = +v; continue; }
  if (!a.startsWith('--')) имя = a;
}
const естьПротив = Object.keys(против).length > 0;

// ---- ядро ------------------------------------------------------------------
globalThis.sampleRate = 48000; let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}}; } };
new Function(readFileSync('./chaos.worklet.js','utf8'))();

const БАЗА = {volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
              drift:0,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:0,dirt:0,
              petlya:0,kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0};
const SR = 48000;

function прогон(правки){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:семя}});
  c.port.onmessage({data:{t:'p', v:{...БАЗА, ...правки}}});
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  const всего = Math.round(SR*сек/n);
  const звук = new Float32Array(всего*n), шина = new Float32Array(всего);
  for (let b = 0; b < всего; b++){
    c.process([[]],[[L,R]]);
    звук.set(L, b*n);
    шина[b] = c.pr.Vpit || 0;
  }
  return {звук, шина, блоков:всего, n};
}

// ---- быстрое преобразование ------------------------------------------------
function ПФ(re, im){
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++){
    let b = N >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; }
  }
  for (let len = 2; len <= N; len <<= 1){
    const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len){
      let cr = 1, ci = 0;
      for (let k = 0; k < len/2; k++){
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi;
        re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const nr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = nr;
      }
    }
  }
}

// ---- разбор одного прогона -------------------------------------------------
const ОКНО = 2048, СТОЛБ = 1150;
const НИЗ_F = 20, ВЕРХ_F = 16000, ВЫС_СП = 300;
function разбери(п){
  const {звук, шина} = п;
  const шаг = Math.max(1, Math.floor((звук.length - ОКНО) / СТОЛБ));
  const окн = new Float64Array(ОКНО);
  for (let i = 0; i < ОКНО; i++) окн[i] = .5 - .5*Math.cos(2*Math.PI*i/ОКНО);
  // спектрограмма: строка — логарифмическая частота, столбец — время
  const сп = new Float32Array(СТОЛБ*ВЫС_СП);
  const гр = [];   // границы строк по номерам корзин
  for (let y = 0; y < ВЫС_СП; y++){
    const f = НИЗ_F * Math.pow(ВЕРХ_F/НИЗ_F, 1 - y/(ВЫС_СП-1));
    гр.push(f*ОКНО/SR);
  }
  const re = new Float64Array(ОКНО), im = new Float64Array(ОКНО);
  const пол = [[20,200],[200,2000],[2000,16000]];
  const огПол = pol => new Float32Array(СТОЛБ);
  const огибП = [огПол(), огПол(), огПол()];
  const огиб = new Float32Array(СТОЛБ);
  let макс = 1e-12;
  for (let x = 0; x < СТОЛБ; x++){
    const o = x*шаг;
    for (let i = 0; i < ОКНО; i++){ re[i] = (звук[o+i]||0)*окн[i]; im[i] = 0; }
    ПФ(re, im);
    let скз = 0;
    const мод = new Float64Array(ОКНО/2);
    for (let k = 1; k < ОКНО/2; k++){
      мод[k] = Math.sqrt(re[k]*re[k] + im[k]*im[k])/ОКНО;
      скз += мод[k]*мод[k];
    }
    огиб[x] = Math.sqrt(скз);
    for (let b = 0; b < 3; b++){
      let e = 0;
      const k1 = Math.round(пол[b][0]*ОКНО/SR), k2 = Math.round(пол[b][1]*ОКНО/SR);
      for (let k = k1; k <= k2 && k < ОКНО/2; k++) e += мод[k]*мод[k];
      огибП[b][x] = Math.sqrt(e);
    }
    for (let y = 0; y < ВЫС_СП; y++){
      const k1 = гр[y], k2 = y ? гр[y-1] : гр[0]*1.02;
      let m = 0;
      for (let k = Math.max(1,Math.floor(k1)); k <= Math.min(ОКНО/2-1, Math.ceil(k2)); k++)
        if (мод[k] > m) m = мод[k];
      сп[y*СТОЛБ + x] = m;
      if (m > макс) макс = m;
    }
  }
  // ШИНА по той же оси времени, но НЕ одним отсчётом на столбец: она ходит
  // со звуковой скоростью, и выборка её промахивала — получался частокол.
  // Берём минимум и максимум за столбец: видно и уровень, и размах.
  const шинаМин = new Float32Array(СТОЛБ), шинаМак = new Float32Array(СТОЛБ);
  const шинаX = new Float32Array(СТОЛБ);
  for (let x = 0; x < СТОЛБ; x++){
    const b0 = Math.floor(x*шаг/п.n), b1 = Math.max(b0+1, Math.floor((x+1)*шаг/п.n));
    let mn = 1e9, mx = -1e9, s2 = 0, k = 0;
    for (let b = b0; b < b1 && b < шина.length; b++){
      const v = шина[b]; if (v<mn) mn=v; if (v>mx) mx=v; s2+=v; k++;
    }
    шинаМин[x] = k?mn:0; шинаМак[x] = k?mx:0; шинаX[x] = k?s2/k:0;
  }
  // СПЕКТР ОГИБАЮЩЕЙ. Частота кадров = SR/шаг, обычно около 240 в секунду.
  const кадр = SR/шаг;
  const модСп = [];
  for (let b = 0; b < 3; b++){
    const e = огибП[b], ср = e.reduce((a,v)=>a+v,0)/e.length;
    const строка = [];
    for (let i = 0; i < 240; i++){
      const f = .2 * Math.pow(40/.2, i/239);
      let cr=0, ci=0; const w = 2*Math.PI*f/кадр;
      for (let j = 0; j < e.length; j++){ const d = e[j]-ср; cr += d*Math.cos(w*j); ci -= d*Math.sin(w*j); }
      строка.push(Math.sqrt(cr*cr+ci*ci)/e.length/(ср||1e-12));
    }
    модСп.push(строка);
  }
  return {сп, макс, огиб, огибП, шинаX, шинаМин, шинаМак, модСп, кадр, шаг};
}

// ---- рисование -------------------------------------------------------------
const W = 1200, ЛЕВ = 42;
function холст(H){
  const п = new Uint8Array(W*H*3);
  for (let i = 0; i < п.length; i += 3){ п[i]=8; п[i+1]=9; п[i+2]=11; }
  return {п, H};
}
const точка = (h,x,y,r,g,b) => {
  if (x<0||y<0||x>=W||y>=h.H) return;
  const i = (y*W+x)*3; h.п[i]=r; h.п[i+1]=g; h.п[i+2]=b;
};
const линия = (h,x0,y0,x1,y1,r,g,b) => {
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
  const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let er=dx-dy, x=x0, y=y0;
  for(;;){ точка(h,x,y,r,g,b); if(x===x1&&y===y1) break;
    const e2=2*er; if(e2>-dy){er-=dy;x+=sx;} if(e2<dx){er+=dx;y+=sy;} }
};
// цвет спектрограммы: от угля через багрянец к белому
function жар(t){
  t = t<0?0:t>1?1:t;
  const с = [[8,9,11],[40,20,60],[130,35,70],[210,90,40],[250,180,90],[255,245,220]];
  const u = t*(с.length-1), i = Math.min(с.length-2, Math.floor(u)), f = u-i;
  return [0,1,2].map(k => Math.round(с[i][k] + (с[i+1][k]-с[i][k])*f));
}
// ---- крохотный шрифт 5×7 для подписей -------------------------------------
const ШР = {
 '0':'111101101101111','1':'010110010010111','2':'111001111100111',
 '3':'111001111001111','4':'101101111001001','5':'111100111001111',
 '6':'111100111101111','7':'111001001001001','8':'111101111101111',
 '9':'111101111001111','.':'000000000000010','-':'000000111000000',
 'k':'100101110101101','H':'101101111101101','z':'111001010100111',
 's':'011100010001110','V':'101101101101010','d':'001001111101111',
 'B':'110101110101110','A':'111101111101101','F':'111100110100100',
 'T':'111010010010010','O':'111101101101111','N':'101111111101101',
 '=':'000111000111000',' ':'000000000000000',
};
function знак(h, ch, x, y, r,g,b){
  const m = ШР[ch]; if (!m) return;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++)
    if (m[j*3+i] === '1') точка(h, x+i, y+j, r,g,b);
}
function надпись(h, s, x, y, r=120,g=130,b=140){
  for (let i = 0; i < s.length; i++) знак(h, s[i], x+i*4, y, r,g,b);
}

// ---- панели ----------------------------------------------------------------
const ВЫС_ГР = 78, ВЫС_ШИН = 62, ВЫС_МОД = 118, ЗАЗОР = 16;
const ВЫСОТА_БЛОКА = ВЫС_СП + ЗАЗОР + ВЫС_ГР + ЗАЗОР + ВЫС_ШИН + ЗАЗОР + ВЫС_МОД + 26;

function блок(h, y0, р, подпись){
  // --- спектрограмма ---
  const порог = 1e-7;
  for (let x = 0; x < СТОЛБ; x++) for (let y = 0; y < ВЫС_СП; y++){
    const m = р.сп[y*СТОЛБ+x];
    const дб = 20*Math.log10(Math.max(порог, m)/р.макс);
    const [r,g,b] = жар((дб + 78)/78);
    точка(h, ЛЕВ+x, y0+y, r,g,b);
  }
  for (const f of [100,1000,10000]){
    const y = Math.round((1 - Math.log(f/НИЗ_F)/Math.log(ВЕРХ_F/НИЗ_F))*(ВЫС_СП-1));
    for (let x = ЛЕВ; x < ЛЕВ+СТОЛБ; x += 6) точка(h, x, y0+y, 70,80,95);
    надпись(h, f>=1000?(f/1000)+'k':''+f, 6, y0+y-2, 90,100,115);
  }
  надпись(h, подпись, ЛЕВ+4, y0+4, 200,210,220);

  // --- громкость ---
  let y = y0 + ВЫС_СП + ЗАЗОР;
  const мкс = Math.max(...р.огиб);
  for (const дб of [-6,-18,-30,-42]){
    const yy = y + Math.round(-дб/48*(ВЫС_ГР-1));
    for (let x = ЛЕВ; x < ЛЕВ+СТОЛБ; x += 10) точка(h, x, yy, 40,46,54);
    надпись(h, ''+дб, 10, yy-2, 70,78,90);
  }
  let пред = null;
  for (let x = 0; x < СТОЛБ; x++){
    const дб = 20*Math.log10(Math.max(1e-9, р.огиб[x])/мкс);
    const yy = y + Math.round(Math.min(1, -дб/48)*(ВЫС_ГР-1));
    if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, 120,220,140);
    пред = yy;
  }
  надпись(h, 'dB', 10, y+ВЫС_ГР-6, 90,110,95);

  // --- шина ---
  y += ВЫС_ГР + ЗАЗОР;
  let мин=1e9, мак=-1e9;
  for (let x=0;x<СТОЛБ;x++){ if(р.шинаМин[x]<мин) мин=р.шинаМин[x]; if(р.шинаМак[x]>мак) мак=р.шинаМак[x]; }
  const раз = Math.max(.05, мак-мин);
  const кY = v => y + Math.round((1 - (v-мин)/раз)*(ВЫС_ШИН-1));
  for (let x = 0; x < СТОЛБ; x++){
    const a1 = кY(р.шинаМак[x]), b1 = кY(р.шинаМин[x]);
    for (let yy = a1; yy <= b1; yy++) точка(h, ЛЕВ+x, yy, 120,80,40);
  }
  пред = null;
  for (let x = 0; x < СТОЛБ; x++){
    const yy = кY(р.шинаX[x]);
    if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, 240,180,95);
    пред = yy;
  }
  надпись(h, мак.toFixed(1)+'V', 6, y, 130,110,80);
  надпись(h, мин.toFixed(1)+'V', 6, y+ВЫС_ШИН-6, 130,110,80);

  // --- спектр огибающей ---
  y += ВЫС_ШИН + ЗАЗОР;
  // ЗАКРАСКИ ПОЛОСЫ ЗДЕСЬ БОЛЬШЕ НЕТ. Она отмечала «полосу комедии» — то
  // есть рисовала вывод поверх данных, и глаз шёл к нему прежде, чем к самой
  // кривой. Если полоса понадобится, её накладывает разбор.
  const кx = f => Math.round(Math.log(f/.2)/Math.log(40/.2)*(СТОЛБ-1));
  for (const f of [.5,1,5,10,20]){
    const x = кx(f);
    for (let j = 0; j < ВЫС_МОД; j += 6) точка(h, ЛЕВ+x, y+j, 45,50,60);
    надпись(h, ''+f, ЛЕВ+x-3, y+ВЫС_МОД+3, 80,88,100);
  }
  const цв = [[240,110,110],[120,200,240],[160,240,150]];
  let пик = [0,0,0], пикF = [0,0,0];
  for (let b = 0; b < 3; b++){
    const с = р.модСп[b];
    const мкс2 = Math.max(...с, 1e-9);
    пред = null;
    for (let i = 0; i < с.length; i++){
      const x = Math.round(i/(с.length-1)*(СТОЛБ-1));
      const yy = y + Math.round((1 - с[i]/мкс2)*(ВЫС_МОД-1));
      if (пред !== null) линия(h, ЛЕВ+пред[0], пред[1], ЛЕВ+x, yy, ...цв[b]);
      пред = [x, yy];
      if (с[i] > пик[b]){ пик[b] = с[i]; пикF[b] = .2*Math.pow(200, i/(с.length-1)); }
    }
  }
  надпись(h, 'Hz', 8, y+ВЫС_МОД+3, 80,88,100);
  return {пик, пикF};
}

// ---- PNG -------------------------------------------------------------------
function png(h){
  const сыро = Buffer.alloc((W*3+1)*h.H);
  for (let y = 0; y < h.H; y++){
    сыро[y*(W*3+1)] = 0;
    Buffer.from(h.п.buffer, y*W*3, W*3).copy(сыро, y*(W*3+1)+1);
  }
  const таб = new Int32Array(256);
  for (let n = 0; n < 256; n++){ let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
    таб[n] = c; }
  const crc = b => { let c = -1;
    for (let i = 0; i < b.length; i++) c = таб[(c ^ b[i]) & 255] ^ (c>>>8);
    return (c ^ -1) >>> 0; };
  const кус = (тип, дан) => {
    const л = Buffer.alloc(4); л.writeUInt32BE(дан.length);
    const т = Buffer.concat([Buffer.from(тип), дан]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(т));
    return Buffer.concat([л, т, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(h.H, 4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    кус('IHDR', ihdr), кус('IDAT', deflateSync(сыро, {level:9})), кус('IEND', Buffer.alloc(0))]);
}

// ---- WAV -------------------------------------------------------------------
function wav(x){
  const n = x.length, b = Buffer.alloc(44 + n*2);
  b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVE',8); b.write('fmt ',12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(SR,24); b.writeUInt32LE(SR*2,28); b.writeUInt16LE(2,32);
  b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40);
  for (let i = 0; i < n; i++){
    const v = Math.max(-1, Math.min(1, x[i]));
    b.writeInt16LE(Math.round(v*32767), 44+i*2);
  }
  return b;
}

// ---- сборка ----------------------------------------------------------------
const ПАПКА = process.env.OTZVUK_OUT || (homedir()+'/Documents/otzvuk/портреты');
mkdirSync(ПАПКА, {recursive:true});

// Чтение живой записи идёт мимо прогона: там нечего играть, там уже
// измеренное.
if (дов.includes('--щуп')){
  shchupVKartinku(дов[дов.indexOf('--щуп')+1], имя === 'портрет' ? null : имя);
  process.exit(0);
}
if (дов.includes('--запись')){
  zapisVKartinku(дов[дов.indexOf('--запись')+1], имя === 'портрет' ? null : имя);
  process.exit(0);
}

const A = прогон(прав), рA = разбери(A);
let B = null, рB = null;
if (естьПротив){ B = прогон({...прав, ...против}); рB = разбери(B); }
// общий масштаб: иначе два портрета не сравнить глазом
if (рB){ const m = Math.max(рA.макс, рB.макс); рA.макс = m; рB.макс = m; }

const H = ВЫСОТА_БЛОКА*(рB?2:1) + 14;
const h = холст(H);
const описA = Object.keys(прав).length ? Object.entries(прав).map(([k,v])=>k+'='+v).join(' ') : 'номинал';
const меткаA = естьПротив ? 'A' : '', меткаB = 'B';
const A1 = блок(h, 8, рA, меткаA);
let B1 = null;
if (рB) B1 = блок(h, 8+ВЫСОТА_БЛОКА, рB, меткаB);

writeFileSync(ПАПКА+'/'+имя+'.png', png(h));
writeFileSync(ПАПКА+'/'+имя+'.wav', wav(A.звук));
if (B) writeFileSync(ПАПКА+'/'+имя+'-против.wav', wav(B.звук));

// ---- числа рядом с картинкой ----------------------------------------------
const скз = x => { let s=0; for(const v of x) s+=v*v; return Math.sqrt(s/x.length); };
const свод = (п, р, n) => {
  const мин = Math.min(...р.шинаX), мак = Math.max(...р.шинаX);
  const ср = р.шинаX.reduce((a,v)=>a+v,0)/р.шинаX.length;
  console.log('  '+n);
  console.log('    уровень      '+(20*Math.log10(Math.max(1e-9,скз(п.звук)))).toFixed(1)+' дБ');
  console.log('    шина         '+ср.toFixed(2)+' В  (от '+мин.toFixed(2)+' до '+мак.toFixed(2)
    +', рябь '+((мак-мин)/ср*100).toFixed(1)+' %)');
  // Полосы огибающей печатаются ЧИСЛАМИ БЕЗ НАЗВАНИЙ и без порогов: как их
  // толковать, решается в разборе и человеком, а не здесь.
  const полосыОг = [[.2,.5],[.5,2],[2,5],[5,20]];
  const стр = полосыОг.map(([a,b]) => {
    let s2 = 0, ш = 0;
    for (let bb = 0; bb < 3; bb++){
      const с = р.модСп[bb];
      const кx = f => Math.round(Math.log(f/.2)/Math.log(40/.2)*(с.length-1));
      for (let i = кx(a); i <= кx(b); i++){ s2 += с[i]; ш++; }
    }
    return a+'-'+b+' Гц '+(ш? s2/ш : 0).toFixed(4);
  }).join(' · ');
  console.log('    огибающая    '+стр);
};
console.log('ПОРТРЕТ · сборка '+семя+' · '+сек+' с');
свод(A, рA, описA);
console.log('    пики огибающей по полосам: низ '+A1.пикF[0].toFixed(2)+' Гц · середина '
  +A1.пикF[1].toFixed(2)+' Гц · верх '+A1.пикF[2].toFixed(2)+' Гц');
if (B){ свод(B, рB, Object.entries(против).map(([k,v])=>k+'='+v).join(' '));
  console.log('    пики огибающей по полосам: низ '+B1.пикF[0].toFixed(2)+' Гц · середина '
    +B1.пикF[1].toFixed(2)+' Гц · верх '+B1.пикF[2].toFixed(2)+' Гц'); }
console.log('\n  ' + ПАПКА+'/'+имя+'.png');
console.log('  ' + ПАПКА+'/'+имя+'.wav' + (B?'  и  -против.wav':''));


// ============================================================================
//  ЧТЕНИЕ БЫСТРОГО ЩУПА.
//
//  Полсекунды схемы, записанные каждый отсчёт. Здесь видно то, чего не видит
//  ни один усреднённый снимок: как узел ползёт к порогу, в какой миг
//  переключается, что при этом делает питание и куда идёт ток по ветвям.
//
//    node portret.mjs --щуп <файл.f32> [имя]
// ============================================================================
export function shchupVKartinku(путь, имя){
  const бок = JSON.parse(readFileSync(путь.replace(/\.f32$/, '')+'.json', 'utf8'));
  const сыр = readFileSync(путь);
  const P = бок.polya.length, N = бок.otschetov, sr = бок.sr;
  const д = new Float32Array(сыр.buffer, сыр.byteOffset, N*P);
  const пол = и => бок.polya.indexOf(и);
  const ном = бок.nominaly || {};

  const ВЫС_У = 190, ВЫС_ТОК = 120, ВЫС_ПИТ = 80, ЗАЗ = 18;
  const H = ВЫС_У + ЗАЗ + ВЫС_ТОК + ЗАЗ + ВЫС_ПИТ + 34;
  const h = холст(H);
  const стб = СТОЛБ, шаг = N/стб;
  const взять = (x, к) => д[Math.min(N-1, Math.round(x*шаг))*P + к];

  // --- узлы и пороги ---
  const iV = [пол('ген1_V'), пол('ген2_V'), пол('ген3_V')];
  const iС = пол('состояния'), iП = пол('питание_V');
  let мин = 1e9, мак = -1e9;
  for (let i = 0; i < N; i++) for (const k of iV){
    const v = д[i*P+k]; if (v > 1e-9){ if (v < мин) мин = v; if (v > мак) мак = v; }
  }
  // Питание в этот масштаб НЕ входит: оно вчетверо выше порогов и сплющивало
  // узлы в верхнюю треть. У него своя панель внизу.
  const запас = (мак-мин)*.15;
  мин -= запас; мак += запас;
  const кY = v => 8 + Math.round((1 - (v-мин)/Math.max(1e-9, мак-мин))*(ВЫС_У-1));
  // Пороги того же экземпляра — линиями, чтобы ползание к ним было видно.
  for (let g = 0; g < 3; g++){
    const вв = ном['vt'+g+'_vverh'], нн = ном['vt'+g+'_vniz'];
    if (вв === undefined) continue;
    const Vп = д[iП];
    for (const [пор, цв] of [[вв*Vп, [70,55,45]], [нн*Vп, [50,45,60]]])
      for (let x = 0; x < стб; x += 3) точка(h, ЛЕВ+x, кY(пор), ...цв);
  }
  const цвГ = [[240,120,110],[120,200,240],[160,240,150]];
  for (let g = 0; g < 3; g++){
    if (iV[g] < 0) continue;
    let пред = null, есть = false;
    for (let x = 0; x < стб; x++){
      const v = взять(x, iV[g]);
      if (v <= 1e-9) continue;
      есть = true;
      const yy = кY(v);
      if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, ...цвГ[g]);
      пред = yy;
    }
    if (!есть) continue;
  }
  // щелчки — вертикальными засечками понизу
  // ЗАСЕЧКИ ПО ВСЕМУ СТОЛБЦУ, а не по одной пробе: столбец накрывает два
  // десятка отсчётов, и переключение почти всегда проходило между пробами —
  // на картинке их было видно пять вместо ста двадцати.
  for (let x = 0; x < стб; x++){
    const a = Math.round(x*шаг), b = Math.min(N, Math.round((x+1)*шаг));
    let м = 0;
    for (let i = a; i < b; i++) м |= д[i*P+iС];
    for (let g = 0; g < 3; g++) if (м & (8 << g))
      for (let j = 0; j < 6; j++) точка(h, ЛЕВ+x, 8+ВЫС_У-1-j-g*7, ...цвГ[g]);
  }
  надпись(h, мак.toFixed(1)+'V', 6, 8, 110,120,130);
  надпись(h, мин.toFixed(1)+'V', 6, 8+ВЫС_У-6, 110,120,130);

  // --- ток по ветвям, посчитанный по тем же формулам ---
  let y = 8 + ВЫС_У + ЗАЗ;
  const iR = [пол('Rзар1'), пол('Rзар2'), пол('Rзар3')];
  const токи = [];
  for (let g = 0; g < 3; g++){
    const ряд = new Float32Array(стб);
    for (let x = 0; x < стб; x++){
      const i = Math.min(N-1, Math.round(x*шаг));
      const Rз = д[i*P+iR[g]], V = д[i*P+iV[g]], Vdd = д[i*P+iП];
      if (!(Rз > 0)) { ряд[x] = 0; continue; }
      const q = (д[i*P+iС] >> g) & 1;
      const Rf = Rз + (ном.Rvyh || 0);
      const kmin = ном['vt'+g+'_vniz'] ? 1/ном['vt'+g+'_vniz'] - 1 + .09 : 1.4;
      const Ru = Rз * Math.max(20, kmin);
      ряд[x] = ((q ? Vdd : 0) - V)/Rf + (Vdd - V)/Ru - V*(ном.Gut || 0);
    }
    токи.push(ряд);
  }
  let тм = 0;
  for (const р of токи) for (const v of р) if (Math.abs(v) > тм) тм = Math.abs(v);
  for (let x = ЛЕВ; x < ЛЕВ+стб; x += 8) точка(h, x, y+ВЫС_ТОК/2, 45,50,60);
  for (let g = 0; g < 3; g++){
    let пред = null;
    for (let x = 0; x < стб; x++){
      const yy = y + Math.round(ВЫС_ТОК/2 - токи[g][x]/Math.max(1e-15,тм)*(ВЫС_ТОК/2-1));
      if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, ...цвГ[g]);
      пред = yy;
    }
  }
  надпись(h, (тм*1e6).toFixed(1), 6, y, 110,120,130);
  надпись(h, '-'+(тм*1e6).toFixed(1), 4, y+ВЫС_ТОК-6, 110,120,130);

  // --- питание и ток капсюля ---
  y += ВЫС_ТОК + ЗАЗ;
  for (const [к, цв] of [[iП, [240,180,95]], [пол('капсюль_I'), [200,120,220]]]){
    if (к < 0) continue;
    let a = 1e9, b = -1e9;
    for (let i = 0; i < N; i++){ const v = д[i*P+к]; if (v<a) a=v; if (v>b) b=v; }
    if (b-a < 1e-12) b = a+1;
    let пред = null;
    for (let x = 0; x < стб; x++){
      const yy = y + Math.round((1-(взять(x,к)-a)/(b-a))*(ВЫС_ПИТ-1));
      if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, ...цв);
      пред = yy;
    }
    if (к === iП){ надпись(h, b.toFixed(2), 6, y, 130,110,80);
                   надпись(h, a.toFixed(2), 6, y+ВЫС_ПИТ-6, 130,110,80); }
  }
  for (let мс = 0; мс <= N/sr*1000; мс += 50){
    const x = Math.round(мс/1000*sr/шаг);
    if (x >= стб) break;
    for (let j = 0; j < 5; j++) точка(h, ЛЕВ+x, y+ВЫС_ПИТ+2+j, 70,78,90);
    надпись(h, ''+мс, ЛЕВ+x-4, y+ВЫС_ПИТ+9, 80,88,100);
  }

  const вых = ПАПКА+'/'+(имя || путь.split('/').pop().replace('.f32',''))+'.png';
  writeFileSync(вых, png(h));

  // --- числа ---
  console.log('БЫСТРЫЙ ЩУП · '+бок.имя+' · '+N+' отсчётов ('+(N/sr*1000).toFixed(0)+' мс) · '+P+' полей');
  let щ = [0,0,0];
  for (let i = 0; i < N; i++){ const с = д[i*P+iС];
    for (let g = 0; g < 3; g++) if (с & (8<<g)) щ[g]++; }
  for (let g = 0; g < 3; g++){
    if (!(д[iR[g]] > 0) && !щ[g]){ console.log('  ген'+(g+1)+'  погашен'); continue; }
    const V = [], I = [];
    for (let i = 0; i < N; i++) V.push(д[i*P+iV[g]]);
    console.log('  ген'+(g+1)+'  переключений '+щ[g]+' → '+(щ[g]/2/(N/sr)).toFixed(1)+' Гц'
      +'   V от '+Math.min(...V).toFixed(2)+' до '+Math.max(...V).toFixed(2)+' В'
      +'   ток ±'+(Math.max(...токи[g].map(Math.abs))*1e6).toFixed(2)+' мкА');
    if (ном['vt'+g+'_vverh'] !== undefined)
      console.log('        пороги экземпляра '+(ном['vt'+g+'_vniz']*д[iП]).toFixed(2)
        +' / '+(ном['vt'+g+'_vverh']*д[iП]).toFixed(2)+' В'
        +'   C '+((ном.C ? ном.C[g] : 0)*1e9).toFixed(2)+' нФ');
  }
  const пит = [], кап = [];
  for (let i = 0; i < N; i++){ пит.push(д[i*P+iП]); кап.push(д[i*P+пол('капсюль_I')]); }
  console.log('  питание  от '+Math.min(...пит).toFixed(3)+' до '+Math.max(...пит).toFixed(3)
    +' В  (размах '+((Math.max(...пит)-Math.min(...пит))/Math.max(...пит)*100).toFixed(2)+'%)');
  console.log('  капсюль  от '+(Math.min(...кап)*1e3).toFixed(1)+' до '
    +(Math.max(...кап)*1e3).toFixed(1)+' мА');
  console.log('  номиналов сборки в записи: '+Object.keys(ном).length);
  console.log('');
  console.log('  '+вых);
}

// ============================================================================
//  ЧТЕНИЕ ЖИВОЙ ЗАПИСИ.
//
//  Единственный смысл всего этого — чтобы я понимал, что он слышит, и как
//  устроено то, что мы правим. Не словарь явлений, не эталоны, не приговоры:
//  он показывает пальцем на кусок звука, я смотрю на числа этого куска.
//
//  Записи кладёт окно по ⌥p: двадцать секунд кадров, обе кривые модуляции и
//  полное состояние прибора. Отсчётов там нет — только описание, — поэтому
//  спектрограмма рисуется по треть-октавным полосам, а не по корзинам.
//
//    node portret.mjs --запись <файл.json> [имя]
// ============================================================================
export function zapisVKartinku(путь, имя){
  const з = JSON.parse(readFileSync(путь, 'utf8'));
  const к = з.kadry || [];
  if (!к.length){ console.log('в записи нет кадров'); return; }
  const П = к[0].polosy ? к[0].polosy.length : 0;
  const ВЫС = П*8;                       // полоса восемь точек высотой
  const ВЫС_ЛИН = 78, ЗАЗ = 16;
  const H = ВЫС + ЗАЗ + ВЫС_ЛИН + ЗАЗ + ВЫС_ЛИН + ЗАЗ + 130 + 30;
  const h = холст(H);
  // Растягиваем на всю ширину: кадров бывает и триста, и восемь тысяч, а
  // картинка должна читаться одинаково.
  const стб = СТОЛБ;
  const проб = i => к[Math.min(к.length-1, Math.round(i*(к.length-1)/(стб-1)))];

  // --- полосы во времени ---
  let мкс = -999, мин = 999;
  for (const кк of к) for (const v of (кк.polosy||[])){ if (v>мкс) мкс=v; if (v>-119 && v<мин) мин=v; }
  const низ = Math.max(мин, мкс-72);
  for (let x = 0; x < стб; x++){
    const пл = проб(x).polosy || [];
    for (let b = 0; b < П; b++){
      const [r,g,bl] = жар((пл[b]-низ)/Math.max(1,мкс-низ));
      for (let j = 0; j < 8; j++) точка(h, ЛЕВ+x, 8+(П-1-b)*8+j, r,g,bl);
    }
  }
  for (const [b,подп] of [[0,'20'],[9,'160'],[18,'1k'],[27,'10k']])
    надпись(h, подп, 6, 8+(П-1-b)*8+2, 95,105,120);

  // --- громкость и высота ---
  let y = 8 + ВЫС + ЗАЗ;
  const линКр = (поле, цв, лог) => {
    const зн = к.map(кк => кк[поле]).filter(v => typeof v === 'number' && isFinite(v));
    if (!зн.length) return null;
    let a = Math.min(...зн), b2 = Math.max(...зн);
    if (b2-a < 1e-9) b2 = a+1;
    let пред = null;
    for (let x = 0; x < стб; x++){
      const v = проб(x)[поле];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const yy = y + Math.round((1-(v-a)/(b2-a))*(ВЫС_ЛИН-1));
      if (пред !== null) линия(h, ЛЕВ+x-1, пред, ЛЕВ+x, yy, ...цв);
      пред = yy;
    }
    return [a, b2];
  };
  const гр = линКр('skz_dB', [120,220,140]);
  const вы = линКр('hps_f0', [120,170,240]);
  if (гр){ надпись(h, гр[1].toFixed(0), 6, y, 90,120,95);
           надпись(h, гр[0].toFixed(0), 6, y+ВЫС_ЛИН-6, 90,120,95); }
  if (вы){ надпись(h, вы[1].toFixed(0), ЛЕВ+СТОЛБ-30, y, 90,110,140);
           надпись(h, вы[0].toFixed(0), ЛЕВ+СТОЛБ-30, y+ВЫС_ЛИН-6, 90,110,140); }

  // --- шина и частота ячейки ---
  y += ВЫС_ЛИН + ЗАЗ;
  const ш = линКр('shina', [240,180,95]);
  const пи = линКр('pitch', [240,110,110]);
  if (ш){ надпись(h, ш[1].toFixed(2), 6, y, 130,110,80);
          надпись(h, ш[0].toFixed(2), 6, y+ВЫС_ЛИН-6, 130,110,80); }

  // --- кривые модуляции ---
  y += ВЫС_ЛИН + ЗАЗ;
  const кр = з.krivye || {};
  for (const [к2, цв] of [[кр.medlennaya,[120,200,240]], [кр.bystraya,[160,240,150]]]){
    if (!к2 || !к2.chastoty) continue;
    const мк = Math.max(...к2.krivaya, 1e-9);
    const кx = f => Math.round(Math.log(Math.max(.08,f)/.08)/Math.log(400/.08)*(СТОЛБ-1));
    let пред = null;
    for (let i = 0; i < к2.chastoty.length; i++){
      const x = кx(к2.chastoty[i]);
      const yy = y + Math.round((1-к2.krivaya[i]/мк)*129);
      if (пред) линия(h, ЛЕВ+пред[0], пред[1], ЛЕВ+x, yy, ...цв);
      пред = [x, yy];
    }
  }
  {
    const кx = f => Math.round(Math.log(f/.08)/Math.log(400/.08)*(СТОЛБ-1));
    for (const f of [.1,1,10,100]){
      const x = кx(f);
      for (let j = 0; j < 130; j += 6) точка(h, ЛЕВ+x, y+j, 45,50,60);
      надпись(h, f<1?'.1':''+f, ЛЕВ+x-3, y+133, 80,88,100);
    }
    надпись(h, 'Hz', 8, y+133, 80,88,100);
  }
  const вых = ПАПКА+'/'+(имя || путь.split('/').pop().replace('.json',''))+'.png';
  writeFileSync(вых, png(h));

  // --- числа ---
  const мед = a => { const b2 = a.slice().sort((x,y2)=>x-y2); const n = b2.length;
    return n ? (n%2 ? b2[(n-1)/2] : (b2[n/2-1]+b2[n/2])/2) : 0; };
  const п = поле => мед(к.map(кк => кк[поле]).filter(v => typeof v === 'number' && isFinite(v)));
  const ход = поле => { const зн = к.map(кк => кк[поле]).filter(v => typeof v === 'number' && isFinite(v));
    return зн.length ? Math.max(...зн) - Math.min(...зн) : 0; };
  console.log('ЗАПИСЬ · '+(з.явление || з.метка || '?')+' · '+(з.imya || '')+' · кадров '+к.length
    +' · '+(к[к.length-1].t - к[0].t).toFixed(1)+' с');
  console.log('  уровень      '+п('skz_dB').toFixed(1)+' дБ   (ход '+ход('skz_dB').toFixed(1)+')');
  console.log('  пик к скз    '+п('pik_k_skz').toFixed(2));
  console.log('  спектр       середина '+п('spektr_m1').toFixed(0)+' Гц, разброс '
    +п('spektr_sigma').toFixed(0)+', скос '+п('spektr_skos').toFixed(2)
    +', плоскостность '+п('ploskost').toFixed(4));
  console.log('  высота       '+п('hps_f0').toFixed(1)+' Гц (ход '+ход('hps_f0').toFixed(0)
    +'), острота оценки '+п('hps_ostrota').toFixed(1));
  if (к[0].lufs !== undefined)
    console.log('  тракт        LUFS '+п('lufs').toFixed(1)+', ограничитель жмёт '
      +п('lim').toFixed(2)+' дБ, срывов счёта '+п('sryvy').toFixed(0));
  // ---- ТЕЧЕНИЕ ТОКА -------------------------------------------------------
  //
  // Ради этого щуп и заведён. Общий ток говорит только, сколько прибор жрёт;
  // звук делает РАСПРЕДЕЛЕНИЕ по ветвям — узел едет туда, куда его тянет их
  // сумма, и частота, скважность и срыв это спор ветвей между собой.
  if (к[0]['питание_узлов_V'] !== undefined){
    console.log('');
    console.log('  ТЕЧЕНИЕ ТОКА (медиана по куску, ход в скобках)');
    console.log('    шина  '+п('шина_V').toFixed(3)+' В → логика '
      +п('питание_узлов_V').toFixed(3)+' В   (ход '+ход('питание_узлов_V').toFixed(3)
      +')   Rвн '+п('Rвн_Ом').toFixed(1)+' Ом, Rдорожки '+п('Rдорожки_Ом').toFixed(0)+' Ом');
    console.log('    берут: логика '+п('ток_логики_мкА').toFixed(1)+' мкА · капсюль '
      +п('ток_капсюля_мА').toFixed(2)+' мА  → капсюль тянет '
      +(п('доля_капсюля')*100).toFixed(2)+'% всего тока');
    console.log('');
    console.log('    узел    V      цель   порог н/в      Iос     Iупр   Iутеч  сумма   τ     запас');
    for (let g = 1; g <= 3; g++){
      const пр = 'ген'+g+'_';
      if (к[0][пр+'погашен']) { console.log('    ген'+g+'   погашен'); continue; }
      if (к[0][пр+'V'] === undefined) continue;
      const ч = поле => п(пр+поле);
      console.log('    ген'+g+'  '+ч('V').toFixed(2).padStart(5)
        +ч('цель_V').toFixed(2).padStart(8)
        +(ч('порог_низ_V').toFixed(2)+'/'+ч('порог_верх_V').toFixed(2)).padStart(12)
        +ч('Iос_мкА').toFixed(2).padStart(9)
        +ч('Iупр_мкА').toFixed(2).padStart(9)
        +ч('Iутечки_мкА').toFixed(2).padStart(8)
        +ч('Iсумма_мкА').toFixed(2).padStart(7)
        +(ч('тау_мс').toFixed(1)+'мс').padStart(8)
        +ч('запас_до_срыва').toFixed(2).padStart(7));
    }
    console.log('    сопротивления цепи заряда, кОм: '
      +[1,2,3].map(g => к[0]['ген'+g+'_погашен'] ? '—' : п('ген'+g+'_Rзаряда_кОм').toFixed(0)).join(' · ')
      +'   ограничения: '
      +[1,2,3].map(g => к[0]['ген'+g+'_погашен'] ? '—' : п('ген'+g+'_Rограничения_кОм').toFixed(0)).join(' · '));
    console.log('    качели: медл '+п('качели_медл_V').toFixed(2)+' В, яркость '
      +п('качели_яркость').toFixed(3)+' (ход '+ход('качели_яркость').toFixed(3)
      +'), период '+п('качели_период_с').toFixed(3)+' с');
    console.log('    капсюль: ток '+п('капсюль_I_мА').toFixed(1)+' мА (ход '
      +ход('капсюль_I_мА').toFixed(1)+'), ход диффузора '+ход('капсюль_x_мм').toFixed(3)+' мм');
    console.log('    греется до '+п('температура_K').toFixed(2)+' K сверх комнаты, мощность '
      +(п('мощность_Вт')*1e3).toFixed(2)+' мВт');
  }
  for (const [чей, к2] of [['медленная', кр.medlennaya], ['быстрая', кр.bystraya]]){
    if (!к2 || !к2.chastoty) continue;
    let bi = 0;
    for (let i = 1; i < к2.krivaya.length; i++) if (к2.krivaya[i] > к2.krivaya[bi]) bi = i;
    const тчк = [];
    for (let i = 0; i < к2.chastoty.length; i += 9)
      тчк.push(к2.chastoty[i]+':'+к2.krivaya[i].toFixed(3));
    console.log('  '+чей.padEnd(12)+'вершина '+к2.chastoty[bi]+' Гц глубиной '
      +к2.krivaya[bi].toFixed(3)+'   шаг сетки '+к2.shag_Hz+' Гц');
    console.log('               '+тчк.join('  '));
  }
  console.log('');
  console.log('  '+вых);
}

