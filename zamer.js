// ЗАМЕР — СЫРЫЕ ЧИСЛА О ЗВУКЕ. Больше здесь не делается ничего.
//
// ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: НИКАКОГО ИСТОЛКОВАНИЯ. Ни в именах, ни в
// границах, ни в порогах. Здесь нет «качания», «зерна» и «шероховатости» —
// это не измерения, а утверждения о том, что значит услышанное, и место им
// в разборе, который считается ПОСЛЕ и который можно переделать, не трогая
// накопленное.
//
// Прежняя редакция это правило нарушала, и нарушала незаметно. Полосы
// огибающей звались «дрейф · качание · пульс · зерно · треск» — то есть в
// сам замер была вшита теория слуха, и всякий, кто потом смотрел на числа,
// смотрел уже сквозь неё. Была «ровность», объявлявшая один острый пик
// метрономом. Была «шероховатость» по накрывающей Плампа–Левелта — модель
// восприятия, выданная за показание. Был счётчик атак с порогом в полтора
// раза, то есть решение, принятое за читающего.
//
// Всё это выброшено отсюда и перенесено в tolk.js, где стоит с оговоркой,
// что это гипотеза, а не замер.
//
// ЧТО ЗДЕСЬ ОСТАЁТСЯ. Только то, что можно перепроверить арифметикой и
// пересчитать во что угодно потом:
//   · моменты спектра — среднее, разброс, скос, эксцесс
//   · плоскостность — отношение среднего геометрического к арифметическому
//   · треть-октавные полосы, тридцать одна: сетка мелкая, любые полосы
//     складываются из неё обратно
//   · вершины спектра списком (частота, величина) — из них считается что
//     угодно, от гармоничности до жёсткости
//   · прирост спектра — без порога, числом
//   · КРИВЫЕ модуляции целиком, а не сумма по чьим-то полосам
//
// Требование сохранности: по сырому слою обязано восстанавливаться всё
// производное. Если для нового толкования понадобится то, чего здесь нет,
// добавлять надо СЮДА, а не считать на глазок в разборе.

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

// ТРЕТЬ-ОКТАВНАЯ СЕТКА — не потому, что «так слышит ухо», а потому, что это
// равномерная сетка по логарифму частоты: любые другие полосы складываются
// из неё обратно без потерь, а обратно из широких полос узкие не достать.
// Выбор шага это выбор РАЗРЕШЕНИЯ, а не утверждение о смысле.
export const СЕТКА = (() => {
  const с = [];
  for (let i = 0; i < 31; i++){
    const f = 20 * Math.pow(2, i/3);
    с.push([f/Math.pow(2,1/6), f*Math.pow(2,1/6)]);
  }
  return с;
})();

const дб = v => 20*Math.log10(Math.max(1e-12, v));

export class Zamer {
  constructor(sr, okno = 2048, pamyat = 1024){
    this.sr = sr; this.N = okno;
    this.re = new Float64Array(okno); this.im = new Float64Array(okno);
    this.mod = new Float64Array(okno/2);
    this.proshMod = new Float64Array(okno/2);
    this.okn = new Float64Array(okno);
    for (let i = 0; i < okno; i++) this.okn[i] = .5 - .5*Math.cos(2*Math.PI*i/okno);
    this.grSetki = СЕТКА.map(([a,b]) => [Math.max(1,Math.round(a*okno/sr)),
                                         Math.min(okno/2-1, Math.round(b*okno/sr))]);
    // Длинное окно для тонкого разбора низа: корзина на двух тысячах
    // отсчётов шириной двадцать три герца, и ниже двухсот герц спектр там
    // просто не разрешён. Это ограничение прибора замера, а не свойство
    // звука, и его надо снимать, а не истолковывать.
    this.DL = 8192;
    this.dlin = new Float64Array(this.DL); this.di = 0; this.dn = 0;
    this.dre = new Float64Array(this.DL); this.dim = new Float64Array(this.DL);
    this.dokn = new Float64Array(this.DL);
    for (let i = 0; i < this.DL; i++) this.dokn[i] = .5 - .5*Math.cos(2*Math.PI*i/this.DL);
    // Огибающая на тысяче в секунду: по кадрам выше десяти герц ничего не
    // разобрать, и полосы там выходили нулями — а ноль читается как «нет»,
    // хотя означает «не измерено».
    this.БЫСТР = 1000;
    this.bystr = new Float32Array(8192); this.bi = 0; this.bn = 0;
    this.bsgl = 0; this.bсч = 0;
    this.pamyat = pamyat; this.pi = 0; this.pn = 0;
    this.ogib = new Float32Array(pamyat);
    this.vremya = new Float32Array(pamyat);
    this.t = 0; this.kadrov = 0;
  }

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
    let S = 0;
    for (let k = 1; k < N/2; k++){
      mod[k] = Math.sqrt(re[k]*re[k] + im[k]*im[k]) / N;
      S += mod[k];
    }
    S = Math.max(1e-15, S);

