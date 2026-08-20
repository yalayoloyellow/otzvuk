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
import {vFonemy, vTseli} from './govor.js';

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
// ТРИ ЗОНЫ, и это не оформление, а устройство прибора:
//
//   СХЕМА — сам прибор, физика из номиналов. Зелёный.
//   ГОЛОС — входное гнездо и всё, что с ним: микрофон, говорилка, петля,
//           куда сигнал воткнут и насколько он слышен сам. Синий.
//   ПОСТ  — заведомо программный слой поверх. Красный.
//
// Клавиши разложены по тем же зонам физически: схема живёт на буквах слева
// и в середине, голос — на правом краю (пунктуация, стрелки, девятка с
// нулём), пост — на скобках и минусе, в самом дальнем углу. Рука не путает
// зоны, потому что они не перемешаны.
// ИМЕНА АНГЛИЙСКИЕ, и это не мода. У каждой из этих величин есть настоящее
// имя, которое стоит на панелях полувека приборов: RATE, DEPTH, DETUNE, SAG.
// Русский перевод пришлось бы придумывать, а придуманное имя ничего не
// напоминает и учится с нуля. Настоящее — узнаётся.
//
// Прозаические подписи и состояния («микрофон не включён») остаются русскими:
// это не термины, а речь. На приборе так и бывает — шелкография английская,
// а объяснение на своём языке.
const KNOBS=[
  // ---- СХЕМА: верхний ряд ----
  {k:'sway',   m:['KeyQ','KeyW'], imya:'RATE'},      // период медленного генератора
  {k:'tone',   m:['KeyE','KeyR'], imya:'TONE'},      // рабочая точка фоторезистора
  {k:'depth',  m:['KeyT','KeyY'], imya:'DEPTH'},     // глубина модуляции
  {k:'pulse',  m:['KeyU','KeyI'], imya:'WIDTH'},     // ширина импульса
  {k:'range',  m:['KeyO','KeyP'], imya:'TUNE'},      // общий строй прибора
  // ---- СХЕМА: домашний ряд ----
  // BIAS — смещение в цепи медленного узла. Оно и есть ток смещения, снятый
  // с отвода подстроечника, так что имя тут не приблизительное, а точное.
  {k:'hit',    m:['KeyA','KeyS'], imya:'BIAS'},
  {k:'spread', m:['KeyD','KeyF'], imya:'DETUNE'},    // расстройка трёх генераторов
  // SLOP — разболтанность периода. Слово с панелей MPC и Elektron, и значит
  // там ровно это же.
  {k:'drift',  m:['KeyG','KeyH'], imya:'SLOP'},
  {k:'gryzn',  m:['KeyJ','KeyK'], imya:'SEQ'},       // глубина вмешательства счётчика

  // ---- ГОЛОС: правый край ----
  // XMOD — перекрёстная модуляция: сигнал из гнезда ведёт параметры схемы.
  // Это НЕ громкость: громкость источника наружу — DRY.
  {k:'golos',  m:['KeyN','KeyM'],           imya:'XMOD',   zona:'golos'},
  // SOURCE — не переключатель, а потенциометр между микрофоном и
  // говорилкой: на середине слышны оба.
  {k:'ist',    m:['Comma','Period'],        imya:'SOURCE', zona:'golos'},
  {k:'ton',    m:['Semicolon','Quote'],     imya:'PITCH',  zona:'golos'},
  {k:'naruzhu',m:['ArrowLeft','ArrowRight'],imya:'DRY',    zona:'golos'},
  // GAP — размер тишины МЕЖДУ произнесениями, в тактах прибора. Не скорость
  // речи: та привязана к качелям намертво и ручкой не задаётся. Пять жёстких
  // ступеней, промежуточных положений нет — каждое нажатие это шаг.
  {k:'temp',   m:['Digit9','Digit0'],       imya:'GAP',    zona:'golos',
   stupeni:['×0.25','×0.5','×1','×2','×3']},
  // Второй слой: пар не хватило ровно на две величины, а страницы у прибора
  // нет и быть не должно. Shift на ЭТИХ двух парах выбирает вторую величину,
  // ускорения вращения на них нет — для него остаётся cmd.
  // GENDER — длина тракта. Слово из вокодеров и формантных сдвигателей,
  // понятное без объяснения.
  {k:'trakt',  m:['Semicolon','Quote'],     imya:'GENDER', zona:'golos', shift:1},
  // ROUTE — куда входит сигнал. Не выбор одного из двух, а положение
  // переключателя между ними, поэтому концы подписаны словами: на лампу
  // накала или прямо в шину питания.
  {k:'kuda',   m:['ArrowLeft','ArrowRight'],imya:'ROUTE',  zona:'golos', shift:1,
   konci:['lamp','rail']},

  // ---- ПОСТ: дальний угол ----
  {k:'zhat',   m:['BracketLeft','BracketRight'], imya:'COMP',   zona:'post'},
  // DRIVE — усиление на входе ограничителя: сначала громче, потом плотнее,
  // потом стена. Потолок при этом стоит намертво, и пик не вылезет ни при
  // каком положении.
  {k:'drive',  m:['Minus','Equal'],               imya:'DRIVE',   zona:'post'},
  // MASTER только ОСЛАБЛЯЕТ и стоит после ограничителя: громкость без
  // характера. Больше единицы ему нельзя — иначе он пробил бы потолок.
  {k:'master', m:['Minus','Equal'],               imya:'MASTER',  zona:'post', shift:1},
];

// ---- ТУМБЛЕРЫ --------------------------------------------------------------
// Разница с крутилками не в удобстве, а в физике. Подстроечник задаёт НОМИНАЛ:
// сколько ом, сколько вольт — величину можно вести плавно. Тумблер КОММУТИРУЕТ
// ЦЕПЬ: провод либо припаян, либо нет. Промежуточного положения у него не
// бывает физически, поэтому эти вещи и стоят отдельно от ручек.
const SWITCHES=[
  {k:'gen1', kl:'KeyZ', imya:'OSC 1'},
  {k:'gen2', kl:'KeyX', imya:'OSC 2'},
  {k:'gen3', kl:'KeyC', imya:'OSC 3'},
  // SYNC — захват генераторов друг другом через настоящий резистор.
  {k:'link', kl:'KeyV', imya:'SYNC'},
  // SAG — снятие развязки питания: шина проседает, и логика слышит сама себя.
  {k:'dirt', kl:'KeyB', imya:'SAG'},
  // Микрофон слышит динамик, круг замыкает комната. Три положения: без
  // петли, лёгкая окраска помещением, самовозбуждение. Двухпозиционные
  // показывают лампочку, а у трёхпозиционного лампочкой не обойтись — там
  // положения подписаны словами.
  {k:'petlya', kl:'Slash', imya:'FEEDBACK', podpis:['off','room','howl'],
   pol:3, mikro:1, zona:'golos'},
  {k:'povtor', kl:'KeyL', imya:'LOOP', zona:'golos'},
  {k:'mix', kl:'Backslash', imya:'MORPH', zona:'post'},
];

// Второй страницы нет и быть не должно. Всё, чего нет на панели, — это
// номиналы деталей: конденсаторы, резисторы, пороги конкретной микросхемы,
// ёмкость монтажа. Ими не «управляют», они впаяны.
//
// Для исполнителя они выглядят случайностью, хотя физически детерминированы:
// случайность здесь — это ровно то, к чему у него НЕТ ДОСТУПА, но что звучит.
// Поэтому случайность живёт не в сигнале, а в ЭКЗЕМПЛЯРЕ прибора: собрал —
// получил свой набор номиналов, и он твой, пока не пересоберёшь.
// КОМАНДЫ — то, что не крутится и не щёлкает, а происходит один раз. Держим
// таблицей по той же причине, что ручки и тумблеры: легенда внизу собирается
// из этих же таблиц и потому не может разойтись с тем, что делают клавиши.
const KOMANDY=[
  {kl:'Tab',       imya:'пересобрать', deystvie:()=>peresoberi()},
  {kl:'Space',     imya:'удар по корпусу', deystvie:()=>node&&node.port.postMessage({t:'kick'})},
  {kl:'Backquote', imya:'запись',      deystvie:()=>zapis()},
  {kl:'ArrowUp',   imya:'пресет',      deystvie:()=>sohrani()},
  {kl:'ArrowDown', imya:'листать',     deystvie:e=>listay((e.metaKey||e.ctrlKey)?-1:1)},
];

// Пары, на которых висит по две величины: Shift выбирает вторую.
const DVUSLOYNYE = new Set(KNOBS.filter(r=>r.shift).flatMap(r=>r.m));
const IMYAKL={Comma:',', Period:'.', Slash:'/', Semicolon:';', Quote:"'",
             Backslash:'\\', Backquote:'`', Minus:'-', Equal:'=',
             BracketLeft:'[', BracketRight:']',
             ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓',
             Digit9:'9', Digit0:'0', Enter:'⏎'};
