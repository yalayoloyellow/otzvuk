// ============================================================================
//  ИНСТРУМЕНТ — всё с клавиатуры, вид ретро-терминальный.
//
//  Ничего автоматического: система не решает за тебя. Клавиша слева от пары
//  убавляет, справа прибавляет; Shift — мелкий шаг, чтобы попадать в узкие
//  места. Верхний ряд цифр — сцены: запомнить (Shift+цифра) и вернуться.
//
//  Приборы показывают, ГДЕ ты в системе: показатель Ляпунова (мера хаоса),
//  число вращения (в какое ритмическое отношение захватились узлы), шина
//  питания (насколько просажена), уровень. Это и есть карта, по которой
//  «зная, что крутишь, попадаешь в нужную область».
// ============================================================================
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => v<a?a:v>b?b:v;

let ctx=null, node=null, idet=false;
let report={pik:0,rms:0,lyap:0,vraschenie:0,shina:1,osc:new Float32Array(256),
           cells:[0,0,0,0,0,0],step:0,risunok:new Uint8Array(32),hit:0};

// ---- ПАНЕЛЬ ----------------------------------------------------------------
// На приборе Срапионова наружу выходило три-четыре ручки, остальное впаяно
// намертво: это номиналы деталей, а не органы управления. Я же вывел все
// внутренние параметры разом — тридцать штук, и найти нужное стало нельзя.
//
// Теперь наружу шесть МАКРО-ручек, каждая из которых ведёт целую группу
// связанных величин так, как их вело бы одно вращение на панели. Внутренности
// остались, но живут по своим законам и наружу не торчат.
//
// Первые три ручки — КАЧЕЛИ, тот самый механизм: медленный генератор ведёт
// током заряд звукового, тот ездит по пяти октавам и внизу проваливается в
// треск. Одна ручка задаёт период рисунка, вторая — высоту и dirt, третья —
// насколько глубоко качели проваливаются. Всё остальное вторично и стоит
// после них.
const KNOBS=[
  {k:'sway', m:['KeyQ','KeyW'], imya:'КАЧАНИЕ'},
  {k:'tone',m:['KeyE','KeyR'], imya:'ХАРАКТЕР'},
  {k:'depth',  m:['KeyT','KeyY'], imya:'РАЗМАХ'},
  {k:'pulse', m:['KeyU','KeyI'], imya:'ИМПУЛЬС'},

  {k:'hit',    m:['KeyA','KeyS'], imya:'УДАР'},
  {k:'spread',  m:['KeyD','KeyF'], imya:'РАЗВОД'},
  {k:'drift', m:['KeyZ','KeyX'], imya:'ГУЛЯНИЕ'},
  {k:'range',m:['KeyC','KeyV'], imya:'ДИАПАЗОН'},
];

// ---- ТУМБЛЕРЫ --------------------------------------------------------------
// Разница с крутилками не в удобстве, а в физике. Подстроечник задаёт НОМИНАЛ:
// сколько ом, сколько вольт — величину можно вести плавно. Тумблер КОММУТИРУЕТ
// ЦЕПЬ: провод либо припаян, либо нет, конденсатор либо в схеме, либо вне её.
// Промежуточного положения у него не бывает физически, поэтому эти вещи и
// стоят отдельно от ручек.
const SWITCHES=[
  {k:'gen2',     kl:'KeyK', imya:'ГЕН 2',    podpis:['выкл','вкл']},
  {k:'gen3',     kl:'KeyL', imya:'ГЕН 3',    podpis:['выкл','вкл']},
  {k:'link',    kl:'KeyB', imya:'СВЯЗЬ',    podpis:['нет','замкнута']},
  {k:'dirt',    kl:'KeyM', imya:'ГРЯЗЬ',    podpis:['развязка','снята']},
];