    // ---- моменты спектра: чистая статистика распределения энергии --------
    let m1 = 0;
    for (let k = 1; k < N/2; k++) m1 += (k*sr/N) * mod[k];
    m1 /= S;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let k = 1; k < N/2; k++){
      const d = k*sr/N - m1, w = mod[k]/S;
      m2 += d*d*w; m3 += d*d*d*w; m4 += d*d*d*d*w;
    }
    const σ = Math.sqrt(Math.max(0, m2));
    // ---- плоскостность: среднее геометрическое к арифметическому ---------
    let гм = 0;
    for (let k = 1; k < N/2; k++) гм += Math.log(Math.max(1e-15, mod[k]));
    const ploskost = Math.exp(гм/(N/2-1)) / (S/(N/2-1));
    // ---- прирост спектра, без порога -------------------------------------
    let prirost = 0;
    for (let k = 1; k < N/2; k++){
      const d = mod[k] - this.proshMod[k];
      if (d > 0) prirost += d;
      this.proshMod[k] = mod[k];
    }
    // ---- вершины спектра списком ------------------------------------------
    const верш = [];
    for (let k = 2; k < N/2-1; k++)
      if (mod[k] > mod[k-1] && mod[k] >= mod[k+1] && mod[k] > S*.002)
        верш.push([k*sr/N, mod[k]/S]);
    верш.sort((a,b) => b[1]-a[1]);
    const vershiny = верш.slice(0, 16).map(([f,a]) => [+f.toFixed(1), +a.toFixed(5)]);

    // ---- длинное кольцо ----------------------------------------------------
    for (let i = 0; i < N; i++){
      this.dlin[this.di] = x[i] || 0;
      this.di = (this.di+1) % this.DL;
      if (this.dn < this.DL) this.dn++;
    }
    // Оценка основного тона по произведению гармоник. Это уже НЕ чистый
    // замер, а оценка по правилу, — поэтому рядом кладётся её острота, и
    // судить о доверии можно по ней, а не по слову.
    let f0 = 0, ostrota = 0;
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
        ostrota = лучш/Math.max(1e-15, сум/Math.max(1,шт));
      }
    }

    // ---- быстрая огибающая: выпрямление и сглаживание -----------------------
    //
    // СРЕДНЕКВАДРАТИЧНОЕ ПО КУСКАМ В МИЛЛИСЕКУНДУ ЗДЕСЬ НЕ ГОДИТСЯ, и это не
    // придирка. Прибор живёт на ста-трёхстах герцах; в миллисекунду
    // укладывается пятая часть периода, и «громкость куска» скачет от фазы
    // несущей, а не от огибающей. Замер на поверку занижал известную
    // модуляцию в тридцать пять раз — и выглядел при этом правдоподобно.
    //
    // Выпрямление с однополюсным сглаживанием таких ограничений не имеет:
    // постоянная в полтора миллисекунды пропускает модуляцию до полутора
    // сотен герц и при этом усредняет несущую от двухсот и выше.
    {
      const кус = Math.max(1, Math.round(sr/this.БЫСТР));
      const α = 1 - Math.exp(-1/(sr*.0015));
      let счёт = this.bсч || 0;
      for (let i = 0; i < N; i++){
        const v = x[i] || 0;
        this.bsgl += ((v < 0 ? -v : v) - this.bsgl) * α;
        if (++счёт >= кус){
          счёт = 0;
          this.bystr[this.bi] = this.bsgl;
          this.bi = (this.bi+1) % this.bystr.length;
          if (this.bn < this.bystr.length) this.bn++;
        }
      }
      this.bсч = счёт;
    }
    // ---- медленная огибающая, по кадру -------------------------------------
    const i0 = this.pi;
    this.ogib[i0] = skz; this.vremya[i0] = this.t;
    this.pi = (i0+1) % this.pamyat;
    if (this.pn < this.pamyat) this.pn++;

    const k = {
      t: +this.t.toFixed(3),
      skz_dB: +дб(skz).toFixed(2),
      pik_dB: +дб(pik).toFixed(2),
      pik_k_skz: +(pik/Math.max(1e-12,skz)).toFixed(3),
      spektr_m1: +m1.toFixed(1),
      spektr_sigma: +σ.toFixed(1),
      spektr_skos: +(σ > 0 ? m3/(σ*σ*σ) : 0).toFixed(3),
      spektr_ekscess: +(σ > 0 ? m4/(σ*σ*σ*σ) : 0).toFixed(3),
      ploskost: +ploskost.toFixed(5),
      prirost: +(prirost/S).toFixed(5),
      perehodov: nol,
      hps_f0: +f0.toFixed(2),
      hps_ostrota: +ostrota.toFixed(3),
      polosy: this.grSetki.map(([k1,k2]) => {
        let e = 0; for (let k = k1; k <= k2; k++) e += mod[k]*mod[k];
        return +дб(Math.sqrt(e)).toFixed(1);
      }),
      vershiny,
    };
    for (const имя in vnutr) k[имя] = vnutr[имя];
    return k;
  }

  // КРИВЫЕ МОДУЛЯЦИИ ЦЕЛИКОМ. Ни полос, ни сумм, ни вершин: всё это считается
  // в разборе. Здесь только измеренное и сетка, на которой измерено.
  //
  // ЧЕРЕЗ БПФ, А НЕ ГРЕБЁНКОЙ ОТДЕЛЬНЫХ ЧАСТОТ. Гребёнка проваливалась между
  // корзинами: известная модуляция ровно на сорока герцах читалась как 0.2006
  // при пробе в 40.00 и как 0.0046 при пробе в 40.50 — занижение в сорок три
  // раза от полугерца промаха. Вершину такая гребёнка находила верно, а
  // величину сообщала лотереей, и по величинам я бы делал выводы.
  //
  // Одно преобразование даёт все корзины разом, а по логарифмической сетке
  // складывается ЭНЕРГИЯ полосы между соседними точками — величина, не
  // зависящая от того, попала проба в корзину или нет.
  спектрОгиб(буф, дл, ук, чвс, f1, f2, точек){
    let n = 1; while (n*2 <= дл) n *= 2;       // ближайшая степень двойки
    if (n < 64) return null;
    const e = new Float64Array(n), im = new Float64Array(n);
    let ср = 0;
    for (let j = 0; j < n; j++) ср += буф[(ук - n + j + буф.length) % буф.length];
    ср /= n;
    if (ср < 1e-10) return null;
    // Окно Ханна: без него утечка прямоугольного окна размазывает линию по
    // всей оси, и полосы перестают что-либо значить.
    let окнЭ = 0;
    for (let j = 0; j < n; j++){
      const w = .5 - .5*Math.cos(2*Math.PI*j/n);
      e[j] = (буф[(ук - n + j + буф.length) % буф.length] - ср) * w;
      im[j] = 0; окнЭ += w*w;
    }
    pf(e, im);
    const мощ = new Float64Array(n/2);
    for (let k = 1; k < n/2; k++) мощ[k] = (e[k]*e[k] + im[k]*im[k]);
    const шагК = чвс/n;
    const частоты = [], кривая = [];
    for (let i = 0; i < точек; i++){
      const f = f1*Math.pow(f2/f1, i/(точек-1));
      const r = Math.pow(f2/f1, .5/(точек-1));
      const k1 = Math.max(1, Math.round(f/r/шагК)), k2 = Math.min(n/2-1, Math.round(f*r/шагК));
      let E = 0;
      for (let k = k1; k <= k2; k++) E += мощ[k];
      // Приведение: линия относительной глубины A даёт корень из энергии
      // A·n·√(окнЭ/n)/2 — делим на то же и получаем глубину обратно.
      const глуб = Math.sqrt(E) * 2 / (n * Math.sqrt(окнЭ/n)) / ср;
      частоты.push(+f.toFixed(3)); кривая.push(+глуб.toFixed(5));
    }
    return {chastoty: частоты, krivaya: кривая, shag_Hz: +шагК.toFixed(4), otschetov: n};
  }

  krivye(){
    if (this.pn < 64) return null;
    const t1 = this.vremya[(this.pi-this.pn+this.pamyat)%this.pamyat];
    const t2 = this.vremya[(this.pi-1+this.pamyat)%this.pamyat];
    const чвс = this.pn/Math.max(1e-6, t2-t1);
    const вых = {kadrov: this.pn, kadr_v_sek: +чвс.toFixed(2)};
    // Ниже двух периодов на всю память ничего не разобрать — граница прибора
    // замера, и она сообщается числом, а не молчанием.
    const низ = Math.max(.08, 3*чвс/this.pn);
    вых.medlennaya = this.спектрОгиб(this.ogib, this.pn, this.pi, чвс,
                                     низ, Math.min(10, чвс/2.5), 72);
    if (this.bn > 1024)
      вых.bystraya = this.спектрОгиб(this.bystr, this.bn, this.bi, this.БЫСТР,
                                     2, 400, 72);
    return вых;
  }
}