for(const r of KNOBS)
  r.podpis=(r.shift?'⇧':'')+r.m.map(c=>IMYAKL[c] || c.replace('Key','').toLowerCase()).join('');

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
          seed, knobs:{...knobs}, switches:{...switches}, tekst:stroka.tekst};
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
  if(typeof p.tekst === 'string'){ stroka.tekst = p.tekst; setTimeout(skazhiTekst, 60); }
  const s = pervy(p.seeds || p.семена) ?? p.seed ?? p.семя;
  if(s!==undefined && s!==null) seed=s>>>0;
  shli();
  skazhi('пресет: '+(p.name||p.имя||p.file));
}
// ---- СТРОКА ТЕКСТА ---------------------------------------------------------
// Говорилке нужна фраза, а панель управляется голыми буквами — значит на
// время ввода клавиатура целиком уходит в строку и ни одна ручка не
// шевелится. Enter открывает и он же говорит, Esc отменяет.
//
// Разбор текста в фонемы и цели артикуляции живёт в govor.js: это работа со
// ЯЗЫКОМ, и в ядре ей делать нечего. Туда уходит уже готовая цепочка целей.
const stroka = {aktivna:false, tekst:''};
function skazhiTekst(){
  if(!node) return;
  const f = vFonemy(stroka.tekst);
  node.port.postMessage({t:'rech', v: stroka.tekst.trim() ? vTseli(f) : []});
  if(!stroka.tekst.trim()){ skazhi('говорилка молчит'); return; }
  // Сказанное некуда деть, если гнездо не переключено на говорилку и её
  // никуда не подмешивают. Молчать в такой момент было бы издевательством.
  const podskazka=[];
  if(knobs.ist < .02){ knobs.ist = 1; podskazka.push('SOURCE → говорилка'); }
  if(knobs.golos < .02 && knobs.naruzhu < .02) podskazka.push('подними XMOD или DRY');
  send();
  skazhi(`${f.filter(x=>x.f!=='pauza').length} фонем`+
         (podskazka.length ? ' · ' + podskazka.join(' · ') : ''));
}

// ---- МИКРОФОН --------------------------------------------------------------
// Петля замыкается через воздух, поэтому микрофон должен отдавать сырой
// сигнал: эхоподавление, шумодав и авторегулировка усиления в браузере
// душат фидбек как «дефект» — их надо снимать явно, иначе вместо петли
// приходит вычищенная тишина.
let mikrofon=null;
async function vklyuchiMikrofon(){
  if(mikrofon || !ctx) return;
  try{
    const potok=await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    mikrofon=ctx.createMediaStreamSource(potok);
    mikrofon.connect(node);
    skazhi('микрофон подключён');
  }catch(e){ skazhi('микрофон не дали: '+e.name); }
}