// Второй страницы нет и быть не должно. Всё, чего нет на панели, — это
// номиналы деталей: конденсаторы, резисторы, пороги конкретной микросхемы,
// ёмкость монтажа. Ими не «управляют», они впаяны.
//
// Для исполнителя они выглядят случайностью, хотя физически детерминированы:
// случайность здесь — это ровно то, к чему у него НЕТ ДОСТУПА, но что звучит.
// Поэтому случайность живёт не в сигнале, а в ЭКЗЕМПЛЯРЕ прибора: собрал —
// получил свой набор номиналов, и он твой, пока не пересоберёшь.
for(const r of KNOBS) r.podpis=r.m.map(c=>c.replace('Key','').toLowerCase()).join('');

// ---- ЭКЗЕМПЛЯР ПРИБОРА -----------------------------------------------------
// Номиналы живут в ядре, в классе Сборка: там из семени выводятся допуски
// генераторов, петля триггера, скорость фронта, динамик и монтаж. Панель
// хранит только само семя и получает номиналы обратно в отчёте — здесь их
// незачем считать второй раз.
let seed=(Math.random()*4294967295)>>>0;

// ---- ПРЕСЕТЫ ---------------------------------------------------------------
// Снимок ВСЕГО состояния: положения всех ручек, всех тумблеров и номер
// сборки, из которого ядро выводит номиналы. Этого достаточно, чтобы прибор
// зазвучал ровно так же — больше в нём ничего и нет.
//
// Хранятся в ~/Documents/otzvuk/presets/, по файлу на штуку. Не в localStorage:
// тот привязан к origin и слетает от смены порта или профиля браузера, а
// пресет должен пережить всё.
let presets=[], tekuschiy=-1, vest='', vestdo=0;
function skazhi(t){ vest=t; vestdo=performance.now()+2600; }
function snimok(){
  return {name:nazovis(), time:new Date().toISOString().slice(0,19).replace('T',' '),
          seed, knobs:{...knobs}, switches:{...switches}};
}
function nazovis(){
  const p=report.period>0 ? report.period.toFixed(2)+'с' : '';
  const v=report.pitch>0 ? Math.round(report.pitch)+'Гц' : '';
  const d=new Date();
  const data=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} `+
             `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
  return [data, (report.build&&report.build.imya)||'····', p, v].filter(Boolean).join(' ');
}
async function sohrani(){
  try{
    const o=await fetch('/presets',{method:'POST',headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify(snimok())});
    const d=await o.json();
    if(d.ok){ await zagruzispisok();
              tekuschiy=presets.findIndex(x=>x.file===d.file);
              skazhi('сохранено: '+String(d.file).replace('.json','')); }
    else skazhi('не сохранилось: '+(d.error||'?'));
  }catch(e){ skazhi('не сохранилось: '+e.message); }
}
async function zagruzispisok(){
  try{
    const o=await fetch('/presets'); const d=await o.json();
    presets=d.presets||[];
  }catch(e){ presets=[]; }
}
// Пресет мог быть записан и до перехода на латиницу, и до появления второго
// прибора. Читаем оба написания и оба формата — терять сохранённое нельзя.
// Пресет мог быть записан в любом из прежних форматов: с русскими ключами,
// с одним прибором или с двумя. Берём первый прибор — он и есть весь прибор.
function primenit(p){
  if(!p) return;
  const karta = {качание:'sway', характер:'tone', размах:'depth', импульс:'pulse',
                 удар:'hit', развод:'spread', гуляние:'drift', диапазон:'range',
                 ген2:'gen2', ген3:'gen3', связь:'link', грязь:'dirt'};
  const perevod = o => {
    const r={};
    for(const k in (o||{})) if(k in knobs || karta[k] in knobs ||
                               k in switches || karta[k] in switches)
      r[karta[k]||k] = o[k];
    return r;
  };
  const pervy = a => Array.isArray(a) ? a[0] : a;
  Object.assign(knobs, perevod(pervy(p.sets || p.наборы || p.knobs || p.макро)));
  Object.assign(switches, perevod(pervy(p.switches || p.тумблеры)));
  const s = pervy(p.seeds || p.семена) ?? p.seed ?? p.семя;
  if(s!==undefined && s!==null){ seed=s>>>0;
    node&&node.port.postMessage({t:'seed', v:seed}); }
  send();
  skazhi('пресет: '+(p.name||p.имя||p.file));
}
async function listay(step){
  if(!presets.length) await zagruzispisok();
  if(!presets.length){ skazhi('пресетов пока нет'); return; }
  tekuschiy=((tekuschiy+step)%presets.length+presets.length)%presets.length;
  primenit(presets[tekuschiy]);
}
function peresoberi(novoe){
  seed = novoe!==undefined ? novoe>>>0 : (Math.random()*4294967295)>>>0;
  node&&node.port.postMessage({t:'seed', v:seed});
  send();
}

