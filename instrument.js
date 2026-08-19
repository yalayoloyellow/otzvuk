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
  // Только у второго прибора: сколько выхода первого втекает в его
  // конденсаторы. У первого входа нет — перед ним ничего не стоит.
  {k:'feed',    m:['KeyG','KeyH'], imya:'ВХОД', tolko:1}
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
  // Питание самого прибора: выключенный выпадает из цепи, и его сосед
  // соединяется с выходом напрямую.
  {k:'on',      kl:'KeyN', imya:'ПИТАНИЕ',  podpis:['выкл','вкл']}
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
let seeds=[(Math.random()*4294967295)>>>0,(Math.random()*4294967295)>>>0];

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
          seeds:[...seeds], sets:sets.map(x=>({...x})),
          switches:tumbnabory.map(x=>({...x})), active};
}
function nazovis(){
  const p=report.period>0 ? report.period.toFixed(2)+'с' : '';
  const v=report.pitch>0 ? Math.round(report.pitch)+'Гц' : '';
  const d=new Date();
  const data=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} `+
             `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
  return [data, (report.devices||[]).map(x=>x.build&&x.build.imya).filter(Boolean).join('-')||'····',
          p, v].filter(Boolean).join(' ');
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
function primenit(p){
  if(!p) return;
  const наб = p.sets || p.наборы || [p.knobs || p.макро || {}, pustomakro()];
  const тум = Array.isArray(p.switches) ? p.switches
            : Array.isArray(p.тумблеры) ? p.тумблеры
            : [p.switches || p.тумблеры || {}, pustotumb()];
  const сем = p.seeds || p.семена || [p.seed ?? p.семя, seeds[1]];
  const карта = {качание:'sway', характер:'tone', размах:'depth', импульс:'pulse',
                 удар:'hit', развод:'spread', гуляние:'drift', диапазон:'range',
                 вход:'feed', ген2:'gen2', ген3:'gen3', связь:'link', грязь:'dirt'};
  const перевод = о => {
    const r={};
    for(const k in (о||{})) r[карта[k]||k] = о[k];
    return r;
  };
  for(let i=0;i<2;i++){
    Object.assign(sets[i], перевод(наб[i]));
    Object.assign(tumbnabory[i], перевод(тум[i]));
    const с = сем[i];
    if(с!==undefined && с!==null){ seeds[i]=с>>>0;
      node&&node.port.postMessage({t:'seed', i, v:seeds[i]}); }
  }
  // Пресет, записанный до появления второго прибора, знал только один —
  // второй выключаем, иначе тот зазвучит через чужой прибор.
  if(!(p.sets||p.наборы)) tumbnabory[1].on=0;
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
  seeds[active] = novoe!==undefined ? novoe>>>0 : (Math.random()*4294967295)>>>0;
  node&&node.port.postMessage({t:'seed', i:active, v:seeds[active]});
  send();
}
function vyberi(i){
  active = i ? 1 : 0;
  node&&node.port.postMessage({t:'active', i:active});
  skazhi('прибор '+(active+1));
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
// ДВА ПРИБОРА. У каждого свой набор ручек, тумблеров и своя сборка. Активный
// тот, по которому щёлкнули мышью, — как переключение между окнами.
const pustomakro = () => ({sway:.55, tone:.5, depth:.75, pulse:.2,
                           hit:.35, spread:.15, drift:0, range:.5, feed:0});
const pustotumb = () => ({gen2:1, gen3:0, link:0, dirt:0, on:1});
const sets=[pustomakro(), pustomakro()];
const tumbnabory=[pustotumb(), pustotumb()];
sets[1].feed=.35;
let active=0;
const knobs=new Proxy({},{
  get:(_,k)=>sets[active][k],
  set:(_,k,v)=>{ sets[active][k]=v; return true; },
  ownKeys:()=>Reflect.ownKeys(sets[active]),
  getOwnPropertyDescriptor:(_,k)=>({enumerable:true,configurable:true,value:sets[active][k]})
});
const switches=new Proxy({},{
  get:(_,k)=>tumbnabory[active][k],
  set:(_,k,v)=>{ tumbnabory[active][k]=v; return true; },
  ownKeys:()=>Reflect.ownKeys(tumbnabory[active]),
  getOwnPropertyDescriptor:(_,k)=>({enumerable:true,configurable:true,value:tumbnabory[active][k]})
});
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
  // Оба набора уходят всегда: прибор, который сейчас не на экране, всё равно
  // работает и звучит — он же стоит в цепи перед этим.
  if(!node) return;
  for(let i=0;i<2;i++)
    node.port.postMessage({t:'p', i, v:{...sets[i], ...tumbnabory[i]}});
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
  for(let i=0;i<2;i++) node.port.postMessage({t:'seed', i, v:seeds[i]});
  node.port.postMessage({t:'active', i:active});
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

  // Прибор переключается и клавишей — мышь не всегда под рукой.
  if(c==='KeyJ'){ e.preventDefault(); if(!e.repeat) vyberi(active?0:1); return; }
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
    if(t.k==='on') skazhi(`прибор ${active+1}: `+(switches.on?'включён':'выключен'));
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
let Sh=112, V=40, pole=new Float32Array(Sh*V), kolonok=3;
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
  if(nov!==Sh||novv!==V){ Sh=nov; V=novv; pole=new Float32Array(Sh*V); }
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
  const spad=.87 + (1-u)*.09 + (1-clamp(report.shina||1,0,1))*.03;
  for(let i=0;i<pole.length;i++) pole[i]*=spad;

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
    // ТЕЛО набирается заливкой от центра, но только до середины пути:
    // сплошной диск съедал контур, а так плотная сердцевина остаётся, и
    // край при этом читается.
    mazok(Math.round(cx),Math.round(cy),
          Math.round(cx+(x-cx)*.55), Math.round(cy+(y-cy)*.55), .07);
    if(px!==null){
      mazok(px,py,x,y,.9);
      // ЩУПАЛЬЦА растут НАРУЖУ по радиусу — тем длиннее, чем резче скачок
      // сигнала в этом месте. Внутри тела они бы потерялись, а так торчат
      // и показывают, где волна рвётся.
      const dl=Math.hypot(x-px,y-py);
      if(dl>Sh*.045){
        const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy)||1;
        const dlin=Math.min(dl*1.35, Sh*.3);
        mazok(x,y,Math.round(x+dx/r*dlin), Math.round(y+dy/r*dlin), 1.3);
      }
    }
    else if(x>=0&&x<Sh&&y>=0&&y<V) pole[y*Sh+x]+=.85;
    px=x; py=y;
  }

  let mx=.001;
  for(const v of pole) if(v>mx) mx=v;
  const stroki=[];
  for(let y=0;y<V;y++){
    let s='';
    for(let x=0;x<Sh;x++){
      const v=pole[y*Sh+x]/mx;
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
function vkladki(){
  const sn=report.devices||[];
  return [0,1].map(i=>{
    const s=sn[i]||{}, sb=s.build||{};
    const zhiv = !tumbnabory[i].on ? 'выкл'
               : s.pitch>1 ? `${Math.round(s.pitch)} Гц` : 'тихо';
    const t=` ПРИБОР ${i+1} · ${sb.imya||'····'} · ${zhiv} ${i===0?'→':'⇒ выход'} `;
    // Имя атрибута латиницей: кириллическое data-имя не превращается в
    // свойство dataset, и клик молча не находил, по какому прибору попали.
    return `<span class="tab ${i===active?'hot':'dim2'}" data-device="${i}">`+
           `${i===active?'▍':' '}${t}</span>`;
  }).join('  ');
}

function devices(){
  ritmzamer();
  // Разброс интервалов между щелчками медленного узла: 0 — рисунок стоит
  // как вкопанный, растёт — гуляет.
  const l=report.razbros||0;
  const gde = l<.02?'РОВНО' : l<.10?'дышит' : l<.28?'гуляет'
            : l<.55?'КРАЙ' : 'распад';
  const cvet = l<.10?'dim' : l<.55?'hot':'warn';
  const per=report.period||0;
  const vys=report.pitch||0, skv=report.duty||0;
  return [
`  период <b>${per>.02&&per<30?per.toFixed(2)+' с':'—'}</b>   высота <b>${vys.toFixed(0)}</b> Гц` +
  `   импульс <b>${(skv*100).toFixed(0)}%</b>   <span class="${cvet}">${gde}</span>`,
`  шина ${polosa(clamp(report.shina,0,1),12)}  уровень ${polosa(clamp(report.pik,0,1),12)}`
  ].join('\n');
}

function ruchki(){
  const sb=report.build||{};
  const stroki=[`  <span class="dim2">сборка</span> <b>${sb.imya||'····'}</b>`+
                ` <span class="dim2">семя ${seeds[active]>>>0}</span>`+
                (sb.dinamik?`  <span class="dim2">динамик ${sb.dinamik.toFixed(0)} Гц ·`+
                 ` ${(sb.emkost*1e9).toFixed(1)} нФ · порог ${(sb.porog*100).toFixed(0)}% ·`+
                 ` ${sb.emf.toFixed(1)} В</span>`:'')+
                `  <span class="dim2">Tab — пересобрать</span>`, ''];
  const vidimye=KNOBS.filter(r=>r.tolko===undefined||r.tolko===active);
  for(let i=0;i<vidimye.length;i+=kolonok){
    stroki.push(vidimye.slice(i,i+kolonok).map(r=>{
      const svoy=r===poslednyaya&&vspyshka>0;
      const imya=(r.imya+'        ').slice(0,8);
      const kl=r.podpis;
      const b=polosa(knobs[r.k]||0,10);
      const s=`${imya} ${b} ${kl}`;
      return svoy?`<span class="hot">${s}</span>`:`<span class="dim">${s}</span>`;
    }).join('   '));
  }
  stroki.push('');
  stroki.push(SWITCHES.map(t=>{
    const pol=t.pol||2, z=switches[t.k];
    const vid=pol>2 ? '['+'·'.repeat(z)+'▮'+'·'.repeat(pol-1-z)+']'
                    : (z?'[▮]':'[·]');
    const cv=z?'hot':'dim';
    return `<span class="${cv}">${t.imya} ${vid}</span> <span class="dim2">${t.kl.replace('Key','').toLowerCase()}</span>`;
  }).join('   '));
  stroki.push(`  <span class="dim2">${SWITCHES.map(t=>t.imya+': '+
    (t.podpis[switches[t.k]]||'')).join(' · ')}</span>`);
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
    $('#devices').innerHTML=devices();
    // Перерисовываем вкладки только когда они правда изменились: лишняя
    // замена разметки съедала клики.
    const v=vkladki();
    if(v!==poslednieVkladki){ $('#tabs').innerHTML=v; poslednieVkladki=v; }
    poveshaytabs();
    $('#knobs').innerHTML=ruchki();
    $('#line').innerHTML=
      `  <b>Tab</b> — пересобрать · <b>⌘</b> втрое · <b>shift</b> вдесятеро · пробел — толчок · `+
      `<b>цифры 1–8</b> — площадки · <b>j</b> — другой прибор · <b>p</b> — сохранить · <b>o</b> — листать`+
      (vest && performance.now()<vestdo ? `   <span class="hot">${vest}</span>`
       : presets.length ? `   <span class="dim2">${presets.length} пресетов</span>` : '');
  }
}
// Клик по вкладке переключает прибор.
// Обработчик висит на КОНТЕЙНЕРЕ вкладок, а не на самих вкладках: их
// разметка переписывается тридцать раз в секунду, и элемент успевал
// подмениться между нажатием и обработкой — клик пропадал. Контейнер же
// не пересоздаётся никогда.
function poveshaytabs(){
  const box=$('#tabs');
  if(!box || box.dataset.gotov) return;
  box.dataset.gotov='1';
  box.addEventListener('mousedown',ev=>{
    const el=ev.target.closest && ev.target.closest('.tab');
    if(!el) return;
    ev.preventDefault();
    vyberi(+el.dataset.device);
  });
}
pomer();
kadr();