// ---- ЗАПИСЬ ----------------------------------------------------------------
// Пишется ровно то, что слышно: копия выхода приходит из ядра порциями,
// здесь копится и на остановке уходит файлом в ~/Documents/otzvuk/записи.
let pishem=false, kuski=[], vsego=0;
function zapisPrishla(d){
  if(!d.v) return;
  kuski.push(d.v); vsego+=d.v.length;
  if(d.stop) sohraniZapis();
}
function zapis(){
  if(!node) return;
  pishem=!pishem;
  if(pishem){ kuski=[]; vsego=0; node.port.postMessage({t:'rec', v:true}); skazhi('запись пошла'); }
  else node.port.postMessage({t:'rec', v:false});
}
function wav(dan, sr){
  const n=dan.length, buf=new ArrayBuffer(44+n*2), v=new DataView(buf);
  const str=(o,t)=>{ for(let i=0;i<t.length;i++) v.setUint8(o+i,t.charCodeAt(i)); };
  str(0,'RIFF'); v.setUint32(4,36+n*2,true); str(8,'WAVEfmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true);
  v.setUint16(32,2,true); v.setUint16(34,16,true);
  str(36,'data'); v.setUint32(40,n*2,true);
  let o=44;
  for(let i=0;i<n;i++){ let x=dan[i]; x=x<-1?-1:x>1?1:x;
    v.setInt16(o,x*32767,true); o+=2; }
  return new Blob([buf],{type:'audio/wav'});
}
async function sohraniZapis(){
  if(!vsego){ skazhi('записывать было нечего'); return; }
  const dan=new Float32Array(vsego); let k=0;
  for(const ch of kuski){ dan.set(ch,k); k+=ch.length; }
  kuski=[];
  const sek=(vsego/(ctx?ctx.sampleRate:48000)).toFixed(1);
  const d=new Date();
  const imya=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} `+
             `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-`+
             `${String(d.getSeconds()).padStart(2,'0')} `+
             `${(report.build&&report.build.imya)||'····'}.wav`;
  try{
    const o=await fetch('/rec',{method:'POST',
      headers:{'Content-Type':'application/octet-stream','X-Name':encodeURIComponent(imya)},
      body: wav(dan, ctx?ctx.sampleRate:48000)});
    skazhi(o.ok ? `записано ${sek} с → ${imya}` : 'не записалось');
  }catch(e){ skazhi('не записалось: '+e.message); }
}

async function listay(step){
  if(!presets.length) await zagruzispisok();
  if(!presets.length){ skazhi('пресетов пока нет'); return; }
  tekuschiy=((tekuschiy+step)%presets.length+presets.length)%presets.length;
  primenit(presets[tekuschiy]);
}
function peresoberi(novoe){
  seed = novoe!==undefined ? novoe>>>0 : (Math.random()*4294967295)>>>0;
  shli();
}


// макро — то, что на панели; p — то, что уходит в движок
const knobs={sway:.55, tone:.5, depth:.75, pulse:.2,
             hit:.35, spread:.15, drift:0, range:.5, gryzn:0, golos:0,
             zhat:0, drive:.15, master:1, ist:0, ton:.35, temp:.5,
             trakt:.3, naruzhu:0, kuda:0};
const switches={gen1:1, gen2:1, gen3:0, link:0, dirt:0, petlya:0,
                mix:0, povtor:0};

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

// Всё положение панели одним объектом. Многопозиционный переключатель
// хранится целым номером, а в ядро уходит долей — иначе восьмое положение
// приезжало как восьмёрка, ядро зажимало её в единицу, и рисунок не менялся.
function sostoyanie(){
  const v={...knobs};
  for(const t of SWITCHES){
    const pol=t.pol||2;
    v[t.k] = pol>2 ? switches[t.k]/(pol-1) : switches[t.k];
  }
  return v;
}
function send(){ if(node) node.port.postMessage({t:'p', v:sostoyanie()}); }
// Смена ВСЕГО состояния разом: сборка и ручки одним сообщением. По частям
// нельзя — под микшированием ядро начало бы перевод на старых ручках и
// доводило бы их движками уже в новом приборе.
function shli(){
  if(node) node.port.postMessage({t:'seed', v:seed, p:sostoyanie()});
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
// window.dbg — единственная щель наружу. Панель рисуется по кадрам, а кадров
// у скрытой вкладки нет вовсе, и без этих трёх геттеров панель невозможно
// ни померить, ни осмотреть иначе как глазами. Ничего не делает — только
// показывает.
window.dbg={sostoyanie:'не запускался',oshibka:null,
  get ploschadki(){return [...ploschadki.keys()]},
  get prov(){return Array.from(provodimost)},
  get ruchki(){return {...knobs}},
  get tumblery(){return {...switches}},
  // Нарисовать кадр по требованию: тогда цену панели видно замером, а не
  // ощущением «будто подлагивает». Не kadr — под этим именем сюда пишется
  // текст ошибки кадра, и метод затёрло бы первой же ошибкой.
  risuy(){ return kadr_(); }};
async function pusk(){
  if(idet) return;
  zagruzispisok();
  window.dbg.sostoyanie='запускаю';
  try{
  ctx=new AudioContext({latencyHint:'interactive'});
  await ctx.audioWorklet.addModule('chaos.worklet.js?v='+Date.now());
  node=new AudioWorkletNode(ctx,'chaos',{numberOfInputs:1,numberOfOutputs:1,
    outputChannelCount:[2]});
  node.connect(ctx.destination);
  node.port.onmessage=e=>{
    const d=e.data;
    if(d && d.t==='rec'){ zapisPrishla(d); return; }
    report=d; window.dbg.otchetov=(window.dbg.otchetov||0)+1; window.dbg.o=report;
  };
  await ctx.resume();
  idet=true;
  // Сборка и ручки уходят одним сообщением — состояние прибора целиком.
  shli();
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
  // Пока строка открыта, клавиатура принадлежит ей целиком.
  if(stroka.aktivna){
    e.preventDefault();
    if(c==='Enter'){ stroka.aktivna=false; skazhiTekst(); return; }
    if(c==='Escape'){ stroka.aktivna=false; return; }
    if(c==='Backspace'){ stroka.tekst=stroka.tekst.slice(0,-1); return; }
    if(e.key && e.key.length===1 && !e.metaKey && !e.ctrlKey) stroka.tekst+=e.key;
    return;
  }
  if(c==='Enter'){ e.preventDefault(); stroka.aktivna=true; return; }
  // Буквы n, o и p ушли под ручки XMOD и TUNE, а эти три обработчика
  // стояли ВЫШЕ разбора ручек и перехватывали нажатие — обе ручки молчали.
  // Команды переехали на то, что осталось свободным.
  for(const km of KOMANDY){
    if(c!==km.kl) continue;
    if(!!km.shift !== !!e.shiftKey) continue;
    e.preventDefault(); if(!e.repeat) km.deystvie(e);
    return;
  }

  // Тумблер щёлкает от одного нажатия и держится сам — это не ручка,
  // которую надо вести.
  for(const t of SWITCHES){
    if(c!==t.kl) continue;
    // Тумблеры, делящие клавишу с ручкой, живут на shift.
    if(!!t.shift !== !!e.shiftKey) continue;
    e.preventDefault();
    if(e.repeat) return;
    const pol=t.pol||2;
    switches[t.k]=(switches[t.k]+1)%pol;
    if(t.mikro && switches[t.k]) vklyuchiMikrofon();
    vspyshkat=t; vspyshka=8; send();
    return;
  }

  for(const r of KNOBS){
    const znak = c===r.m[0] ? -1 : c===r.m[1] ? 1 : 0;
    if(!znak) continue;
    // На парах со вторым слоем Shift ВЫБИРАЕТ величину, а не ускоряет ход.
    if(DVUSLOYNYE.has(c) && !!r.shift !== e.shiftKey) continue;
    e.preventDefault();
    const bylo=derzhim.get(c);
    if(bylo){ bylo.zhivo=performance.now(); return; }     // автоповтор — подтверждение
    {
      const t=performance.now();
      // Модификаторы ускоряют вращение: cmd/ctrl втрое, shift вдесятеро.
      // Пальцы на приборе крутят ручку с разной скоростью, и это ровно то же.
      // У СТУПЕНЧАТОЙ ручки промежуточных положений не бывает: нажатие
      // переставляет её на соседнюю ступень, и удержание ничего не разгоняет.
      // Это переключатель с фиксацией, а не подстроечник.
      if(r.stupeni){
        const n=r.stupeni.length-1;
        const bylo=clamp(Math.round((knobs[r.k]||0)*n),0,n);
        knobs[r.k]=clamp(bylo+znak,0,n)/n;
        poslednyaya=r; vspyshka=6; send();
        return;
      }
      const skor = DVUSLOYNYE.has(c) ? ((e.metaKey||e.ctrlKey) ? 3 : 1)
                 : e.shiftKey ? 10 : (e.metaKey||e.ctrlKey) ? 3 : 1;
      derzhim.set(c,{klyuch:r.k,znak,ruchka:r,nachalo:t,zhivo:t,skor});
      knobs[r.k]=clamp((knobs[r.k]||0)+znak*.02*skor,0,1);
      // Голосу нужен источник: без микрофона ручка глубины крутится
      // впустую, и это ровно то, на что легко не заметить.
      if(r.k==='golos' && knobs.golos>0) vklyuchiMikrofon();
      // Микрофон нужен, пока SOURCE не уведён целиком в говорилку.
      if(r.k==='ist' && knobs.ist<.98) vklyuchiMikrofon();
      poslednyaya=r; vspyshka=6; send();
    }
    return;
  }
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

// ---- ЗАПАС ПО ВРЕМЕНИ ------------------------------------------------------
// Звуковой поток идёт по своим часам. Если воркл не уложился в срок, браузер
// выбрасывает буфер — и часы звука ОТСТАЮТ от настенных. Это и слышно как
// щелчок с пропаданием, а на экране при этом ничего не видно: картина
// рисуется на другом потоке и о срыве не знает.
//
// Считать это можно бесплатно: сравнить, насколько продвинулись одни часы
// против других. Показываем только когда есть что показать.
let chasT = 0, chasZ = 0, poteryano = 0;
function zapas(){
  if (!ctx) return 0;
  const t = performance.now() / 1000, z = ctx.currentTime;
  // Первые две секунды не в счёт: там идёт разогрев и компиляция, и потери
  // на них неизбежны у кого угодно. Считать их значит врать про запас.
  if (chasT && z > 2){
    const nado = t - chasT, bylo = z - chasZ;
    // Отставание больше пяти миллисекунд за кадр — это выброшенный буфер,
    // а не дрожание таймера.
    if (nado - bylo > .005) poteryano += (nado - bylo) * 1000;
    // ПОТЕРИ ЗАБЫВАЮТСЯ. Счётчик копил их с запуска и не убывал никогда:
    // одна заминка на старте — и строка о срывах висела до перезагрузки,
    // хотя звук давно идёт ровно. Показывать надо СВЕЖИЕ потери, иначе
    // показание перестаёт что-либо значить. Половина уходит секунд за
    // двадцать.
    poteryano *= Math.pow(.5, nado / 20);
  }
  chasT = t; chasZ = z;
  return poteryano;
}

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
// ФОСФОР. Ни одного сплошного блока и ни одной горизонтальной черты: блоки
// читались квадратиками, а черты складывались в ровные линии поперёк фигуры.
//
// ЗНАКИ ВЫБРАНЫ ПО ЧЕРНИЛАМ, А НЕ НА ГЛАЗ. Видимая яркость знакоместа — это
// доля закрашенной клетки, умноженная на яркость цвета; одного цвета мало.
// Прежний ряд ' ·∙:∴*' был порочен: три средние ступени закрашивают клетку
// почти одинаково (14.5%, 15.5%, 16.8%), то есть из пяти ступеней
// различались три, а потом шёл прыжок вдвое.
//
// Замерено отрисовкой в тем же шрифте, доля клетки картины:
//
//     ·  6.0%     точка
//     ◦ 10.9%     колечко
//     ∙ 16.8%     жирная точка
//     ✳ 30.9%     звёздочка
//     ※ 53.0%     плотная звезда
//
// Вместе с лестницей цвета (69·111·160·208·236) это даёт видимую яркость
// 414 · 1210 · 2688 · 6427 · 12508 — ровный ряд с шагом около двух с
// половиной, а не провал посередине. И фактура меняется вместе с яркостью:
// точка, колечко, клякса, звезда.
const PHOSPHOR=' ·◦∙✳※';
const KOD=[...PHOSPHOR].map(c=>c.charCodeAt(0));
const CVETOV=3, STUPENEY=5, SLOEV=CVETOV*STUPENEY;
// КАКАЯ СТУПЕНЬ КАКОМУ СЛОЮ. Зелёный берёт все пять — он фон, и глубину
// держит он. Акценты берут только верхние: затемнённый красный на мелком
// знаке читается бурым, а не тихим красным, и рядом с панелью это выглядело
// абсурдом. Тише или громче акцент — видно по знаку, не по цвету.
const KLASS=[['z0','z1','z2','z3','z4'],
             ['k3','k3','k3','k3','k4'],
             ['s3','s3','s3','s3','s4']];
// СОСТАВ КАРТИНЫ ЗАДАН ДОЛЯМИ, А НЕ ЯРКОСТЬЮ. Сколько знакомест попадает в
// каждую ступень — решено заранее: снизу вверх пятнадцать, двадцать пять,
// тридцать, двадцать два и восемь процентов от всех горящих. Порог под эти
// доли ищется в самой картине каждый кадр.
//
// Так и получается, что тональный состав у неё всегда один: тьма по краям,
// тело в середине, редкая раскалённая сердцевина. Абсолютной яркостью этого
// не добиться — она гуляет от сборки к сборке и от ручки к ручке, и картина
// то выцветала целиком, то проваливалась в темноту.
// Доли считаются СВЕРХУ и от всех горящих знакомест. Последняя — граница
// отрисовки: всё, что тусклее её, не рисуется вовсе.
//
// Тусклая масса — это пустая порода. Она занимала большую часть картины,
// делала тело огромным и не несла ничего: там, где след прошёл один раз и
// давно погас, смотреть не на что. Рисуется верхняя треть, и фигура сразу
// становится существом, а не пятном.
const DOLI=[.10,.20,.30,.38,.46];
const GRANI=new Float32Array(5);
// СЕТКА. Те же числа, что и в разметке: модуль — строка, рамка — два
// модуля сверху и снизу, три слева и справа. Держать их в одном месте
// незачем в двух: разойдутся.
const MODUL=16, RAMKA_V=2*MODUL;
// ПРОПОРЦИЯ КАРТИНЫ: вдвое шире, чем выше. Знакоместо 6.6 на 10 пикселей,
// значит строк должно быть 6.6/(10·2) от числа знаков в строке.
const OVAL=2;
// РАЗМЕР ФИГУРЫ ВНУТРИ ПОЛЯ. Тело занимает две трети полуразмера, щупальце
// бьёт наружу не длиннее трети, и до рамки остаётся пустая полоса. Раньше
// тело шло на 0.82, а щупальце на 0.46, и вместе они выходили за поле —
// всё, что за краем, просто не записывалось, отчего у фигуры появлялся
// ровный обрубленный край. Здесь это невозможно по построению: даже сумма
// предельных значений остаётся внутри.
const TELO=.46, SHIRE=1.5, SHIP=.42, POLYA=3, DOSTAT=.86;
// Сжатие тела к центру; наклон первого отрезка конечности от радиуса;
// излом в суставе, радиан; сколько суставов на конечность; сколько
// конечностей всего — их число задано, а не выведено из порога, иначе на
// тихом звуке их нет вовсе, а на громком фигура обрастает бахромой.
const SZHATIE=1.8, NAKLON=.7, SLOM=.55, KOLEN=3, KONECHNOSTEY=34;
let Sh=112, V=40, kolonok=3, ugol=0;
// ОДНА ФИГУРА, ТРИ ПОЛЯ. Прежде рисовались ТРИ фигуры — слышимое, до поста и
// без голоса, — а потом сравнивались их поля. Отсюда шло всё уродство: у
// каждой фигуры свои щупальца, и они лезли поверх чужих ровными лучами; а
// цвет получался сравнением двух независимо накопленных полей, то есть
// дрожащей величиной, которую приходилось загонять порогом в кляксы.
//
// Рисуется ОДНА фигура — та, что слышно. Цвет берётся у КАЖДОЙ ЕЁ ТОЧКИ по
// происхождению: насколько обработка изменила форму волны именно здесь и
// сколько здесь голоса. Соседние отсчёты похожи, поэтому цвет ложится
// связными участками сам собой — сглаживать нечего, и подробность цела.
let POLE=[], SHIPY=[];
// Слои разметки: свой на каждый цвет и ступень. В слое чистый текст.
let SLOI=[], SHABLON=null, PRE=[], BYLO=new Uint8Array(SLOEV);
// Дрожь от пальца на площадке и цвет каждого отсчёта — заводятся один раз.
const TOCHEK=256;
const MUTY=new Float32Array(TOCHEK), CVET=new Uint8Array(TOCHEK);
// Медленное среднее усиления поста — та точка отсчёта, от которой считается
// его работа. Ведётся между кадрами, потому что дыхание сжатия длиннее
// одного окна осциллографа.
let postSred=1;
// Веса вмешательства по отсчётам и гистограмма для отсечки.
const VESP=new Float32Array(TOCHEK), VESG=new Float32Array(TOCHEK);
// Точки траектории и длины разрывов: считаются первым проходом, рисуются
// вторым.
const TX=new Int16Array(TOCHEK), TY=new Int16Array(TOCHEK), TDL=new Float32Array(TOCHEK);
const GISTV=new Int32Array(32);
// Ниже этого знакоместо считается погасшим и не рисуется вовсе: слабый фон
// сливал рисунок в кашу.
const POROG_GOR=.02;
// ГДЕ ОТСЕЧЬ. Возвращает порог, выше которого лежит не больше заданной доли
// значений — и при этом не ниже нижней границы. Нижняя граница нужна, чтобы
// при выключенной обработке доля не вытаскивала цвет из ничего.
function otsechka(v, n, dolya, nizhniy){
  let mx=0;
  for(let i=0;i<n;i++) if(v[i]>mx) mx=v[i];
  if(mx<=nizhniy) return Infinity;
  GISTV.fill(0);
  const shag=31.999/mx;
  for(let i=0;i<n;i++) GISTV[(v[i]*shag)|0]++;
  let nado=Math.max(1,Math.round(n*dolya)), nakop=0, k=31;
  for(;k>0;k--){ nakop+=GISTV[k]; if(nakop>=nado) break; }
  return Math.max(nizhniy, k/shag);
}

// Гистограмма яркости на 64 корзины: по ней берётся верхушка распределения.
const GIST=new Int32Array(64);
function pomer(){
  const ris=$('#canvas');
  if(!ris) return;
  const proba=document.createElement('span');
  proba.style.cssText='position:absolute;visibility:hidden;white-space:pre';
  proba.textContent='0'.repeat(100);
  ris.appendChild(proba);
  const shs=proba.getBoundingClientRect().width/100 || 6.6;
  proba.remove();

  // СТОЯ или ЛЁЖА — по форме окна, тем же порогом, что и в разметке.
  const lezha=(innerWidth||800)/(innerHeight||800) >= 1.25;

  // ПРОПОРЦИЯ КАРТИНЫ ПОСТОЯННА. Вдвое шире, чем выше — горизонтальный овал.
  // Это форма фигуры, и она не должна зависеть от того, какое окно человек
  // растянул: одна и та же сборка обязана выглядеть одинаково. Меняется
  // только МАСШТАБ — сколько знакомест уложится.
  //
  // Здесь стояло «картина принимает форму окна», и это было ошибкой в обе
  // стороны: в широком коротком окне фигура расплющивалась в ленту, в
  // высоком узком вытягивалась в вертикальный овал.
  const str=parseFloat(getComputedStyle(ris).lineHeight)||8;
  const zanyato=($('#line').offsetHeight||MODUL)+MODUL
    + (lezha ? 0 : ($('#knobs').offsetHeight||24*MODUL)+MODUL);
  const shirDost=(ris.parentElement.clientWidth||innerWidth-16*shs);
  const vysDost=(innerHeight||800)-2*RAMKA_V-zanyato;
  const poShir=clamp(Math.floor(shirDost/shs),30,420);
  const poVys=clamp(Math.floor(vysDost/str),10,200);
  // Сколько строк картины приходится на знакоместо при нужной пропорции.
  const naZnak=shs/(OVAL*str);
  // Вписываем прямоугольник постоянной пропорции в то, что осталось: по
  // ширине или по высоте — что первым упрётся. ЧИСЛО СТРОК ЧЁТНОЕ: строка
  // картины — половина модуля, и только при чётном их числе низ картины
  // садится на ту же линию, что и строки панели.
  let novv=Math.min(poVys, Math.round(poShir*naZnak));
  novv -= novv & 1;
  novv = Math.max(10, novv);
  const nov=clamp(Math.round(novv/naZnak),30,poShir);
  // Лёжа панель встаёт ОДНОЙ колонкой: она узкая и читается сверху вниз, как
  // ряд органов на боковой стенке. Стоя колонок столько, сколько влезает.
  kolonok = lezha ? 1 : nov>=96 ? 3 : nov>=66 ? 2 : 1;
  // Первый раз собираем в любом случае: размер может совпасть с исходным,
  // а полей и слоёв ещё нет вовсе.
  if(nov!==Sh||novv!==V||!SLOI.length){ Sh=nov; V=novv; peresoberiSloi(); }
  // ПАНЕЛЬ СТОИТ ПО ОДНОЙ ГОРИЗОНТАЛИ С КАРТИНОЙ. Она ниже картины и висела
  // прижатой к верху — два блока рядом читались как случайно положенные.
  // Сдвиг округляется до целого модуля: иначе строки панели сойдут с сетки.
  const pan=$('#panel');
  if(pan){
    const vys=novv*str, ph=($('#knobs').offsetHeight||0);
    const sdvig = lezha && ph && vys>ph
      ? Math.round((vys-ph)/2/MODUL)*MODUL : 0;
    if(pan.style.marginTop!==sdvig+'px') pan.style.marginTop=sdvig+'px';
  }
  // Размер коробки задаётся ЧИСЛОМ, а не содержимым: все слои сняты с потока,
  // и держать её было бы нечем.
  ris.style.width=(Sh*shs)+'px';
  ris.style.height=(V*str)+'px';
}

// Поля и слои пересоздаются ВМЕСТЕ: пересоздать часть значит оставить
// остальные прежней длины и получить на краях мусор.
function peresoberiSloi(){
  const ris=$('#canvas'); if(!ris) return;
  POLE=[]; SHIPY=[];
  for(let c=0;c<CVETOV;c++){
    POLE.push(new Float32Array(Sh*V)); SHIPY.push(new Float32Array(Sh*V));
  }
  // В шаблоне пробелы и переводы строк. Каждый кадр слой не заполняется
  // заново по знаку, а копируется целиком — это одно движение памяти.
  const dlina=(Sh+1)*V;
  SHABLON=new Uint16Array(dlina); SHABLON.fill(32);
  for(let y=0;y<V;y++) SHABLON[y*(Sh+1)+Sh]=10;
  ris.textContent='';
  SLOI=[]; PRE=[]; BYLO=new Uint8Array(SLOEV);
  for(let c=0;c<CVETOV;c++) for(let t=0;t<STUPENEY;t++){
    SLOI.push(new Uint16Array(dlina));
    const e=document.createElement('pre');
    e.className='sl '+KLASS[c][t];
    ris.appendChild(e); PRE.push(e);
  }
}
addEventListener('resize',pomer);

// Осциллограф не бесконечно широкополосный: у луча своя инерция. Без неё
// узкие импульсы кладут точки на две голые горизонтали, и фигура
// вырождается в гору с лучами.
//
// Вторая координата — ИНТЕГРАЛ сигнала, а не он же со сдвигом. Сдвиг годится
// для гладкой волны; у импульсной он даёт ту самую гору. Интеграл даёт
// настоящую квадратуру, и любая периодическая волна замыкается в петлю.
function podgotov(o){
  const n=o.length;
  const sgl=new Float32Array(n); let akk=0;
  for(let pr=0;pr<2;pr++) for(let i=0;i<n;i++){ akk += (o[i]-akk)*.34; sgl[i]=akk; }
  const inte=new Float32Array(n); let aki=0;
  for(let pr=0;pr<2;pr++) for(let i=0;i<n;i++){ aki = aki*.992 + sgl[i]*.05; inte[i]=aki; }
  let sri=0; for(let i=0;i<n;i++) sri+=inte[i]; sri/=n;
  let mxo=1e-4, mxi=1e-4;
  for(let i=0;i<n;i++){
    const a=sgl[i]<0?-sgl[i]:sgl[i]; if(a>mxo) mxo=a;
    const b=Math.abs(inte[i]-sri); if(b>mxi) mxi=b;
  }
  return {sgl,inte,sri,mxo,mxi,n};
}

// Один проход по траектории — она теперь одна. Каждый мазок кладётся в поле
// СВОЕГО цвета, и цвет берётся у отсчёта, а не у поля: сравнивать поля
// значило сравнивать две накопленные кляксы.
function risuy(g, ks, ki, geo){
  const {sgl,inte,sri,n}=g;
  const {cx,cy,ko,si,tvist,rastx,rasty}=geo;
  const mazok=(x0,y0,x1,y1,sila,c)=>{
    const p=POLE[c];
    const dx=x1>x0?x1-x0:x0-x1, dy=y1>y0?y1-y0:y0-y1;
    const shagov=dx>dy?dx:dy;
    if(shagov>Sh) return;
    const yar=sila/Math.max(1,Math.pow(shagov,.45));
    for(let q=0;q<=shagov;q++){
      const t=shagov?q/shagov:0;
      const x=Math.round(x0+(x1-x0)*t), y=Math.round(y0+(y1-y0)*t);
      if(x>=0&&x<Sh&&y>=0&&y<V) p[y*Sh+x]+=yar;
      const xm=Sh-1-x;                            // зеркало — орнамент
      if(xm>=0&&xm<Sh&&y>=0&&y<V) p[y*Sh+xm]+=yar*.25;
    }
  };

  // ПЕРВЫЙ ПРОХОД — только точки. Рисовать сразу нельзя: чтобы конечности
  // читались по отдельности, надо знать все разрывы разом и выбрать самые
  // резкие. Порог по величине для этого не годится — при тихом звуке
  // конечностей не было бы вовсе, при громком фигура обрастала сплошной
  // бахромой. Берём РАНГ: столько-то самых резких, и всё.
  for(let i=0;i<n;i++){
    const a=clamp(sgl[i]*ks,-1,1), b=clamp((inte[i]-sri)*ki,-1,1);
    const qx=a*ko - b*si, qy=a*si + b*ko;
    const rad=Math.sqrt(qx*qx+qy*qy);
    const t=tvist*rad*rad;
    const kt=Math.cos(t), st=Math.sin(t);
    let wx=qx*kt - qy*st, wy=qx*st + qy*kt;
    // ТЕЛО СОБИРАЕТСЯ В ЦЕНТР. Радиус возводится в степень больше единицы:
    // близкое к центру подтягивается сильнее далёкого, и вместо ровного
    // кольца — а орбита почти постоянного радиуса всегда даёт бублик —
    // получается плотная сердцевина. Само тело при этом занимает лишь треть
    // полуразмера: остальное отдано тому, что из него торчит.
    const rr=Math.sqrt(wx*wx+wy*wy);
    if(rr>1e-6){ const k=Math.pow(rr,SZHATIE-1); wx*=k; wy*=k; }
    const mut=MUTY[i];
    const nx=clamp(wx+mut,-1,1), ny=clamp(wy+mut,-1,1);
    // Существо шире, чем выше, — под стать рамке. Без этого оно выходило
    // круглым посреди широкого поля, и половина ширины стояла пустой.
    TX[i]=Math.round(cx + nx*cx*TELO*SHIRE*rastx);
    TY[i]=Math.round(cy - ny*cy*TELO*rasty);
  }
  let mxdl=1e-4;
  for(let i=1;i<n;i++){
    const dx=TX[i]-TX[i-1], dy=TY[i]-TY[i-1];
    const d=Math.sqrt(dx*dx+dy*dy);
    TDL[i]=d; if(d>mxdl) mxdl=d;
  }
  TDL[0]=0;
  // Порог по рангу через ту же гистограмму: сверху отсчитываем ровно
  // KONECHNOSTEY штук.
  GISTV.fill(0);
  const shagd=31.999/mxdl;
  for(let i=1;i<n;i++) GISTV[(TDL[i]*shagd)|0]++;
  let nakop=0, kdl=31;
  for(;kdl>0;kdl--){ nakop+=GISTV[kdl]; if(nakop>=KONECHNOSTEY) break; }
  const porogDL=Math.max(2, kdl/shagd);

  for(let i=1;i<n;i++){
    const x=TX[i], y=TY[i], px=TX[i-1], py=TY[i-1];
    const c=CVET[i];
    // Тело рисуется слабее конечностей: сплошная масса нужна как основание,
    // а читается фигура по тому, что из неё торчит.
    mazok(px,py,x,y,.46,c);
    const dl=TDL[i];
    if(dl<porogDL) continue;

    const sp=SHIPY[c];
    const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy)||1;
    let ax=dx/r, ay=dy/r;
    // КОНЕЧНОСТЬ СУСТАВЧАТАЯ. Прямой луч из центра — спица колеса, а плавная
    // дуга — щупальце медузы; ни то, ни другое сюда не годится. Нужна
    // ломаная: прямые отрезки с резкими изломами, как нога насекомого или
    // рог. Тогда из тела торчат острые линии в разные стороны, а не
    // расходится ровный веер.
    //
    // Куда и насколько ломать, берётся у самой траектории: косое
    // произведение двух последних отрезков — это её поворот в этой точке.
    // Конечность продолжает его и ломается туда же, поэтому соседние выходят
    // разными, а не одинаковыми.
    const ppx=TX[i-2>=0?i-2:0], ppy=TY[i-2>=0?i-2:0];
    const kres=(x-px)*(py-ppy)-(y-py)*(px-ppx);
    const kruche=clamp(kres/(dl*dl+8), -1, 1);
    // Первый отрезок уже отклонён от радиуса: строго наружу растут только
    // иглы, а нога отходит вбок.
    {
      const nak=kruche*NAKLON, cn=Math.cos(nak), sn=Math.sin(nak);
      const t1=ax*cn-ay*sn, t2=ax*sn+ay*cn; ax=t1; ay=t2;
    }
    const slom=(kruche>0?1:-1)*SLOM*(.6+.8*Math.abs(kruche));
    const cs=Math.cos(slom), ss=Math.sin(slom);
    // ДО РАМКИ КОНЕЧНОСТЬ НЕ ДОХОДИТ НИКОГДА. Длина мерилась в знаках по
    // ширине, а поле втрое ниже, чем шире, — конечность, направленная вверх
    // или вниз, не могла поместиться в принципе и упиралась в край.
    // Считаем запас ПО ЕЁ НАПРАВЛЕНИЮ и берём от него три четверти: вбок она
    // вырастает длинной, вверх короткой, и до рамки не достаёт ни одна.
    let zapas=1e9;
    if(ax>1e-6) zapas=Math.min(zapas,(Sh-1-POLYA-x)/ax);
    else if(ax<-1e-6) zapas=Math.min(zapas,(POLYA-x)/ax);
    if(ay>1e-6) zapas=Math.min(zapas,(V-1-POLYA-y)/ay);
    else if(ay<-1e-6) zapas=Math.min(zapas,(POLYA-y)/ay);
    const dlin=Math.min(dl*3.4, Sh*SHIP, Math.max(0,zapas*DOSTAT));
    const shagov=Math.max(KOLEN,Math.round(dlin));
    const koleno=shagov/KOLEN;
    let sx=x, sy=y, sled=koleno;
    for(let q=0;q<=shagov;q++){
      const tt=q/shagov;
      const ix=Math.round(sx), iy=Math.round(sy);
      // Дошли до поля у рамки — конечность на этом кончается. Каждая
      // кончается на своём месте, потому что каждая ломается по-своему,
      // и ровного края от этого не выходит.
      if(ix<POLYA||ix>=Sh-POLYA||iy<POLYA||iy>=V-POLYA) break;
      const yar=2.0*(1-tt)*(1-tt);              // сходит на остриё
      sp[iy*Sh+ix]+=yar;
      const sxm=Sh-1-ix;
      if(sxm>=0&&sxm<Sh) sp[iy*Sh+sxm]+=yar*.25;
      sx+=ax; sy+=ay;
      if(q>=sled){                              // СУСТАВ
        sled+=koleno;
        const t1=ax*cs-ay*ss, t2=ax*ss+ay*cs; ax=t1; ay=t2;
      }
    }
  }
}

// Буфер знаков в строку. Через раскодировщик — одним нативным движением на
// весь буфер. Сборка по восемь тысяч доводов за вызов оказалась в семьдесят
// раз дороже: развернуть типизированный массив в список доводов само по
// себе работа, и делается она девять раз за кадр.
const RASKOD = typeof TextDecoder!=='undefined'
  && new Uint16Array(new Uint8Array([65,0]).buffer)[0]===65   // порядок байт
  ? new TextDecoder('utf-16le') : null;
function vStroku(buf){
  if(RASKOD) return RASKOD.decode(buf);
  let s='';
  for(let i=0;i<buf.length;i+=8192)
    s += String.fromCharCode.apply(null, buf.subarray(i, Math.min(i+8192, buf.length)));
  return s;
}

// СЛЕД ОСЦИЛЛОГРАФА. По горизонтали сигнал, по вертикали его интеграл —
// настоящая квадратура, поэтому любая периодическая волна замыкается в
// петлю. Фигура одна: та, что слышно.
//
// Цвет каждой её точки — происхождение этого отсчёта:
//   зелёный  сам прибор
//   красный  здесь обработка изменила ФОРМУ волны
//   синий    здесь голос: и его влияние на схему, и он сам
//
// Форма, а не уровень: оба следа нормированы каждый по себе, поэтому MASTER
// не красит ничего — уровень видно по работе ограничителя, а не по картине.
function kartina(){
  const oA=report.osc||new Float32Array(TOCHEK);
  const oG=report.oscG||new Float32Array(TOCHEK);
  const oP=report.oscP, oX=report.oscX;
  const A=podgotov(oA);
  const G=podgotov(oG);
  const ks=1/A.mxo, ki=1/A.mxi;

  // ЧЕЙ ЭТО ОТСЧЁТ.
  //
  // Работа поста берётся у САМОГО ПОСТА — его мгновенное усиление, — а не
  // выводится из разницы двух нарисованных следов. Разница следов была
  // неверна дважды: компрессор действует уровнем, а следы нормируются каждый
  // по себе и уровень в них сокращается; и наоборот, любой сдвиг точки на
  // соседнее знакоместо давал «разницу» там, где её нет. Отсюда и шло то,
  // что компрессор при этом невидим, а красным светится крап.
  //
  // ОТ ЧЕГО СЧИТАТЬ ОТКЛОНЕНИЕ. Не от единицы: у сжатия есть постоянный
  // добор, и с ним усиление поста втрое даже когда он ничего не делает —
  // краснела бы вся фигура всегда. И не от среднего ПО ОКНУ: окно
  // осциллографа короче, чем дыхание компрессора (замер: внутри окна разброс
  // усиления два процента, а между окнами — десятки), и от оконного среднего
  // компрессор невидим ровно так же.
  //
  // Считаем от МЕДЛЕННОГО среднего, около секунды. Тогда стоящий на месте
  // пост не красит ничего, а всякий раз, когда он придавливает или отпускает,
  // это видно там, где он это делает.
  let okno=0;
  if(oP){ for(let i=0;i<TOCHEK;i++) okno+=oP[i]; okno/=TOCHEK; }
  if(okno>1e-6) postSred += (okno-postSred)*.04;
  const obrS = oP && postSred>1e-6 ? 1/postSred : 0;
  for(let i=0;i<A.n;i++){
    VESP[i] = obrS ? Math.abs(oP[i]*obrS - 1) : 0;
    // Голос — и он сам, и его ведение схемы. Слышимая доля меряется по
    // слышимому, иначе еле слышный голос красил бы фигуру во всю силу.
    const svoy = Math.abs(G.sgl[i])*ks;
    const vedet = oX ? oX[i] : 0;
    VESG[i] = svoy>vedet ? svoy : vedet;
  }
  // ЗЕЛЁНОЕ — ГЛАВНОЕ, И ЭТО ПРАВИЛО, А НЕ ПОРОГ.
  //
  // Сам прибор и есть основной звук; красное и синее — пометки поверх него.
  // Одним порогом это не удержать: выкрути обработку на полную, и по всякому
  // строгому счёту она касается почти каждой точки — фигура закрашивалась
  // целиком, и зелёного не оставалось вовсе.
  //
  // Поэтому цветом идёт ДОЛЯ: только те точки, где вмешательство сильнее
  // всего, и не больше трети фигуры на цвет. Порог для этого берётся не
  // числом, а по самим весам — там, где отсечь. Картина здесь прежде всего
  // украшение: её дело быть красивой, а не полной.
  const porK = otsechka(VESP, A.n, .30, .085);
  const porG = otsechka(VESG, A.n, .26, .24);
  for(let i=0;i<A.n;i++){
    const wp=VESP[i], wg=VESG[i];
    CVET[i] = (wg>porG && wg*1.4>=wp) ? 2 : wp>porK ? 1 : 0;
  }

  const u=clamp(report.swing??.5,0,1);
  const ut=clamp(report.utechka||0,0,1.4);

  // ПОСЛЕСВЕЧЕНИЕ: внизу качелей след держится дольше, наверху гаснет быстро.
  // Тело тлеет долго — оно и держит форму существа; щупальца гаснут почти
  // мгновенно, чтобы выстреливать и пропадать вместе с волной.
  // Шаг один на ОТЧЁТ, а их вдвое меньше, чем кадров экрана, поэтому
  // множитель взят в квадрате — это в точности два прежних шага подряд.
  const spad1=.90 + (1-u)*.06, spad=spad1*spad1, shsp=.42*.42;
  for(let c=0;c<CVETOV;c++){
    const p=POLE[c], sp=SHIPY[c];
    for(let i=0;i<p.length;i++){ p[i]*=spad; sp[i]*=shsp; }
  }

  ugol += (.003 + u*.016)*2;
  const geo={ cx:(Sh-1)/2, cy:(V-1)/2, ko:Math.cos(ugol), si:Math.sin(ugol),
              // Закрутка: внизу качелей внешние витки отстают и петля
              // сворачивается туже.
              tvist:(1-u)*2.4-.6,
              // Дыхание: качели растягивают фигуру по одной оси, поджимают
              // по другой.
              rastx:.82+u*.34, rasty:1.12-u*.34 };
  // Палец на площадке мутит саму фигуру.
  if(ut>.01) for(let i=0;i<A.n;i++) MUTY[i]=(Math.random()-.5)*ut*.18;
  else MUTY.fill(0);

  risuy(A, ks, ki, geo);

  // ГРАНИЦЫ СТУПЕНЕЙ — ПО РАНГУ. Строится гистограмма яркости горящих
  // знакомест, и по ней берутся четыре порога так, чтобы в ступени попали
  // заданные доли. Абсолютная яркость тут не годится ни в каком виде: одно
  // знакоместо, куда сошлись несколько мазков, бывает вдесятеро ярче
  // остального, и по нему вся фигура уезжала в нижнюю ступень.
  const P0=POLE[0],P1=POLE[1],P2=POLE[2],S0=SHIPY[0],S1=SHIPY[1],S2=SHIPY[2];
  const N=P0.length;
  let mx=1e-4, gorit=0;
  for(let i=0;i<N;i++){
    const v=P0[i]+S0[i]+P1[i]+S1[i]+P2[i]+S2[i];
    if(v>mx) mx=v;
  }
  // КОРЗИНЫ ПО КОРНЮ, А НЕ ПО ЯРКОСТИ НАПРЯМУЮ. Одно знакоместо, куда сошлись
  // несколько мазков, бывает на порядок ярче остальных — при равномерных
  // корзинах вся картина сваливалась в нулевую, пороги садились в ноль, и
  // рисовалось ВСЁ ПОЛЕ, включая пустые знакоместа. На экране это регулярная
  // решётка из точек во всю рамку: она и мигала.
  GIST.fill(0);
  const obrM=1/mx;
  for(let i=0;i<N;i++){
    const v=P0[i]+S0[i]+P1[i]+S1[i]+P2[i]+S2[i];
    if(v>POROG_GOR){ GIST[(Math.sqrt(v*obrM)*63.999)|0]++; gorit++; }
  }
  {
    let nakop=0, g=0;
    for(let k=63;k>=0&&g<5;k--){
      nakop+=GIST[k];
      while(g<5 && nakop>=Math.max(1,Math.round(gorit*DOLI[g]))){
        const u=k/63.999;
        // Порог НИКОГДА не опускается до нуля: иначе под него попадают
        // пустые знакоместа, и рисуется всё поле.
        GRANI[g++]=Math.max(POROG_GOR, u*u*mx);
      }
    }
    for(;g<5;g++) GRANI[g]=POROG_GOR;
  }
  // Сверху вниз: раскалённое, яркое, среднее, тусклое, и последняя — порог,
  // ниже которого не рисуем.
  const g4=GRANI[0],g3=GRANI[1],g2=GRANI[2],g1=GRANI[3];
  const gris=Math.max(POROG_GOR,GRANI[4]);

  // Слои чистятся одним движением памяти и заполняются только там, где
  // знакоместо горит. Тёмных знакомест большинство — их вообще не трогаем.
  const est=new Uint8Array(SLOEV);
  for(let k=0;k<SLOEV;k++) SLOI[k].set(SHABLON);
  for(let y=0;y<V;y++){
    const yb=y*Sh, ob=y*(Sh+1);
    for(let x=0;x<Sh;x++){
      const i=yb+x;
      const a0=P0[i]+S0[i], a1=P1[i]+S1[i], a2=P2[i]+S2[i];
      const v=a0+a1+a2;
      if(v<gris) continue;
      // Ступень и знак идут вместе: чем выше, тем крупнее знак и тем светлее
      // и горячее цвет. Одно без другого распадается — цвет без знака даёт
      // ровное поле, знак без цвета даёт серость.
      const st = v>=g4?4 : v>=g3?3 : v>=g2?2 : v>=g1?1 : 0;
      // Цвет знакоместа — у кого его больше. Смешивать нечего: точка либо
      // принадлежит прибору, либо её сдвинула обработка, либо это голос.
      const c = a1>a0 ? (a2>a1?2:1) : (a2>a0?2:0);
      const k = c*STUPENEY + st;
      SLOI[k][ob+x]=KOD[st+1];
      est[k]=1;
    }
  }
  // Пустой слой не переводим в строку вовсе, и очищаем его только когда он
  // ТОЛЬКО ЧТО опустел: без голоса и без обработки это сразу шесть слоёв.
  for(let k=0;k<SLOEV;k++){
    if(est[k]){ PRE[k].textContent=vStroku(SLOI[k]); BYLO[k]=1; }
    else if(BYLO[k]){ PRE[k].textContent=''; BYLO[k]=0; }
  }
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
// Та же шкала, но двумя кусками: горящее отдельно от погасшего. Погасшее
// НЕЙТРАЛЬНО и одинаково у всех зон: незажжённый сегмент на приборе не
// красный и не синий, он просто тёмный. Затемнённый красный вдобавок читается
// бурым — тем самым, из-за чего пришлось выкинуть тёмные ступени у акцентов.
const KL_GORIT=['z3','k3','s3'];
function shkalaHTML(v, sh, zona){
  const n=clamp(Math.round(v*sh),0,sh);
  return `<span class="${KL_GORIT[zona]}">${'▮'.repeat(n)}</span>`+
         `<span class="z0">${'·'.repeat(sh-n)}</span>`;
}
function ruchki(){
  const sb=report.build||{};
  const uzko = Sh<80;
  const shk = uzko ? 8 : 12;
  const stroki=[];

  // ПОКАЗАНИЙ ПЯТЬ, и каждое влечёт действие. Было девять, и четыре из них
  // не влекли ничего: PERIOD дублировал BPM тем же числом наизнанку, FREQ
  // при работающих качелях размазана в кашу и стоит неподвижно только на
  // мёртвых настройках, DUTY красив и ни к чему не ведёт, RAIL тоже, а
  // LEVEL в нынешнем виде почти ничто — потолок и так держит ограничитель.
  // Показание, на которое нельзя ответить рукой, — это украшение.
  const per=report.period>0&&report.period<30 ? report.period : 0;
  const r=report.razbros||0;
  // РЕЖИМ остаётся: это единственное, что говорит, где прибор находится по
  // хаосу — идёт ровно, дышит, гуляет или уже разваливается.
  const rezhim = r<.02?'ровно' : r<.10?'дышит' : r<.28?'гуляет' : r<.55?'край':'распад';
  // BPM. Качель = такт, шестнадцать шагов сетки укладываются в неё. Весь
  // музыкальный темп 70–160 лежит на тринадцати процентах хода ручки RATE,
  // и без подписи в него не попасть — отсюда «получается только рейв».
  // Ход ручки не тронут нарочно: он переопределил бы все пресеты.
  const bpm = per>0 ? 240/per : 0;
  const vtemp = bpm>=40 && bpm<=200;
  stroki.push(
    `<span class="z2">BPM    </span>`+
    shkalaHTML(bpm?clamp(Math.log2(bpm/8)/8,0,1):0,shk,0)+` `+
    (bpm ? `<span class="${vtemp?'hot':'dim2'}">${Math.round(bpm)}</span>` : '—')+
    `   <span class="z2">${rezhim}</span>`);
  // DROPOUT. Строка появляется только если звук правда рвался — иначе её нет.
  const pot = zapas();
  // Строка была вшестеро длиннее всех прочих и одна задавала ширину панели.
  if (pot > 20) stroki.push(
    `<span class="k2">DROPOUT</span> <span class="k3">`+
    `${Math.round(pot)} мс — воркл не успевает</span>`);
  // INPUT. Без этой строки проверить микрофон нельзя вовсе: не слышно,
  // дошёл ли сигнал до ядра, или разрешение не дали, или он просто молчит.
  const mk=clamp(report.mik||0,0,1), vz=report.vozvrat||0;
  stroki.push(
    `<span class="s2">INPUT  </span>`+shkalaHTML(mk,shk,2)+`<span class="s3"> ` +
    (mk>.002 ? 'идёт' : mikrofon ? 'тихо'
      : knobs.ist>.5 ? 'говорилка молчит' : 'микрофон не включён') +
    // ROOM — сколько из вышедшего комната вернула в микрофон. По нему ядро
    // само считает усиление петли, поэтому без петли его и не показываем.
    (switches.petlya ? `   ROOM ${vz.toFixed(2)}` : '') + `</span>`);
  // Сетка ритма: где удары и где сейчас счётчик.
  const ris=report.risunok||[];
  if(ris.length){
    const shag=report.shag|0;
    const s=ris.map((v,i)=> i===shag ? (v?'█':'▒') : (v?'▮':'·')).join('');
    stroki.push(`<span class="z2">SEQ    </span><span class="z3">${s}</span>`);
  }
  stroki.push('');

  // ЗОНЫ. Не оформление, а устройство прибора: схема, входное гнездо и слой
  // поверх. Разделены пустой строкой и цветом, вкладок нет — всё на виду.
  // У каждой зоны три ступени: имя тише значения, значение тише активного.
  // Прежде вся ячейка красилась одним цветом, и панель читалась ровным
  // пятном — а глазу нужно, чтобы шкала выступала из подписи.
  const ZONY = [
    {z:'shema', imya:'z2', obych:'z3', yark:'z4', n:0},
    {z:'golos', imya:'s2', obych:'s3', yark:'s4', n:2},
    {z:'post',  imya:'k2', obych:'k3', yark:'k4', n:1},
  ];
  // Ручки: имя, шкала, клавиши. Ширина колонки и число колонок — от экрана.
  const shr = uzko ? 10 : 14;
  // ЯЧЕЙКИ СНАЧАЛА СЧИТАЮТСЯ, ПОТОМ СТАВЯТСЯ. Ширина столбца берётся по
  // самой длинной ячейке в нём — и по ВСЕМ зонам разом, а не внутри каждой:
  // столбцы, выровненные по своей зоне, разъезжаются между зонами, и панель
  // перестаёт читаться сверху вниз. Прежде ширины не было вовсе, и ступень
  // у GAP («×0.25») сдвигала соседний столбец вправо на пять знаков.
  const yach=(r, zn)=>{
    const imya=(r.imya+'        ').slice(0,7);
    const v = knobs[r.k]||0;
    // У ступенчатой ручки шкала врёт: показываем, в какое положение она
    // встала на самом деле.
    const st = r.stupeni
      ? ' '+r.stupeni[clamp(Math.round(v*(r.stupeni.length-1)),
                            0,r.stupeni.length-1)]
      // Концы подписаны словами, а середина — обоими: там сигнал правда
      // входит в обе точки разом, и показать одну было бы враньём.
      : r.konci
      ? ' '+(v<.15?r.konci[0] : v>.85?r.konci[1] : r.konci.join('+'))
      : '';
    // ЯЧЕЙКА ДЕРЖИТ ПОСТОЯННУЮ ШИРИНУ, и добивается она С КОНЦА. Иначе
    // столбец дышал бы под пальцем: «×1» короче «×0.25» на три знака, и вся
    // панель дёргалась бы вправо-влево от одной ручки. Добивать в середине,
    // между подписью и клавишей, тоже нельзя — там появилась бы дыра.
    const predel = r.stupeni ? r.stupeni.reduce((a,b)=>a.length>b.length?a:b).length
                 : r.konci   ? r.konci.join('+').length : 0;
    const hvost = predel ? ' '.repeat(predel - (st.length - 1)) : '';
    return {imya, znach:shkalaHTML(v,shr,zn.n)+st, znachT:shkala(v,shr)+st,
            klav:r.podpis, hvost,
            t:`${imya}${shkala(v,shr)}${st} ${r.podpis}${hvost}`,
            svoy:r===poslednyaya&&vspyshka>0};
  };
  const ryady=[];
  for(const zn of ZONY){
    const rk = KNOBS.filter(r=>(r.zona||'shema')===zn.z);
    for(let i=0;i<rk.length;i+=kolonok)
      ryady.push({zn, yach:rk.slice(i,i+kolonok).map(r=>yach(r,zn))});
  }
  // Ширину столбца задают только те ячейки, за которыми в ряду что-то ещё
  // стоит. Последняя никого не двигает — и раздувать под неё весь столбец
  // незачем: ROUTE со своими «lamp+rail» стоит в ряду один.
  const shirina=[];
  for(const r of ryady) r.yach.forEach((c,i)=>{
    if(i<r.yach.length-1 && !(shirina[i]>=c.t.length)) shirina[i]=c.t.length; });

  for(const zn of ZONY){
    for(const r of ryady){
      if(r.zn!==zn) continue;
      stroki.push(r.yach.map((c,i)=>{
        // Последнюю в ряду не добиваем: хвост пробелов ничего не держит.
        const dob = i===r.yach.length-1 ? ''
                  : ' '.repeat(Math.max(0, shirina[i]-c.t.length));
        // Тронутая ручка светится целиком: она сейчас главная на панели.
        // Тронутая ручка светится целиком, включая погасшие сегменты: сейчас
        // она главная на панели, и дробить её на ступени незачем.
        if(c.svoy) return `<span class="${zn.yark}">${c.imya}${c.znachT} ${c.klav}</span>${c.hvost}${dob}`;
        return `<span class="${zn.imya}">${c.imya}</span>`+
               c.znach+
               ` <span class="z1">${c.klav}</span>${c.hvost}${dob}`;
      }).join('  '));
    }
    const tm = SWITCHES.filter(t=>(t.zona||'shema')===zn.z);
    if(tm.length) stroki.push(tm.map(t=>{
      const z=switches[t.k], pol=t.pol||2;
      // У двухпозиционного тумблера подписи нет: лампочка и имя говорят всё.
      // Подпись положения нужна там, где положений больше двух и словом их
      // не заменишь. Прежде выбор делался по тексту самой подписи — стоило
      // переименовать положение, и вид строки менялся сам собой.
      const vid = pol>2 ? (t.podpis[z]||String(z)) : (z?'▮':'·');
      const kl = IMYAKL[t.kl] || t.kl.replace('Key','').toLowerCase();
      // Замкнутый тумблер стоит на ступени значения, разомкнутый — на
      // ступени имени: разница видна раньше, чем прочтёшь подпись.
      return `<span class="${z?zn.obych:zn.imya}">${t.imya} ${vid}</span>`+
             ` <span class="z1">${kl}</span>`;
    }).join('  '));
    stroki.push('');
  }
  // Подпись сборки. Пока номиналы едут, играет ещё ПРЕЖНИЙ прибор — значит
  // и подписан экран должен быть им, а новый показан как то, куда едем.
  // Прежде тут стояло имя живого прибора рядом с семенем запрошенного, и на
  // всём переходе буквы не менялись, а число уже было новым.
  const bd=report.budet;
  const put=bd
    ? ` <span class="z3">→ ${bd.imya} ${bd.semya>>>0}</span>`+
      ` <span class="z2">${Math.round((report.perehod||0)*100)}%</span>`
    : '';
  // Строка текста показывается всегда: без неё непонятно, что скажется.
  stroki.push(stroka.aktivna
    ? `<span class="s2">TEXT   </span><span class="s4">${stroka.tekst}▏</span>`+
      `  <span class="z1">enter сказать · esc отменить</span>`
    : `<span class="s2">TEXT   </span><span class="s3">${stroka.tekst||'—'}</span>`+
      `  <span class="z1">enter — ввести</span>`);
  stroki.push(`<span class="z0">BUILD  ${sb.imya||'····'} ${(sb.semya!==undefined?sb.semya:seed)>>>0}`+
              (sb.dinamik?` · ${Math.round(sb.dinamik)}Гц · ${(sb.emkost*1e9).toFixed(1)}нФ`:'')+
              `</span>`+put);
  return stroki.join('\n');
}

// ЛЕГЕНДА СОБИРАЕТСЯ ИЗ ТАБЛИЦ, а не пишется руками. Написанная руками она
// расходится с прибором на первой же перекладке клавиш — и разошлась: в ней
// висели буквы, давно отданные под ручки. Теперь расходиться ей не с чем.
function klavisha(kod){
  return IMYAKL[kod] || {Tab:'tab', Space:'пробел', Enter:'⏎', Escape:'esc'}[kod]
      || kod.replace('Key','').toLowerCase();
}
function legenda(){
  // ЛЕГЕНДА ПЕРЕЧИСЛЯЕТ ТОЛЬКО ТО, ЧЕГО НЕТ НА ПАНЕЛИ. У каждой ручки и
  // каждого тумблера клавиша написана рядом с ним же — повторять их внизу
  // значит заполнять экран тем, что и так видно. Остаются команды: у них
  // своей строки нет и быть не может, потому что они не величины.
  const kom = KOMANDY.map(k => `${k.shift?'\u21e7':''}${klavisha(k.kl)} ${k.imya}`);
  kom.push('1\u20138 площадки', '\u2318 втрое', '\u21e7 вдесятеро');
  // ЦВЕТ ОБЪЯСНЯЕТ СЕБЯ САМ. Строка «красное — работа поста, синее — голос»
  // стояла тут потому, что зон не было; теперь зелёные, синие и красные
  // ручки лежат отдельными блоками, и подпись под картиной повторяет то,
  // что и так видно сверху.
  return `<span class="z0">${kom.join(' \u00b7 ')}</span>`;
}

function kadr(){
  // Ошибку в кадре нельзя глушить молча: панель просто исчезала, а причина
  // оставалась только в отладочном поле.
  try{ kadr_(); }catch(e){
    if(window.dbg.kadr!==''+e){ window.dbg.kadr=''+e; console.error('кадр:',e); }
  }
  requestAnimationFrame(kadr);
}
// Что уже стоит на экране. Разметку меняем ТОЛЬКО когда она правда другая:
// сама по себе замена — разбор строки, пересчёт раскладки и перерисовка, и
// шестьдесят раз в секунду это заметная доля главного потока. У каждой
// вкладки свой звуковой поток, а вот главный и ядра — общие, и отсюда
// «подтормаживает на двух-трёх».
let bylOtchet = -1, byliRuchki = '', bylaStroka = '', bylaShapka = null;
let bylaKorobka = '';
function kadr_(){
  if(vspyshka>0) vspyshka--;
  if(!idet){
    // Заголовка нет. До запуска здесь стоит одно приглашение, после — пусто.
    if(bylaShapka!==0){ bylaShapka=0;
      $('#head').innerHTML = `<span class="z4">нажми любую клавишу</span>`; }
    return;
  }
  if(bylaShapka!==1){ bylaShapka=1; $('#head').innerHTML=''; }

  // КАРТИНА ПЕРЕРИСОВЫВАЕТСЯ НА ОТЧЁТ, а не на кадр экрана. Прибор
  // отчитывается тридцать раз в секунду — между отчётами рисовать нечего,
  // те же данные легли бы дважды. Заодно уходит расхождение на экранах со
  // 120 Гц: там след гас вдвое быстрее просто потому, что кадров больше.
  const n = window.dbg.otchetov|0;
  // Картина пишет себя в слои сама: разметку ей больше не отдают.
  if(n!==bylOtchet){ bylOtchet=n; kartina(); }

  const r = ruchki();
  if(r!==byliRuchki){ byliRuchki=r; $('#knobs').innerHTML=r; }
  // Панель сама задаёт, сколько места осталось картине: стоя — своей
  // высотой, лёжа — своей шириной. Пока панель не нарисована, брать эти
  // числа неоткуда, а меняться они могут и потом — от числа колонок, от
  // длинной подписи. Меряем заново, когда её коробка правда стала другой.
  const p=$('#panel'), ko=p.offsetWidth+'×'+p.offsetHeight;
  if(ko!==bylaKorobka){ bylaKorobka=ko; pomer(); }
  const l = legenda()+
    (vest && performance.now()<vestdo ? `\n<span class="z4">${vest}</span>`
     : presets.length ? `\n<span class="z0">${presets.length} пресетов</span>` : '');
  if(l!==bylaStroka){ bylaStroka=l; $('#line').innerHTML=l; }
}
pomer();
kadr();