// Разводка макро-ручек во внутренние величины. Здесь и живёт то, что в
// железке было впаяно: соотношения номиналов, подобранные так, чтобы прибор
// звучал в любом положении, а не только в удачном.
// Ручки на панели — это ровно те величины, что стоят в схеме, поэтому
// разводить нечего: что покрутил, то и поехало. Всё остальное — номиналы
// сборки, они живут в ядре и наружу не выходят, как впаянные детали.
function razvedi(){
  const v={...knobs};
  for(const t of SWITCHES){
    const pol=t.pol||2;
    v[t.k] = pol>2 ? switches[t.k]/(pol-1) : switches[t.k];
  }
  return v;
}

// макро — то, что на панели; p — то, что уходит в движок
const knobs={sway:.55, tone:.5, depth:.75, pulse:.2,
             hit:.35, spread:.15, drift:0, range:.5};
const switches={gen2:1, gen3:0, link:0, dirt:0};

const p={};

let poslednyaya=null, vspyshka=0, vspyshkat=null, poslednieVkladki='';
// Ручка должна ехать, а не прыгать. Шаг 4% при диапазоне высоты в семь с
// половиной октав давал треть октавы за нажатие — отсюда «жёсткие пороги»
// и ощущение цифры вместо аналога. Теперь базовый шаг мелкий, а при
// удержании клавиши он разгоняется, как крутилка под пальцем.
const derzhim=new Map();
setInterval(()=>{
  const t=performance.now();
  for(const [k,s] of derzhim){
    // Страховка от залипания — но мягкая. Прежняя требовала автоповтора,
    // а браузер шлёт его ТОЛЬКО для последней нажатой клавиши: при попытке
    // крутить две ручки разом первая молча отваливалась. Теперь верим
    // отпусканию и потере фокуса, а таймаут — только на совсем зависшее.
    if(t - s.zhivo > 6000){ derzhim.delete(k); continue; }
    const derzhitsya=(t-s.nachalo)/1000;
    // Короткое нажатие = РОВНО один шаг, сделанный при нажатии. Разгон
    // включается только после паузы: иначе быстрый тык давал и шаг, и
    // разгон разом, и ручка прыгала на несколько делений.
    if(derzhitsya < .28) continue;
    const razgon=Math.min(derzhitsya-.28, 2.2);
    const skorost=(.12+razgon*.8)*(s.skor||1);
    const step=skorost/60;
    knobs[s.klyuch]=clamp((knobs[s.klyuch]||0)+s.znak*step,0,1);
    poslednyaya=s.ruchka; vspyshka=4;
  }
  if(derzhim.size) send();
},1000/60);

function send(){
  node&&node.port.postMessage({t:'p', v:{...knobs, ...switches}});
}

// Сцены переживают перезагрузку: найденную точку обидно терять.
// Площадки: какие сейчас прижаты и насколько притёрся контакт.
// Объявление потерялось при удалении блока пресетов — площадки молча не
// работали, хотя обработчик клавиш срабатывал.
const ploschadki=new Map();
const provodimost=new Float32Array(9);

// Проводимость ведётся плавно: контакт не идеальный ключ, он притирается
// под пальцем и отпускает с задержкой.
setInterval(()=>{
  let menyalos=false;
  for(let i=1;i<=8;i++){
    const s=ploschadki.get(i);
    const cel=s ? Math.min(1,.45+(performance.now()-s.nazhata)/1400) : 0;
    const skor=s ? .16 : .07;
    const bylo=provodimost[i];
    provodimost[i]+=(cel-provodimost[i])*skor;
    if(Math.abs(provodimost[i]-bylo)>1e-4) menyalos=true;
  }
  if(menyalos&&node) node.port.postMessage({t:'pads',v:Array.from(provodimost)});
},1000/60);

