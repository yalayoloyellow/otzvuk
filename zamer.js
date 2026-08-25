// ЗАМЕР — описание звука числами. Один модуль и для живого окна, и для
// стендов: если бы их было два, они разошлись бы на первой правке, и я бы
// сравнивал несравнимое. Это уже случалось с панелью и с картиной.
//
// Зачем так много чисел. Я не слышу. Единственный путь к слуху — научиться
// переводить «мне не нравится» в величины, а для этого величин должно быть
// заведомо больше, чем нужно: какая окажется той самой, заранее неизвестно.
// Дешевле снять восемьдесят и потом выбросить семьдесят, чем гадать, какие
// пять снять.
//
// Устройство простое: кадр за кадром. В кадре мгновенные величины (по окну
// отсчётов), накопительные (по памяти огибающей) и внутренние (их даёт
// прибор, считать их тут нечем).
//
// Порядок величин выстроен по тому, КАК ухо разбирает звук:
//   громко ли · какой окраски · ровно ли звучит · как двигается во времени
//
// ПОСЛЕДНЕЕ — САМОЕ ВАЖНОЕ И САМОЕ РЕДКОЕ. Обычные анализаторы показывают
// спектр, а ухо отличает живое от механического по СПЕКТРУ ОГИБАЮЩЕЙ:
// медленнее пяти в секунду читается событиями, до двадцати зерном, выше
// тембром. Комичность живёт в полосе от полугерца до трёх и опознаётся не
// глубиной качания, а его РОВНОСТЬЮ: один чистый пик — метроном, размазанная
// горка — живое дыхание.