// ---- запуск ---------------------------------------------------------------
window.dbg={sostoyanie:'не запускался',oshibka:null,
  get ploschadki(){return [...ploschadki.keys()]},
  get prov(){return Array.from(provodimost)}};
async function pusk(){
  if(idet) return;
  zagruzispisok();
  window.dbg.sostoyanie='запускаю';
  try{
  ctx=new AudioContext({latencyHint:'interactive'});
  await ctx.audioWorklet.addModule('chaos.worklet.js?v='+Date.now());
  node=new AudioWorkletNode(ctx,'chaos',{numberOfInputs:0,numberOfOutputs:1,
    outputChannelCount:[2]});
  node.connect(ctx.destination);
  node.port.onmessage=e=>{ report=e.data; window.dbg.otchetov=(window.dbg.otchetov||0)+1; window.dbg.o=report; };
  await ctx.resume();
  idet=true;
  // Обе сборки и оба набора ручек уходят в ядро сразу: второй прибор стоит
  // в цепи и звучит, даже когда на экране первый.
  node.port.postMessage({t:'seed', v:seed});

  send();
  window.dbg.sostoyanie='играет';
  }catch(e){ window.dbg.oshibka=''+e; window.dbg.sostoyanie='упал'; }
}

// Щелчок тоже запускает: клавиша не дойдёт, пока окно без фокуса.
addEventListener('pointerdown',()=>{ pusk(); });

// ---- клавиатура -----------------------------------------------------------
addEventListener('keydown',async e=>{
  if(e.altKey) return;
  const c=e.code;
  if(!idet){ await pusk(); if(c==='Space'){ e.preventDefault(); return; } }
  // Пересборка прибора: новый экземпляр с другими номиналами. Ручки на
  // панели остаются где стояли — меняется сам прибор, а не настройка.
  if(c==='Tab'){ e.preventDefault(); peresoberi(); return; }

  if(c==='KeyP'){ e.preventDefault(); if(!e.repeat) sohrani(); return; }
  if(c==='KeyO'){ e.preventDefault(); if(!e.repeat) listay(e.shiftKey?-1:1); return; }

  // Тумблер щёлкает от одного нажатия и держится сам — это не ручка,
  // которую надо вести.
  for(const t of SWITCHES){
    if(c!==t.kl) continue;
    e.preventDefault();
    if(e.repeat) return;
    const pol=t.pol||2;
    switches[t.k]=(switches[t.k]+1)%pol;
    vspyshkat=t; vspyshka=8; send();
    return;
  }

  for(const r of KNOBS){
    const znak = c===r.m[0] ? -1 : c===r.m[1] ? 1 : 0;
    if(!znak) continue;
    e.preventDefault();
    const bylo=derzhim.get(c);
    if(bylo){ bylo.zhivo=performance.now(); return; }     // автоповтор — подтверждение
    {
      const t=performance.now();
      // Модификаторы ускоряют вращение: cmd/ctrl втрое, shift вдесятеро.
      // Пальцы на приборе крутят ручку с разной скоростью, и это ровно то же.
      const skor = e.shiftKey ? 10 : (e.metaKey||e.ctrlKey) ? 3 : 1;
      derzhim.set(c,{klyuch:r.k,znak,ruchka:r,nachalo:t,zhivo:t,skor});
      knobs[r.k]=clamp((knobs[r.k]||0)+znak*.02*skor,0,1);
      poslednyaya=r; vspyshka=6; send();
    }
    return;
  }
  if(c==='Space'){ node&&node.port.postMessage({t:'kick'}); e.preventDefault(); return; }
  // ---- ПЛОЩАДКИ -----------------------------------------------------------
  // Не пресеты. У Срапы были контактные площадки: палец замыкал участок цепи
  // через сопротивление своего тела, и звук менялся ровно пока ты держишь.
  // Прохождения тока через нас тут не будет, поэтому переосмысляем: цифра
  // замыкает СВОЙ участок схемы, и «сопротивление контакта» живое — оно
  // падает, пока держишь (контакт разогревается и притирается), и медленно
  // восстанавливается после. Держать можно сколько угодно площадок разом.
  const cifra=c.startsWith('Digit') ? +c.slice(5) : 0;
  if(cifra>=1 && cifra<=8){
    e.preventDefault();
    if(!ploschadki.has(cifra)) ploschadki.set(cifra,{nazhata:performance.now()});
    return;
  }
});

// Отпускание клавиши, потеря фокуса, сворачивание вкладки. Все три
// обработчика были однажды снесены вместе с соседней правкой, и клавиши
// перестали отпускаться вовсе: ручка уезжала до упора, площадка оставалась
// прижатой навсегда. Это и было залипание, на которое жаловался yala.
addEventListener('keyup',e=>{
  derzhim.delete(e.code);
  if(e.code.startsWith('Digit')) ploschadki.delete(+e.code.slice(5));
});
addEventListener('blur',()=>{ derzhim.clear(); ploschadki.clear(); });
addEventListener('visibilitychange',()=>{ derzhim.clear(); ploschadki.clear(); });

// ---- КАРТИНА ---------------------------------------------------------------
// Не приборная панель, а портрет самой системы. Фазовое пространство: сигнал
// против себя же со сдвигом — у порядка это замкнутая петля, у хаоса облако,
// у захвата — узел с лепестками. То есть форма на экране И ЕСТЬ то, что
// слышно, а не иллюстрация к нему.
//
// Поверх — фосфор: след гаснет не сразу, как на осциллографе с длинным
// послесвечением. И зеркало по вертикали: живая динамика превращается в
// орнамент, который дышит вместе со звуком.
// Размер поля считается по окну: сколько знакомест влезает, столько и
// рисуем. Фиксированная сетка на узком экране уезжала за край.
const PHOSPHOR=' ·∙:∴*≋≡▒▓█';
let Sh=112, V=40, pole=new Float32Array(Sh*V), shipy=new Float32Array(Sh*V), kolonok=3;
let ugol=0;
function pomer(){
  const ris=$('#canvas');
  if(!ris) return;
  const proba=document.createElement('span');
  proba.style.cssText='position:absolute;visibility:hidden;white-space:pre';
  proba.textContent='0'.repeat(100);
  ris.appendChild(proba);
  const shs=proba.getBoundingClientRect().width/100 || 6.6;
  const vs=proba.getBoundingClientRect().height || 12;
  proba.remove();
  const nov=clamp(Math.floor((ris.clientWidth||innerWidth-28)/shs)-1,40,220);
  const novv=clamp(Math.round(nov*.34),14,54);
  if(nov!==Sh||novv!==V){ Sh=nov; V=novv;
    // Оба слоя пересоздаются вместе: если пересоздать только один, второй
    // остаётся прежней длины и на краях отдаёт undefined.
    pole=new Float32Array(Sh*V); shipy=new Float32Array(Sh*V); }
  // Панель ручек: три колонки на широком, две на среднем, одна на узком.
  kolonok = Sh>=96 ? 3 : Sh>=66 ? 2 : 1;
}
addEventListener('resize',pomer);