// ---- быстрое преобразование Фурье ------------------------------------------
export function pf(re, im){
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

// Октавные полосы: так слышит ухо, а не равномерной сеткой герц.
export const ПОЛОСЫ = [[20,40],[40,80],[80,160],[160,315],[315,630],
                       [630,1250],[1250,2500],[2500,5000],[5000,10000],[10000,16000]];
// Полосы ОГИБАЮЩЕЙ — по тому, как ухо их разбирает.
export const ПОЛОСЫ_ОГИБ = [['дрейф',.15,.5],['качание',.5,2],['пульс',2,5],
                            ['зерно',5,20],['треск',20,150]];

const дб = v => 20*Math.log10(Math.max(1e-12, v));

export class Zamer {
  // sr — частота отсчётов, okno — длина окна (степень двойки),
  // pamyat — сколько кадров держать для разбора огибающей
  constructor(sr, okno = 2048, pamyat = 1024){
    this.sr = sr; this.N = okno;
    this.re = new Float64Array(okno); this.im = new Float64Array(okno);
    this.mod = new Float64Array(okno/2);
    this.proshMod = new Float64Array(okno/2);
    this.okn = new Float64Array(okno);
    for (let i = 0; i < okno; i++) this.okn[i] = .5 - .5*Math.cos(2*Math.PI*i/okno);
    // границы октавных полос в корзинах
    this.grPolos = ПОЛОСЫ.map(([a,b]) => [Math.max(1,Math.round(a*okno/sr)),
                                          Math.min(okno/2-1, Math.round(b*okno/sr))]);
    // ПАМЯТЬ ОГИБАЮЩЕЙ. Кольцо: пишем по кругу, разбираем при спросе.
    this.pamyat = pamyat; this.pi = 0; this.pn = 0;
    this.ogib = new Float32Array(pamyat);                 // общая громкость
    this.ogibP = ПОЛОСЫ.map(() => new Float32Array(pamyat));
    this.vremya = new Float32Array(pamyat);
    this.t = 0;
    this.kadrov = 0;
    this.atak = 0; this.byloE = 0;
    // БЫСТРАЯ ОГИБАЮЩАЯ. Кадры идут двадцать пять в секунду, и по ним выше
    // десяти герц ничего не разобрать — а треск живёт на двадцати-полутора
    // сотнях. Поэтому внутри каждого окна считаем громкость по кусочкам в
    // миллисекунду и держим их отдельным кольцом на тысяче в секунду.
    // Без этого «зерно» и «треск» в кадре всегда нули, и я бы этого не
    // заметил: ноль выглядит как «нет качания», а не как «не измерено».
    // ВЫСОТА СЧИТАЕТСЯ ПО ДЛИННОМУ ОКНУ. На двух тысячах отсчётов корзина
    // шириной двадцать три герца, и ниже двухсот герц оценка разваливается:
    // на 155 Гц замер уходил в октаву вниз, на 110 не находил ничего. А
    // прибор живёт как раз на ста-трёхстах. Восемь тысяч отсчётов дают
    // корзину в шесть герц — там же ошибка падает до полупроцента.
    this.DL = 8192;
    this.dlin = new Float64Array(this.DL); this.di = 0; this.dn = 0;
    this.dre = new Float64Array(this.DL); this.dim = new Float64Array(this.DL);
    this.dokn = new Float64Array(this.DL);
    for (let i = 0; i < this.DL; i++) this.dokn[i] = .5 - .5*Math.cos(2*Math.PI*i/this.DL);
    this.БЫСТР = 1000;
    this.bystr = new Float32Array(4096); this.bi = 0; this.bn = 0;
  }

  // x — окно отсчётов длиной N; vnutr — то, что знает только прибор;
  // dt — сколько времени прошло с прошлого кадра, с
  kadr(x, vnutr = {}, dt = this.N/this.sr){
    const {N, sr, re, im, mod} = this;
    this.t += dt; this.kadrov++;
    let pik = 0, kv = 0, nol = 0;
    for (let i = 0; i < N; i++){
      const v = x[i] || 0;
      const a = v < 0 ? -v : v;
      if (a > pik) pik = a;
      kv += v*v;
      if (i && ((v < 0) !== ((x[i-1]||0) < 0))) nol++;
      re[i] = v * this.okn[i]; im[i] = 0;
    }
    const skz = Math.sqrt(kv/N);
    pf(re, im);
    let summa = 0;
    for (let k = 1; k < N/2; k++){
      mod[k] = Math.sqrt(re[k]*re[k] + im[k]*im[k]) / N;
      summa += mod[k];
    }
    const S = Math.max(1e-15, summa);

    // ---- окраска ----
    let centr = 0, gm = 0, potok = 0;
    for (let k = 1; k < N/2; k++){
      const f = k*sr/N;
      centr += f * mod[k];
      gm += Math.log(Math.max(1e-15, mod[k]));
      const d = mod[k] - this.proshMod[k];
      if (d > 0) potok += d;                    // только рост: так слышны атаки
      this.proshMod[k] = mod[k];
    }
    centr /= S;
    // плоскостность: среднее геометрическое к среднему арифметическому.
    // Единица — белый шум, ноль — чистый тон. Это и есть «шумность».
    const ploskost = Math.exp(gm/(N/2-1)) / (S/(N/2-1));
    // спад: где набирается 85% энергии — граница слышимого верха
    let nak = 0, spad = 0;
    for (let k = 1; k < N/2; k++){ nak += mod[k]; if (nak >= S*.85){ spad = k*sr/N; break; } }
    // разброс вокруг центроида — насколько звук «широк»
    let razbr = 0;
    for (let k = 1; k < N/2; k++){ const d = k*sr/N - centr; razbr += d*d*mod[k]; }
    razbr = Math.sqrt(razbr/S);

    // ---- шероховатость ----
    // Две частичные, отстоящие примерно на четверть критической полосы, дают
    // биения, которые ухо слышит как жёсткость. Это то самое «неприятно»,
    // которого нет ни в громкости, ни в спектре по отдельности.
    const versh = [];
    for (let k = 2; k < N/2-1; k++)
      if (mod[k] > mod[k-1] && mod[k] >= mod[k+1] && mod[k] > S*.004)
        versh.push([k*sr/N, mod[k]]);
    versh.sort((a,b) => b[1]-a[1]);
    const верш = versh.slice(0, 24);
    let sher = 0;
    for (let i = 0; i < верш.length; i++) for (let j = i+1; j < верш.length; j++){
      const f1 = Math.min(верш[i][0], верш[j][0]), f2 = Math.max(верш[i][0], верш[j][0]);
      const df = f2 - f1;
      // ширина критической полосы по Цвикеру
      const kb = 25 + 75*Math.pow(1 + 1.4*Math.pow(f1/1000, 2), .69);
      const s = df / kb;
      // накрывающая кривая Плампа–Левелта: пик около четверти полосы
      sher += верш[i][1]*верш[j][1]/(S*S) * s*Math.exp(1-s)/.3679 * (s < 4 ? 1 : 0);
    }

    // ---- высота и гармоничность ----
    // ПО ПРОИЗВЕДЕНИЮ ГАРМОНИК, а не по автокорреляции. Автокорреляция от
    // окна в две тысячи отсчётов кольцевая: хвост заворачивается на начало,
    // и вершина уезжает к коротким сдвигам. Замер честно сообщал 233 Гц там,
    // где стояло 220, — то есть врал на шесть процентов и выглядел при этом
    // правдоподобно. Хуже всего именно такие ошибки.
    //
    // Произведение спектра с его же сжатыми копиями складывает все гармоники
    // в основную, и лишнего преобразования не нужно вовсе — дешевле.
    let f0 = 0, tonal = 0;
    if (this.dn >= this.DL){
      const DL = this.DL, dre = this.dre, dim = this.dim;
      for (let i = 0; i < DL; i++){
        dre[i] = this.dlin[(this.di + i) % DL] * this.dokn[i]; dim[i] = 0;
      }
      pf(dre, dim);
      const дм = new Float64Array(DL/2);
      for (let k = 1; k < DL/2; k++) дм[k] = Math.sqrt(dre[k]*dre[k] + dim[k]*dim[k])/DL;
      const верхK = Math.min(DL/2-1, Math.floor(2000*DL/sr));
      const низK = Math.max(2, Math.floor(35*DL/sr));
      let лучш = 0, лучшK = 0, сум = 0, шт = 0;
      for (let k = низK; k <= верхK; k++){
        let p = дм[k];
        for (let г = 2; г <= 4; г++){ const kk = k*г; p *= kk < DL/2 ? дм[kk] : 0; }
        p = Math.pow(Math.max(0, p), .25);
        сум += p; шт++;
        if (p > лучш){ лучш = p; лучшK = k; }
      }
      if (лучшK > низK && лучшK < верхK && лучш > 0){
        // Уточняем по самой громкой гармонике: на четвёртой та же корзина
        // вчетверо мельче по отношению к частоте. Делим обратно — разрешение
        // вчетверо лучше даром.
        let гл = 1, глM = 0;
        for (let г = 1; г <= 4; г++){
          const kk = Math.round(лучшK*г);
          if (kk < DL/2 && дм[kk] > глM){ глM = дм[kk]; гл = г; }
        }
        const kг = Math.round(лучшK*гл);
        const у0 = дм[kг-1]||0, у1 = дм[kг]||0, у2 = дм[kг+1]||0;
        const d = у0 - 2*у1 + у2;
        const сдв = Math.abs(d) > 1e-20 ? .5*(у0-у2)/d : 0;
        f0 = (kг + Math.max(-.5, Math.min(.5, сдв))) * sr/DL / гл;
        tonal = Math.min(1, лучш/Math.max(1e-15, сум/Math.max(1,шт))/12);
      }
    }

    // ---- длинное кольцо для высоты ----
    for (let i = 0; i < N; i++){
      this.dlin[this.di] = x[i] || 0;
      this.di = (this.di+1) % this.DL;
      if (this.dn < this.DL) this.dn++;
    }

    // ---- быстрая огибающая, по куску в миллисекунду ----
    {
      const кус = Math.max(1, Math.round(sr/this.БЫСТР));
      for (let o = 0; o + кус <= N; o += кус){
        let s2 = 0;
        for (let i = 0; i < кус; i++){ const v = x[o+i]||0; s2 += v*v; }
        this.bystr[this.bi] = Math.sqrt(s2/кус);
        this.bi = (this.bi+1) % this.bystr.length;
        if (this.bn < this.bystr.length) this.bn++;
      }
    }

    // ---- в память ----
    const i = this.pi;
    this.ogib[i] = skz; this.vremya[i] = this.t;
    for (let b = 0; b < ПОЛОСЫ.length; b++){
      const [k1,k2] = this.grPolos[b];
      let e = 0; for (let k = k1; k <= k2; k++) e += mod[k]*mod[k];
      this.ogibP[b][i] = Math.sqrt(e);
    }
    this.pi = (i+1) % this.pamyat;
    if (this.pn < this.pamyat) this.pn++;
    // атаки: рост громкости больше чем в полтора раза от сглаженного
    if (skz > this.byloE*1.5 && skz > 1e-4) this.atak++;
    this.byloE += (skz - this.byloE)*.25;

    const k = {
      t: +this.t.toFixed(3),
      gromkost: +дб(skz).toFixed(2),
      pik: +дб(pik).toFixed(2),
      krest: +(pik/Math.max(1e-9,skz)).toFixed(2),
      centroid: +centr.toFixed(1),
      razbros: +razbr.toFixed(1),
      spad85: +spad.toFixed(1),
      ploskost: +ploskost.toFixed(4),
      potok: +потокНорм(potok, S).toFixed(4),
      shershavost: +sher.toFixed(4),
      vysota: +f0.toFixed(1),
      tonalnost: +tonal.toFixed(3),
      perehodov: nol,
      atak_v_sek: +(this.atak/Math.max(.001,this.t)).toFixed(2),
      polosy: this.grPolos.map(([k1,k2]) => {
        let e = 0; for (let k = k1; k <= k2; k++) e += mod[k]*mod[k];
        return +дб(Math.sqrt(e)).toFixed(1);
      }),
    };
    for (const имя in vnutr) k[имя] = vnutr[имя];
    return k;
  }

  // ---- разбор огибающей ------------------------------------------------------
  // Считается не каждый кадр: это дорого, а меняется медленно. Зовём раз в
  // полсекунды или по спросу.
  ogibayushchaya(){
    if (this.pn < 32) return null;
    const n = this.pn;
    // кадры в хронологическом порядке
    const поряд = new Float32Array(n);
    const beri = (буф) => { for (let j = 0; j < n; j++)
      поряд[j] = буф[(this.pi - n + j + this.pamyat) % this.pamyat]; return поряд; };
    const кадрВСек = n / Math.max(1e-6,
      (this.vremya[(this.pi-1+this.pamyat)%this.pamyat] - this.vremya[(this.pi-n+this.pamyat)%this.pamyat]));
    const спектр = (буф, f) => {
      const e = beri(буф);
      let ср = 0; for (let j = 0; j < n; j++) ср += e[j]; ср /= n;
      if (ср < 1e-9) return 0;
      let cr = 0, ci = 0; const w = 2*Math.PI*f/кадрВСек;
      for (let j = 0; j < n; j++){ const d = e[j]-ср; cr += d*Math.cos(w*j); ci -= d*Math.sin(w*j); }
      return Math.sqrt(cr*cr+ci*ci)/n/ср;
    };
    // Разрешение по частоте ограничено длиной памяти: ниже 2/T не разобрать.
    const низF = Math.max(.15, 2/(n/кадрВСек));
    const вых = {kadrov: n, kadr_v_sek: +кадрВСек.toFixed(1), niz_Hz: +низF.toFixed(2)};
    // Кривая модуляции: шестьдесят точек по логарифму
    const ТОЧ = 60, f1 = низF, f2 = Math.min(150, кадрВСек/2.2);
    const крив = [], частоты = [];
    for (let i = 0; i < ТОЧ; i++){
      const f = f1*Math.pow(f2/f1, i/(ТОЧ-1));
      частоты.push(f); крив.push(спектр(this.ogib, f));
    }
    вых.krivaya = крив.map(v => +v.toFixed(4));
    вых.chastoty = частоты.map(v => +v.toFixed(2));
    // Глубина по перцептивным полосам
    for (const [имя, a, b] of ПОЛОСЫ_ОГИБ){
      let s = 0, ш = 0;
      for (let i = 0; i < ТОЧ; i++) if (частоты[i] >= a && частоты[i] < b){ s += крив[i]; ш++; }
      вых[имя] = +(ш ? s/ш : 0).toFixed(4);
    }
    // РОВНОСТЬ КАЧАНИЯ — вот ради чего всё. Один чистый пик читается
    // метрономом, размазанная горка — дыханием. Отношение вершины к среднему
    // по полосе: около единицы это шум, выше трёх — механика.
    let пик = 0, пикF = 0, сум = 0, шт = 0;
    for (let i = 0; i < ТОЧ; i++) if (частоты[i] >= .3 && частоты[i] <= 5){
      сум += крив[i]; шт++;
      if (крив[i] > пик){ пик = крив[i]; пикF = частоты[i]; }
    }
    // ЗЕРНО И ТРЕСК — по быстрой огибающей, кадрами их не достать.
    if (this.bn > 512){
      const m = this.bn, б = new Float32Array(m);
      for (let j = 0; j < m; j++) б[j] = this.bystr[(this.bi - m + j + this.bystr.length) % this.bystr.length];
      let ср = 0; for (let j = 0; j < m; j++) ср += б[j]; ср /= m;
      const сп = f => {
        if (ср < 1e-9) return 0;
        let cr = 0, ci = 0; const w = 2*Math.PI*f/this.БЫСТР;
        for (let j = 0; j < m; j++){ const d = б[j]-ср; cr += d*Math.cos(w*j); ci -= d*Math.sin(w*j); }
        return Math.sqrt(cr*cr+ci*ci)/m/ср;
      };
      const полоса = (a,b) => { let s2 = 0, ш = 0;
        for (let f = a; f <= b; f *= 1.12){ s2 += сп(f); ш++; }
        return ш ? s2/ш : 0; };
      вых['зерно'] = +полоса(5, 20).toFixed(4);
      вых['треск'] = +полоса(20, 150).toFixed(4);
      // где именно сидит быстрая модуляция — это и отличает зерно от тембра
      let бп = 0, бf = 0;
      for (let f = 5; f <= 150; f *= 1.06){ const v = сп(f); if (v > бп){ бп = v; бf = f; } }
      вых.bystr_pik_Hz = +бf.toFixed(1);
      вых.bystr_glubina = +бп.toFixed(4);
    }
    вых.pik_Hz = +пикF.toFixed(2);
    вых.pik_glubina = +пик.toFixed(4);
    вых.rovnost = +(пик/Math.max(1e-9, сум/Math.max(1,шт))).toFixed(2);
    return вых;
  }
}
function потокНорм(p, S){ return p/Math.max(1e-15,S); }
// вершина произведения гармоник в окрестности корзины — для уточнения
function мощ(mod, k){
  let p = mod[k];
  for (let г = 2; г <= 4; г++){ const kk = k*г; p *= kk < mod.length ? mod[kk] : 0; }
  return Math.pow(Math.max(0, p), .25);
}