function kartina(){
  const o=report.osc||new Float32Array(256), n=o.length;

  // Осциллограф не бесконечно широкополосный: у луча своя инерция. Без неё
  // узкие импульсы кладут точки на две голые горизонтали, и фигура
  // вырождается в гору с лучами.
  const sgl=new Float32Array(n);
  let akk=0;
  for(let pr=0;pr<2;pr++) for(let i=0;i<n;i++){ akk += (o[i]-akk)*.34; sgl[i]=akk; }
  let mxo=1e-4;
  for(let i=0;i<n;i++){ const a=sgl[i]<0?-sgl[i]:sgl[i]; if(a>mxo) mxo=a; }
  const ks=1/mxo;

  // Вторая координата — ИНТЕГРАЛ сигнала, а не он же со сдвигом. Сдвиг
  // годится для гладкой волны; у импульсной он даёт ту самую гору. Интеграл
  // даёт настоящую квадратуру, и любая периодическая волна замыкается в
  // петлю — овал, ромб, узел, смотря какая в ней гармоника главная.
  const inte=new Float32Array(n);
  let aki=0;
  for(let pr=0;pr<2;pr++) for(let i=0;i<n;i++){ aki = aki*.992 + sgl[i]*.05; inte[i]=aki; }
  let sri=0;
  for(let i=0;i<n;i++) sri+=inte[i];
  sri/=n;                                        // петля должна быть вокруг центра
  let mxi=1e-4;
  for(let i=0;i<n;i++){ const a=Math.abs(inte[i]-sri); if(a>mxi) mxi=a; }
  const ki=1/mxi;

  const u=clamp(report.swing??.5,0,1);
  const g=clamp(report.drift??.5,0,1);
  const ut=clamp(report.utechka||0,0,1.4);

  // ПОСЛЕСВЕЧЕНИЕ: внизу качелей след держится дольше, наверху гаснет быстро.
  // ДВА СЛОЯ. Тело тлеет долго — оно и держит форму существа. Щупальца
  // гаснут почти мгновенно: они должны выстреливать и пропадать вместе с
  // волной, а не оставаться лучами.
  const spad=.90 + (1-u)*.06;
  for(let i=0;i<pole.length;i++){ pole[i]*=spad; shipy[i]*=.42; }

  const cx=(Sh-1)/2, cy=(V-1)/2;
  ugol += .003 + u*.016;
  const ko=Math.cos(ugol), si=Math.sin(ugol);
  // Закрутка: внизу качелей внешние витки отстают от внутренних и петля
  // сворачивается, наверху распрямляется в ровное кольцо.
  const tvist=(1-u)*1.1 - .45 + (g-.5)*.6;
  // Дыхание: качели растягивают фигуру по одной оси и поджимают по другой.
  const rastx=.82+u*.34, rasty=1.12-u*.34;

  const mazok=(x0,y0,x1,y1,sila)=>{
    const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
    const shagov=Math.max(dx,dy);
    if(shagov>Sh) return;
    const yar=sila/Math.max(1,Math.pow(shagov,.45));
    for(let q=0;q<=shagov;q++){
      const t=shagov?q/shagov:0;
      const x=Math.round(x0+(x1-x0)*t), y=Math.round(y0+(y1-y0)*t);
      if(x>=0&&x<Sh&&y>=0&&y<V) pole[y*Sh+x]+=yar;
      const xm=Sh-1-x;                            // зеркало — орнамент
      if(xm>=0&&xm<Sh&&y>=0&&y<V) pole[y*Sh+xm]+=yar*.4;
    }
  };

  let px=null, py=null;
  for(let i=0;i<n;i++){
    const a=clamp(sgl[i]*ks,-1,1), b=clamp((inte[i]-sri)*ki,-1,1);
    const qx=a*ko - b*si, qy=a*si + b*ko;
    const rad=Math.sqrt(qx*qx+qy*qy);
    const t=tvist*rad*rad;
    const kt=Math.cos(t), st=Math.sin(t);
    const wx=qx*kt - qy*st, wy=qx*st + qy*kt;
    // палец на площадке мутит саму фигуру, а не рисует поверх неё
    const mut=ut>.01 ? (Math.random()-.5)*ut*.18 : 0;
    const x=Math.round(cx + (wx+mut)*cx*.82*rastx);
    const y=Math.round(cy - (wy+mut)*cy*.82*rasty);
    // ТЕЛО. Один контур читается как проволочная петля. Заливка от центра к
    // каждой точке даёт плотную середину, сквозь которую контур всё равно
    // виден ярче — фигура становится телесной, а не нарисованной линией.
    // ТЕЛО — сама петля. Заливки от центра нет: она превращала фигуру в
    // ровную биомассу, в которой не читается ни форма, ни движение.
    if(px!==null){
      mazok(px,py,x,y,.8);
      // ЩУПАЛЬЦЕ выстреливает НАРУЖУ там, где волна рвётся, и сходит на
      // остриё: яркость падает вдоль луча, а сам слой гаснет за пару кадров.
      // Поэтому они вылезают резко и так же резко пропадают.
      const dl=Math.hypot(x-px,y-py);
      if(dl>Sh*.05){
        const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy)||1;
        const dlin=Math.min(dl*1.9, Sh*.42);
        const shagov=Math.round(dlin);
        for(let q=0;q<=shagov;q++){
          const t=q/Math.max(1,shagov);
          const sx=Math.round(x+dx/r*dlin*t), sy=Math.round(y+dy/r*dlin*t);
          const yar=1.5*(1-t)*(1-t);            // сходит на остриё
          if(sx>=0&&sx<Sh&&sy>=0&&sy<V) shipy[sy*Sh+sx]+=yar;
          const sxm=Sh-1-sx;
          if(sxm>=0&&sxm<Sh&&sy>=0&&sy<V) shipy[sy*Sh+sxm]+=yar*.35;
        }
      }
    }
    else if(x>=0&&x<Sh&&y>=0&&y<V) pole[y*Sh+x]+=.8;
    px=x; py=y;
  }

  let mx=.001;
  for(let i=0;i<pole.length;i++){ const v=pole[i]+shipy[i]; if(v>mx) mx=v; }
  const stroki=[];
  for(let y=0;y<V;y++){
    let s='';
    for(let x=0;x<Sh;x++){
      // Слабый фон не рисуем совсем: он сливал рисунок в кашу, в которой
      // не читалось ни тело, ни щупальца.
      let v=(pole[y*Sh+x]+shipy[y*Sh+x])/mx;
      v = v<.045 ? 0 : (v-.045)/.955;
      s+=PHOSPHOR[clamp(Math.round(Math.pow(v,.55)*(PHOSPHOR.length-1)),0,PHOSPHOR.length-1)];
    }
    stroki.push(s);
  }
  return stroki.join('\n');
}

function polosa(v,sh,simv){
  const n=clamp(Math.round(v*sh),0,sh);
  return (simv||'▮').repeat(n)+'·'.repeat(sh-n);
}

// Частота раскачки: биения огибающей. Это и есть ритм, рождённый встречей
// двух приборов на границе захвата — то, ради чего вся инжекция.
const ogib=new Float32Array(180); let ogibi=0, ritmgc=0, ritmtik=0;
function ritmzamer(){
  const o=report.osc; if(!o) return;
  let s=0; for(let i=0;i<o.length;i++) s+=o[i]*o[i];
  ogib[ogibi=(ogibi+1)%ogib.length]=Math.sqrt(s/o.length);
  if(++ritmtik<12) return;
  ritmtik=0;
  const n=ogib.length; let m=0; for(const v of ogib) m+=v; m/=n;
  const d=new Float32Array(n); for(let i=0;i<n;i++) d[i]=ogib[(ogibi+1+i)%n]-m;
  let e0=0; for(const v of d) e0+=v*v;
  if(e0<1e-9){ ritmgc=0; return; }
  let luchsh=0,lag=0;
  for(let l=3;l<n-6;l++){
    let sc=0; for(let i=0;i+l<n;i++) sc+=d[i]*d[i+l];
    const c=sc/e0; if(c>luchsh){luchsh=c;lag=l;}
  }
  ritmgc = (luchsh>.2&&lag) ? 30/lag : 0;      // отчёты идут 30 раз в секунду
}

// Две коробки в цепи: первая работает сама, её выход втекает во вторую, а
// наружу идёт только вторая. Мышь переключает, какая из них сейчас под
// ручками, — как окна.
// ---- ПАНЕЛЬ ----------------------------------------------------------------
// Всё рисуется одним шрифтом и одним цветом, тремя яркостями. Значения — не
// цифры в строчку, а шкалы: глазу нужна форма, а не чтение. Цифра остаётся
// там, где она правда нужна.
function shkala(v, sh){
  const n=clamp(Math.round(v*sh),0,sh);
  return '▮'.repeat(n)+'·'.repeat(sh-n);
}
function ruchki(){
  const sb=report.build||{};
  const uzko = Sh<80;
  const shk = uzko ? 8 : 12;
  const stroki=[];

  // Показания прибора: период качелей, высота, ширина импульса, уровень.
  const per=report.period>0&&report.period<30 ? report.period : 0;
  const pit=report.pitch||0, duty=report.duty||0;
  const l=clamp(report.pik||0,0,1), sh=clamp(report.shina||1,0,1);
  const r=report.razbros||0;
  const rezhim = r<.02?'ровно' : r<.10?'дышит' : r<.28?'гуляет' : r<.55?'край':'распад';
  stroki.push(
    `  ПЕРИОД  ${shkala(per?clamp(Math.log2(per/.02)/9,0,1):0,shk)} ${per?per.toFixed(2)+'с':'—'}`);
  stroki.push(
    `  ВЫСОТА  ${shkala(pit?clamp(Math.log2(pit/20)/8,0,1):0,shk)} ${pit?Math.round(pit)+'Гц':'—'}`);
  stroki.push(
    `  ИМПУЛЬС ${shkala(duty,shk)} ${Math.round(duty*100)}%   ${rezhim}`);
  stroki.push(
    `  УРОВЕНЬ ${shkala(l,shk)}   ШИНА ${shkala(sh,Math.max(4,shk-4))}`);
  stroki.push('');

  // Ручки: имя, шкала, клавиши. Ширина колонки и число колонок — от экрана.
  const shr = uzko ? 10 : 14;
  for(let i=0;i<KNOBS.length;i+=kolonok){
    stroki.push('  '+KNOBS.slice(i,i+kolonok).map(rk=>{
      const svoy=rk===poslednyaya&&vspyshka>0;
      const imya=(rk.imya+'          ').slice(0,uzko?8:9);
      const s=`${imya}${shkala(knobs[rk.k]||0,shr)} ${rk.podpis}`;
      return svoy?`<span class="hot">${s}</span>`:`<span class="fg">${s}</span>`;
    }).join('  '));
  }
  stroki.push('');
  stroki.push('  '+SWITCHES.map(t=>{
    const z=switches[t.k];
    return `<span class="${z?'hot':'dim'}">${t.imya} ${z?'▮':'·'}</span>`+
           ` <span class="dim2">${t.kl.replace('Key','').toLowerCase()}</span>`;
  }).join('  '));
  stroki.push(`  <span class="dim2">СБОРКА ${sb.imya||'····'} ${seed>>>0}`+
              (sb.dinamik?` · ${Math.round(sb.dinamik)}Гц · ${(sb.emkost*1e9).toFixed(1)}нФ`:'')+
              `</span>`);
  return stroki.join('\n');
}

function kadr(){
  // Ошибку в кадре нельзя глушить молча: панель просто исчезала, а причина
  // оставалась только в отладочном поле.
  try{ kadr_(); }catch(e){
    if(window.dbg.kadr!==''+e){ window.dbg.kadr=''+e; console.error('кадр:',e); }
  }
  requestAnimationFrame(kadr);
}
function kadr_(){
  if(vspyshka>0) vspyshka--;
  $('#head').innerHTML = idet
    ? `<span class="dim2">о т з в у к · инструмент</span>`
    : `<span class="hot">о т з в у к · инструмент</span>\n\n  нажми любую клавишу`;
  if(idet){
    $('#canvas').textContent=kartina();
    // Перерисовываем вкладки только когда они правда изменились: лишняя
    // замена разметки съедала клики.
    $('#knobs').innerHTML=ruchki();
    $('#line').innerHTML=
      `  <span class="dim2">tab пересобрать · ⌘ втрое · ⇧ вдесятеро · пробел толчок · `+
      `1–8 площадки · p сохранить · o листать</span>`+
      (vest && performance.now()<vestdo ? `   <span class="hot">${vest}</span>`
       : presets.length ? `   <span class="dim2">${presets.length} пресетов</span>` : '');
  }
}
pomer();
kadr();
