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
import {Ekran, grani, CVETOV, STUPENEY, SLOEV, ZNAKI, POROG_GOR, KLASS_PANELI} from './ekran.js';
import {Zamer} from './zamer.js';

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
// КЛАВИШИ РАЗЛОЖЕНЫ ПО ЗОНАМ КЛАВИАТУРЫ, а не подряд по панели.
//
// Прежде они шли просто в порядке строк — и генераторы оказывались в двух
// концах, а голос был рассыпан между цифрами, скобками и стрелками. Правило
// теперь простое и говорится одной фразой:
//
//     БУКВЫ — САМ ПРИБОР, ЗНАКИ — ГОЛОС И ПОСТ.
//
//     ряд q…p     генераторы и качели, слева направо по группам
//     ряд a…;     продолжение качелей, сетка, питание
//     ряд z…b     тумблеры схемы и выключатель питания
//     n m , .     голос: высота и источник
//     цифры       ТОЛЬКО площадки — ничего кроме
//     стрелки     голос: куда и сколько наружу
//     скобки      пост
//
// Второй слой (Shift) держит парную величину там, где пар не хватило: он
// всегда родственник основной — GENDER при PITCH, ROUTE при DRY, MASTER при
// DRIVE, TANK при VOLTS, XMOD при SOURCE.
const KNOBS=[
  // ---- ПИТАНИЕ ----
  // VOLTS — напряжение питания. Середина хода это номинал сборки: вниз
  // голодание до срыва генерации, вверх перекорм.
  {k:'volt', kl:'KeyZ', imya:'VOLTS', gr:'pit'},
  // TANK — ёмкость накопителя, то есть сколько прибор догорает после снятия
  // питания. Не размер батареи: та решает, сколько он проработает до посадки.
  {k:'bak', kl:'KeyX', imya:'TANK',  gr:'pit'},

  // ---- СХЕМА · ГЕНЕРАТОРЫ ----
  {k:'range', kl:'KeyQ', imya:'TUNE',   gr:'gen'},   // общий строй прибора
  {k:'spread', kl:'KeyW', imya:'DETUNE', gr:'gen'},   // расстройка трёх генераторов
  {k:'pulse', kl:'KeyE', imya:'WIDTH',  gr:'gen'},   // ширина импульса
  // ---- СХЕМА · КАЧЕЛИ ----
  {k:'sway', kl:'KeyA', imya:'RATE',   gr:'kach'},  // период медленного генератора
  {k:'depth', kl:'KeyS', imya:'DEPTH',  gr:'kach'},  // глубина модуляции
  {k:'tone', kl:'KeyD', imya:'TONE',   gr:'kach'},  // рабочая точка фоторезистора
  // BIAS — смещение в цепи медленного узла. Оно и есть ток смещения, снятый
  // с отвода подстроечника, так что имя тут не приблизительное, а точное.
  {k:'hit', kl:'KeyF', imya:'BIAS',   gr:'kach'},
  // SLOP — разболтанность периода. Слово с панелей MPC и Elektron, и значит
  // там ровно это же.
  {k:'drift', kl:'KeyG', imya:'SLOP',   gr:'kach'},
  // ---- СХЕМА · СЕТКА ----
  {k:'gryzn', kl:'KeyR', imya:'SEQ',    gr:'setka'}, // глубина вмешательства счётчика

  // ---- ГОЛОС · ИСТОЧНИК ----
  // SOURCE — не переключатель, а потенциометр между микрофоном и говорилкой:
  // на середине слышны оба.
  {k:'ist', kl:'KeyH', imya:'SOURCE', zona:'golos', gr:'ist'},
  {k:'ton', kl:'KeyK', imya:'PITCH',  zona:'golos', gr:'ist'},
  // GENDER — длина тракта. Слово из вокодеров и формантных сдвигателей,
  // понятное без объяснения.
  {k:'trakt', kl:'KeyL', imya:'GENDER', zona:'golos', gr:'ist'},
  // GAP — размер тишины МЕЖДУ произнесениями, в тактах прибора. Не скорость
  // речи: та привязана к качелям намертво и ручкой не задаётся. Пять жёстких
  // ступеней, промежуточных положений нет — каждое нажатие это шаг.
  //
  // Стоит вторым слоем при SEQ, хотя принадлежит голосу: цифровой ряд отдан
  // площадкам целиком, а второй слой всегда родственник основной величины —
  // и SEQ, и GAP про ВРЕМЯ, один про шаг счётчика, другой про паузу речи.
  {k:'temp', kl:'KeyT', imya:'GAP', zona:'golos', gr:'ist',
   stupeni:['×0.25','×0.5','×1','×2','×3']},
  // GAP — размер тишины МЕЖДУ произнесениями, в тактах прибора. Не скорость
  // речи: та привязана к качелям намертво и ручкой не задаётся. Пять жёстких
  // ступеней, промежуточных положений нет — каждое нажатие это шаг.

  // ---- ГОЛОС · ВМЕШАТЕЛЬСТВО ----
  // XMOD — перекрёстная модуляция: сигнал из гнезда ведёт параметры схемы.
  // Это НЕ громкость: громкость источника наружу — DRY.
  {k:'golos', kl:'KeyJ', imya:'XMOD',   zona:'golos', gr:'vmesh'},
  {k:'naruzhu', kl:'Semicolon', imya:'DRY',    zona:'golos', gr:'vmesh'},
  // ROUTE — куда входит сигнал. Не выбор одного из двух, а положение
  // переключателя между ними, поэтому концы подписаны словами: на лампу
  // накала или прямо в шину питания.
  {k:'kuda', kl:'Quote', imya:'ROUTE',  zona:'golos', gr:'vmesh',
   konci:['lamp','nodes','rail']},

  // ---- ПОСТ ----
  {k:'zhat', kl:'KeyN', imya:'COMP',   zona:'post', gr:'post'},
  // DRIVE — усиление на входе ограничителя: сначала громче, потом плотнее,
  // потом стена. Потолок при этом стоит намертво, и пик не вылезет ни при
  // каком положении.
  {k:'drive', kl:'KeyM', imya:'DRIVE',  zona:'post', gr:'post'},
  // MASTER только ОСЛАБЛЯЕТ и стоит после ограничителя: громкость без
  // характера. Больше единицы ему нельзя — иначе он пробил бы потолок.
  {k:'master', kl:'Comma', imya:'MASTER', zona:'post', gr:'post'},
];

// ---- ТУМБЛЕРЫ --------------------------------------------------------------
// Разница с крутилками не в удобстве, а в физике. Подстроечник задаёт НОМИНАЛ:
// сколько ом, сколько вольт — величину можно вести плавно. Тумблер КОММУТИРУЕТ
// ЦЕПЬ: провод либо припаян, либо нет. Промежуточного положения у него не
// бывает физически, поэтому эти вещи и стоят отдельно от ручек.
const SWITCHES=[
  // ---- ПИТАНИЕ ----
  // Выключателя у прибора не было вовсе — он начинал играть сам, едва открыв
  // страницу. У всякой коробки он есть, и это не удобство, а орган:
  // выключение не обрывает звук, а разряжает накопитель, и прибор оседает по
  // громкости и по высоте разом.
  {k:'pit', kl:'KeyZ', shift:1, imya:'POWER', gr:'pit'},
  // MAINS — питание из розетки вместо кроны. Блок держит шину намертво и
  // несёт пульсацию выпрямителя на ста герцах; крона мягкая, но чистая.
  {k:'set', kl:'KeyX', shift:1, imya:'MAINS', gr:'pit'},
  // SAG — снятие развязки питания: шина проседает, и логика слышит сама себя.
  {k:'dirt', kl:'KeyC', shift:1, imya:'SAG',   gr:'pit'},
  // METAL — пробел меняет не схему, а ТО, ЧЕМ её трогают: вместо пальца
  // отвёртка. Те же восемь площадок, другая физика.
  //
  //   палец    сотни килоом, ладонь держит тело на общем проводе. Одна
  //            площадка уже слышна — есть куда деть ток.
  //   металл   килоомы, ручка изолирована, тела на земле НЕТ. Одна площадка
  //            не делает ничего: предмет всплывает до её напряжения. Работает
  //            только ПАРА — и работает жёстко.
  //
  // Прежде здесь стояла связь через питание, и она была неизлечимо комичной:
  // петля «выход → шина → пороги → период → выход» садится в предельный цикл,
  // то есть в ровное периодическое качание, а ровное ухо читает механикой.
  // Замер по трём сборкам показывал рост остроты модуляции вдвое-втрое.
  //
  // Пробел прежде был разовым ударом по корпусу. Как СОБЫТИЕ он звучал
  // заготовкой — три захода и три замера это подтвердили, — а как ДЕРЖИМОЕ
  // СОСТОЯНИЕ тот же механизм не имеет огибающей вовсе: есть две ступеньки,
  // вход и выход, и между ними стоячий режим. Комическая полоса 0.3–3 Гц,
  // из которой мы столько выбирались, при этом пуста по устройству.
  {k:'sboy', kl:'KeyV', shift:1, imya:'METAL', gr:'pit'},
  // ---- СХЕМА ----
  {k:'gen1', kl:'KeyQ', shift:1, imya:'OSC 1', gr:'gen'},
  {k:'gen2', kl:'KeyW', shift:1, imya:'OSC 2', gr:'gen'},
  {k:'gen3', kl:'KeyE', shift:1, imya:'OSC 3', gr:'gen'},
  // SYNC — захват генераторов друг другом через настоящий резистор.
  {k:'link', kl:'KeyR', shift:1, imya:'SYNC',  gr:'gen'},
  // ---- ГОЛОС ----
  // Микрофон слышит динамик, круг замыкает комната. Три положения: без
  // петли, лёгкая окраска помещением, самовозбуждение. Двухпозиционные
  // показывают лампочку, а у трёхпозиционного лампочкой не обойтись — там
  // положения подписаны словами.
  {k:'petlya', kl:'KeyH', shift:1, imya:'FEEDBACK', podpis:['off','room','howl'],
   pol:3, mikro:1, zona:'golos', gr:'petlya'},
  {k:'povtor', kl:'KeyJ', shift:1, imya:'LOOP', zona:'golos', gr:'petlya'},
  // ---- ПОСТ ----
  {k:'mix', kl:'KeyN', shift:1, imya:'MORPH', zona:'post', gr:'post'},
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
  // Обе клавиши освободились вместе с вкладкой: своему окну Tab не нужен.
  {kl:'Tab',       imya:'назад по сборкам', shift:1, deystvie:()=>nazad()},
  {kl:'Tab',       imya:'бросок костей', ctrl:1, deystvie:()=>brosok()},
  {kl:'Backquote', imya:'запись',      deystvie:()=>zapis()},
  // ПОМЕТИТЬ ЯВЛЕНИЕ. Открывает строку, человек называет услышанное, и
  // двадцать секунд чисел ложатся под этим именем. Одно и то же имя можно
  // ставить сколько угодно раз — из повторов и выводится эталон.
  {kl:'KeyP', imya:'пометить явление', alt:1, deystvie:()=>{
    stroka.aktivna=true; stroka.pometka=true; stroka.tekst=''; }},
  // Полсекунды схемы поотсчётно — то, чего обычный снимок не видит.
  {kl:'KeyB', imya:'быстрый щуп', alt:1, deystvie:()=>bystro()},
  // Стрелки ЛИСТАЮТ, а опасное сидит на сочетании с ctrl. Сохранение висело
  // на голой ↑ и стоило спокойствия: рука боялась листать. Мышь эту работу
  // тоже не взяла — тыкать в текстовую строку оказалось неудобно, — так что
  // всё вернулось на клавиатуру, но так, чтобы ненароком не нажалось.
  // ЛИСТАНИЕ УШЛО ПОД ⌥ И ПО ГОРИЗОНТАЛИ. Голая стрелка листала пресеты — и
  // по невнимательности уводила прибор совсем не туда, а рука на стрелках
  // теперь живёт постоянно: ими крутят ручки. Вертикальные ⌥-стрелки заняты
  // сохранением и удалением, их трогать нельзя, значит листание — боковое.
  {kl:'ArrowLeft',  imya:'листать', alt:1, deystvie:()=>listay(-1)},
  {kl:'ArrowRight', imya:'',       alt:1, deystvie:()=>listay(1)},
  // ALT ДЕРЖИТ ВСЁ РЕДКОЕ И ОПАСНОЕ, и это правило, а не случайность: в самом
  // приборе он не занят ничем, ни одна игровая клавиша его не использует, и
  // ненароком его не зажмёшь.
  //
  // Ctrl со стрелками не годится: на маке это системный переключатель рабочих
  // столов, и до страницы такое нажатие не доходит вовсе. Cmd со стрелками
  // забирает браузер. Alt со стрелками свободен и там, и там.
  {kl:'ArrowUp',   imya:'сохранить',   alt:1, deystvie:()=>sohrani()},
  {kl:'ArrowDown', imya:'удалить',     alt:1, deystvie:()=>udali()},
  // Гнездо там же: одно место, одна буква, вторая половина под shift.
  {kl:'KeyM',      imya:'микрофон',    alt:1, deystvie:()=>vklyuchiMikrofon()},
  {kl:'KeyM',      imya:'система',     alt:1, shift:1, deystvie:()=>vklyuchiSistemu()},
];

// ВЫБРАНО ПОКА НАЖАТО. Держишь букву — ручка твоя, отпустил — ничья. Ни
// режима, ни памяти: рука в каждый миг показывает, что трогает.
//
// Прежде ручка занимала ПАРУ соседних клавиш, и двадцать одна ручка требовала
// сорока двух — а буквенный блок даёт тридцать четыре. Помещалось только за
// счёт второго слоя на Shift; когда Shift ушёл под тумблеры, пары держать
// стало нечем. Одна клавиша на ручку укладывается с запасом в девять клавиш.
//
// И следствие, которого на парах не было: держишь ДВЕ буквы — обе ручки едут
// от одной стрелки. Связанный жест пальцами не сделать.
const derzhimRuchki = new Map();      // клавиша → ручка, пока нажата
const IMYAKL={Comma:',', Period:'.', Slash:'/', Semicolon:';', Quote:"'", Space:'␣',
             Backslash:'\\', Backquote:'`', Minus:'-', Equal:'=',
             BracketLeft:'[', BracketRight:']',
             ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓',
             Digit9:'9', Digit0:'0', Enter:'⏎'};
const znakKl = c => IMYAKL[c] || c.replace('Key','').toLowerCase();
for(const r of KNOBS) r.podpis = znakKl(r.kl);

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
const stroka = {aktivna:false, tekst:'', pometka:false};
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

// ---- ВХОДНОЕ ГНЕЗДО --------------------------------------------------------
// В гнездо втыкается ОДНО из двух: микрофон или звук вкладки. Дальше по тракту
// разницы нет вовсе — XMOD, DRY, ROUTE, петля работают с тем, что пришло, и
// ни одной новой сущности ради вкладки не заводится.
//
// СЫРОЙ СИГНАЛ ОБЯЗАТЕЛЕН. Петля замыкается через воздух, а эхоподавление,
// шумодав и авторегулировка усиления душат фидбек как «дефект»: их надо
// снимать явно, иначе вместо петли приходит вычищенная тишина.
// ГНЕЗДО ПРИНИМАЕТ ОБА СРАЗУ. Микрофон и звук вкладки — не «или», а два
// независимых входа в один узел: комната плюс радио, голос поверх видео.
// Переключателем это было ровно один заход и оказалось враньём про железо:
// в гнездо втыкают что воткнётся, а смешивает их сумматор.
const VHODY = {mik:null, sist:null};
function otsoedini(kakoy){
  const v = VHODY[kakoy]; if(!v) return;
  try{ v.uzel.disconnect(); }catch(e){}
  for(const d of v.potok.getTracks()) d.stop();
  VHODY[kakoy] = null;
}
function votkni(kakoy, potok){
  otsoedini(kakoy);
  const uzel = ctx.createMediaStreamSource(potok);
  uzel.connect(node);
  VHODY[kakoy] = {uzel, potok};
  // Показ можно остановить кнопкой самого браузера, и узнать об этом иначе
  // нельзя: гнездо пустеет молча, а панель показывала бы «идёт».
  for(const d of potok.getAudioTracks())
    d.onended=()=>{ if(VHODY[kakoy] && VHODY[kakoy].potok===potok){
      otsoedini(kakoy); skazhi(kakoy==='mik'?'микрофон отключился':'система отключилась'); } };
}
const СЫРО={echoCancellation:false, noiseSuppression:false, autoGainControl:false};
// СЫРОЙ СИГНАЛ ОБЯЗАТЕЛЕН. Петля замыкается через воздух, а эхоподавление,
// шумодав и авторегулировка усиления душат фидбек как «дефект»: их надо
// снимать явно, иначе вместо петли приходит вычищенная тишина.
async function vklyuchiMikrofon(){
  if(!ctx) return;
  if(VHODY.mik){ otsoedini('mik'); skazhi('микрофон вынут'); return; }
  try{
    const potok=await navigator.mediaDevices.getUserMedia({audio:СЫРО});
    votkni('mik', potok); skazhi('микрофон подключён');
  }catch(e){ skazhi('микрофон не дали: '+e.name); }
}
// ЗВУК ВСЕГО КОМПЬЮТЕРА.
//
// ПОЧЕМУ НЕ ЧЕРЕЗ ЗАХВАТ ЭКРАНА, КАК БЫЛО. Прежде тут стоял getDisplayMedia с
// systemAudio:'include', и назывался он «вкладкой» не случайно: на маке
// браузер отдаёт звук ТОЛЬКО при выборе вкладки. Окно и экран отдают картинку
// без звука — это ограничение самой системы, не наше. Флаг systemAudio
// работает на Windows, у нас он молча ничего не значит.
//
// Единственный настоящий путь к звуку ВСЕГО компьютера — виртуальное
// звуковое устройство: BlackHole (бесплатное, открытое) или Loopback. Ставится
// один раз, дальше в «Настройке Audio MIDI» собирается устройство с несколькими
// выходами — чтобы звук шёл и в колонки, и в него. После этого для браузера оно
// обычный ВХОД, и прибор берёт его тем же кодом, что микрофон.
//
// Оттого микрофон и система остаются двумя разными входами и работают разом:
// это просто два устройства.
const ВИРТУАЛЬНЫЕ = /blackhole|loopback|soundflower|virtual|многоканал|aggregate|совокуп/i;
// СВОЙ ВЫХОД — МИМО ВИРТУАЛЬНОГО УСТРОЙСТВА, И ЭТО ОБЯЗАТЕЛЬНО.
//
// Чтобы отдать прибору звук всего компьютера, системный выход ставят на
// устройство с двумя выходами: колонки плюс BlackHole. Но прибор — тоже
// программа на этом компьютере, и его собственный звук пойдёт туда же, а
// оттуда обратно во вход. Круг замкнётся не через воздух, как у микрофона, а
// напрямую по проводу, и завоет он мгновенно.
//
// Лечится честно: прибор явно назначает СЕБЕ выходом физические колонки. Тогда
// система пусть льёт в BlackHole всё что угодно — сам прибор туда не попадает.
async function svoyVyhod(){
  if(!ctx || !ctx.setSinkId) return false;
  try{
    const список=await navigator.mediaDevices.enumerateDevices();
    const выходы=список.filter(d=>d.kind==='audiooutput' && !ВИРТУАЛЬНЫЕ.test(d.label));
    // Встроенные колонки предпочтительнее прочего: наушники тоже подойдут, а
    // вот второе виртуальное устройство — нет.
    const цель=выходы.find(d=>/динамик|speaker|встроен|built/i.test(d.label)) || выходы[0];
    if(!цель) return false;
    await ctx.setSinkId(цель.deviceId);
    return цель.label;
  }catch(e){ return false; }
}
async function vklyuchiSistemu(){
  if(!ctx) return;
  if(VHODY.sist){ otsoedini('sist'); skazhi('система вынута'); return; }
  try{
    // Имена устройств браузер прячет, пока не дано разрешение хоть на один
    // вход. Если имён нет — спрашиваем разрешение и смотрим снова.
    let список=await navigator.mediaDevices.enumerateDevices();
    if(!список.some(d=>d.kind==='audioinput' && d.label)){
      const п=await navigator.mediaDevices.getUserMedia({audio:true});
      for(const d of п.getTracks()) d.stop();
      список=await navigator.mediaDevices.enumerateDevices();
    }
    const устр=список.filter(d=>d.kind==='audioinput' && ВИРТУАЛЬНЫЕ.test(d.label));
    if(!устр.length){
      skazhi('нет виртуального устройства — поставь BlackHole');
      return;
    }
    const potok=await navigator.mediaDevices.getUserMedia({
      audio:{deviceId:{exact:устр[0].deviceId}, ...СЫРО}});
    votkni('sist', potok);
    const свой=await svoyVyhod();
    skazhi('система: '+устр[0].label.slice(0,20)+(свой?' · выход в '+свой.slice(0,14):''));
  }catch(e){ skazhi('систему не дали: '+e.name); }
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

// УДАЛЯЕТ ТОЛЬКО МЫШЬ, и только то, что сейчас на экране. Пока сохранение и
// удаление висели на стрелках, рука их боялась: одно лишнее нажатие плодило
// записи, и листать приходилось с оглядкой. Теперь стрелки только листают,
// а опасное лежит под курсором — там, где случайно не нажмёшь.
async function udali(){
  if(tekuschiy<0 || !presets[tekuschiy]){ skazhi('нечего удалять'); return; }
  const p=presets[tekuschiy];
  try{
    const o=await fetch('/presets/'+encodeURIComponent(p.file),{method:'DELETE'});
    const d=await o.json();
    if(!d.ok){ skazhi('не удалилось: '+(d.error||'?')); return; }
    await zagruzispisok();
    // Остаёмся на том же месте списка, а не прыгаем в начало: чаще всего
    // удаляют несколько подряд.
    if(presets.length){ tekuschiy=Math.min(tekuschiy, presets.length-1);
                        primenit(presets[tekuschiy]); }
    else tekuschiy=-1;
    skazhi('в корзину: '+String(p.file).replace('.json',''));
  }catch(e){ skazhi('не удалилось: '+e.message); }
}

async function listay(step){
  if(!presets.length) await zagruzispisok();
  if(!presets.length){ skazhi('пресетов пока нет'); return; }
  tekuschiy=((tekuschiy+step)%presets.length+presets.length)%presets.length;
  primenit(presets[tekuschiy]);
}
// ИСТОРИЯ СБОРОК. Tab кидает новый прибор, и до сих пор прежний пропадал
// навсегда: понравившееся успевало исчезнуть раньше, чем рука тянулась
// сохранить. Теперь шаг назад возвращает предыдущее семя.
//
// Ветка отбрасывается при новом броске — как во всякой истории правок:
// уйдя назад и кинув заново, вперёд возвращаться уже некуда.
const istoriya=[seed]; let mesto=0;
function peresoberi(novoe){
  seed = novoe!==undefined ? novoe>>>0 : (Math.random()*4294967295)>>>0;
  istoriya.length=mesto+1; istoriya.push(seed); mesto=istoriya.length-1;
  shli();
}
function nazad(){
  if(mesto<=0){ skazhi('дальше некуда'); return; }
  seed=istoriya[--mesto]; shli();
  skazhi(`сборка ${mesto+1} из ${istoriya.length}`);
}
// ПОЛНЫЙ БРОСОК: и прибор, и все ручки разом. Единственное, чего он не
// трогает, — MASTER: это громкость на выходе, а не характер звука, и
// выпавший ноль читался бы как поломка, а не как новая сборка.
function brosok(){
  for(const r of KNOBS) if(r.k!=='master') knobs[r.k]=Math.random();
  poslednyaya=null;
  send();
  peresoberi();
  skazhi('бросок костей');
}


// макро — то, что на панели; p — то, что уходит в движок
// ЖИВОЙ ЗАМЕР. Тот же модуль, что и в стендах: если бы их было два, они
// разошлись бы, и я сравнивал бы несравнимое.
//
// Смысл всей этой машинки один: научить машину слышать. Слуха у неё нет и не
// будет, значит остаётся сложить рядом ПРИГОВОР ЧЕЛОВЕКА и ЧИСЛА той же
// секунды — и накапливать эти пары, пока связь не станет видна.
let slushatel=null, zamer=null, okno_zamera=null;
const KADRY=[], PAMYAT_KADROV=8000;      // около пяти минут
let ogib_posl=null, ogib_kogda=0;

// Ходом замера правит ТАЙМЕР, а не кадры отрисовки: прибор играет и когда
// окно ушло за другое, а requestAnimationFrame в спрятанном окне не идёт
// вовсе — замер обрывался бы ровно тогда, когда человек слушает, отвернувшись.
function zameryay(){
  if(!slushatel||!zamer) return;
  slushatel.getFloatTimeDomainData(okno_zamera);
  // Внутреннее прибор знает сам — считать его тут нечем.
  const o=report||{};
  // ЩУП ИДЁТ В КАДР ЦЕЛИКОМ. Раньше сюда попадало восемь чисел из сотни, и
  // по ним нельзя было понять, ПОЧЕМУ звук такой: видно было следствие и не
  // видно причины. Теперь в кадре всё течение тока по ветвям, все живые
  // сопротивления, цели, пороги и запас до срыва.
  const k=zamer.kadr(okno_zamera, Object.assign({
    lufs:+(o.lufs||0).toFixed(1), lim:+(o.lim||0).toFixed(2),
    sryvy:o.sryvy||0, razbros:+(o.razbros||0).toFixed(3),
  }, o.snimok||{}));
  KADRY.push(k);
  if(KADRY.length>PAMYAT_KADROV) KADRY.shift();
  // Разбор огибающей дорог и меняется медленно — раз в полсекунды.
  const t=performance.now();
  if(t-ogib_kogda>500){ ogib_kogda=t; ogib_posl=zamer.krivye(); }
}

// БЫСТРЫЙ ЩУП. Полсекунды состояния схемы, записанные КАЖДЫЙ отсчёт:形а
// напряжения на узлах, момент каждого переключения, ход питания, ток
// капсюля. Обычный снимок берётся раз в пятьдесят миллисекунд и всего этого
// не видит вовсе.
//
// Отсчёты уходят как есть, восьмибитной строкой: разбирать их в JSON значит
// раздуть полтора мегабайта в двадцать и потерять точность на печати.
let bystro_imya='быстро';
function bystro(имя){
  if(!node) return;
  bystro_imya=имя||('быстро-'+Date.now());
  node.port.postMessage({t:'быстро', v:.5});
  skazhi('щуп заряжен');
}
async function bystroPrishlo(d){
  const b=new Uint8Array(d.v.buffer);
  let дв=''; const кус=8192;
  for(let i=0;i<b.length;i+=кус) дв+=String.fromCharCode.apply(null,b.subarray(i,i+кус));
  try{
    const r=await fetch('/bystro',{method:'POST',body:JSON.stringify({
      имя:bystro_imya, polya:d.polya, sr:d.sr, otschetov:d.v.length/d.polya.length,
      nominaly:d.nominaly, snimok:d.snimok, sostoyanie:sostoyanie(),
      semya:(report.build||{}).semya||null, dannye:btoa(дв)})});
    const j=await r.json();
    skazhi('быстрый щуп: '+(j.file||'лёг'));
  }catch(e){ skazhi('щуп не лёг: '+e.message); }
}

// ПОМЕТКА ЯВЛЕНИЯ. Не «нравится» и не «не нравится»: вкус тут ни при чём.
// Человек называет то, что услышал — «захлёбывание», «ровное качание»,
// «треск от удара», — и программа кладёт рядом двадцать секунд чисел и
// полное состояние прибора.
//
// Из накопленного выводятся ЭТАЛОНЫ: у явления оказывается своя подпись в
// величинах, и дальше его можно опознавать счётом, а не спором. Приговор
// «хорошо или плохо» такой подписи не даёт — он говорит о человеке, а
// явление говорит о приборе.
async function metka(kakaya){
  if(!KADRY.length) return;
  const skolko=Math.min(KADRY.length, 460);       // около двадцати секунд
  const telo={
    явление:kakaya, источник:'окно', kogda:new Date().toISOString(),
    sostoyanie:sostoyanie(), semya:(report.build||{}).semya||null,
    imya:(report.build||{}).imya||null,
    krivye:ogib_posl||zamer.krivye(),
    // Номиналы кладутся ОДИН РАЗ на запись: они впаяны и в кадре им делать
    // нечего, а без них видно поведение и не видно причины.
    nominaly:(report.nominaly||null),
    kadry:KADRY.slice(-skolko),
  };
  try{
    const r=await fetch('/zamer',{method:'POST',body:JSON.stringify(telo)});
    const d=await r.json();
    skazhi('явление «'+kakaya+'» записано');
  }catch(e){ skazhi('не записалось: '+e.message); }
}

const knobs={volt:.5, bak:.5, sway:.55, tone:.5, depth:.75, pulse:.2,
             hit:.35, spread:.15, drift:0, range:.5, gryzn:0, golos:0,
             zhat:0, drive:.15, master:1, ist:0, ton:.35, temp:.5,
             trakt:.3, naruzhu:0, kuda:0};
const switches={pit:0, set:0, gen1:1, gen2:1, gen3:0, link:0, dirt:0, petlya:0,
                mix:0, povtor:0, sboy:0};

const p={};

let poslednyaya=null, vspyshka=0, vspyshkat=null, poslednieVkladki='';
// Ручка должна ехать, а не прыгать. Шаг 4% при диапазоне высоты в семь с
// половиной октав давал треть октавы за нажатие — отсюда «жёсткие пороги»
// и ощущение цифры вместо аналога. Теперь базовый шаг мелкий, а при
// удержании клавиши он разгоняется, как крутилка под пальцем.
// РАЗГОН ЖИВЁТ НА СТРЕЛКЕ, А НЕ НА БУКВЕ. Буква только говорит, ЧТО крутим;
// сколько накрутилось — дело стрелки, и она же разгоняется под пальцем. Если
// разгон оставить на букве, короткий тык по стрелке при долго зажатой букве
// улетал бы на пол-оборота.
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
    // ОТПУСТИЛ БУКВУ, А СТРЕЛКУ ДЕРЖИШЬ. Стрелка оставалась записанной, круг
    // продолжал крутиться вхолостую и КАЖДЫЙ КАДР зажигал вспышку — строка
    // ручки залипала подсвеченной навсегда, и панель выглядела сломанной.
    // Нет буквы — нечего вести, стрелку забываем.
    if(!derzhimRuchki.size){ derzhim.delete(k); continue; }
    const step=skorost/60;
    // Стрелка ведёт ВСЕ ручки, которые сейчас держат: две буквы — два
    // движения от одного пальца.
    for(const r of derzhimRuchki.values()){
      if(r.stupeni) continue;                 // ступенчатую разгонять нечем
      knobs[r.k]=clamp((knobs[r.k]||0)+s.znak*step,0,1);
      poslednyaya=r;
    }
    vspyshka=4;
  }
  if(derzhim.size && derzhimRuchki.size) send();
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
// Какая клавиша какую площадку держит. Цифровой ряд по порядку, пробел
// тринадцатым — ладонь.
const PLOSCHADKI = {Digit1:1, Digit2:2, Digit3:3, Digit4:4, Digit5:5, Digit6:6,
                    Digit7:7, Digit8:8, Digit9:9, Digit0:10, Minus:11, Equal:12,
                    Space:13};
const ploschadki=new Map();
const provodimost=new Float32Array(14);

// Проводимость ведётся плавно: контакт не идеальный ключ, он притирается
// под пальцем и отпускает с задержкой.
setInterval(()=>{
  let menyalos=false;
  for(let i=1;i<=13;i++){
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
  // ПЕРВОЕ ДВИЖЕНИЕ — ЭТО ВКЛЮЧЕНИЕ ПРИБОРА, чем бы его ни сделали: клавишей,
  // мышью, чем угодно. Выключатель заводится разомкнутым — коробка, стоявшая
  // на полке, пуста, — но открыть страницу, тронуть что-нибудь и не услышать
  // ничего читается поломкой, а не выключателем. Дальше POWER работает как
  // обычный тумблер, и слышно, как накопитель заряжается броском тока.
  switches.pit = 1;
  zagruzispisok();
  window.dbg.sostoyanie='запускаю';
  try{
  ctx=new AudioContext({latencyHint:'interactive'});
  await ctx.audioWorklet.addModule('chaos.worklet.js?v='+Date.now());
  node=new AudioWorkletNode(ctx,'chaos',{numberOfInputs:1,numberOfOutputs:1,
    outputChannelCount:[2]});
  node.connect(ctx.destination);
  // ЖИВОЙ ЗАМЕР. Анализатор висит на выходе отводом и в звук не вмешивается:
  // цепь на колонки идёт мимо него.
  slushatel=ctx.createAnalyser();
  slushatel.fftSize=2048; slushatel.smoothingTimeConstant=0;
  node.connect(slushatel);
  zamer=new Zamer(ctx.sampleRate, 2048, 1024);
  okno_zamera=new Float32Array(2048);
  setInterval(zameryay, 40);
  window.dbg.zamer=()=>({kadrov:KADRY.length, posl:KADRY[KADRY.length-1]||null,
                         ogib:ogib_posl});
  node.port.onmessage=e=>{
    const d=e.data;
    if(d && d.t==='rec'){ zapisPrishla(d); return; }
    if(d && d.t==='быстро'){ bystroPrishlo(d); return; }
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
// Мышью прибор запускается так же, как клавишей: браузер требует любого
// человеческого движения, а какого — ему всё равно.
addEventListener('pointerdown',()=>{ pusk(); });

// ---- клавиатура -----------------------------------------------------------
addEventListener('keydown',async e=>{
  const c=e.code;
  // ПЕРВОЕ НАЖАТИЕ — ЭТО И ЕСТЬ ВКЛЮЧЕНИЕ ПРИБОРА, и больше ничего.
  //
  // Выключатель заводится разомкнутым: коробка, простоявшая на полке, пуста.
  // Но открыть страницу, нажать клавишу и не услышать ничего — это читается
  // поломкой, а не выключателем. Поэтому первая клавиша замыкает питание, а
  // дальше POWER работает как обычный тумблер. Заодно слышно, как прибор
  // заводится: накопитель заряжается броском тока, и это настоящая ступенька
  // на шине.
  //
  // Нажатие при этом СЪЕДАЕТСЯ целиком — иначе та же клавиша тут же сделала
  // бы что-то ещё, а первое движение должно значить ровно одно.
  if(!idet){ await pusk(); e.preventDefault(); return; }
  // Пока строка открыта, клавиатура принадлежит ей целиком.
  if(stroka.aktivna){
    e.preventDefault();
    if(c==='Enter'){
      stroka.aktivna=false;
      // Строка служит двум делам, и путать их нельзя: обычно она говорит
      // голосом, а в режиме пометки называет явление.
      if(stroka.pometka){ stroka.pometka=false;
                          const имя=stroka.tekst.trim(); stroka.tekst='';
                          if(имя) metka(имя); else skazhi('без имени не помечаю');
                          return; }
      skazhiTekst(); return;
    }
    if(c==='Escape'){ stroka.aktivna=false; stroka.pometka=false; return; }
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
    if(!!km.ctrl !== !!e.ctrlKey) continue;
    if(!!km.alt !== !!e.altKey) continue;
    e.preventDefault(); if(!e.repeat) km.deystvie(e);
    return;
  }

  // Дальше alt не пускаем: иначе он крутил бы ручки и щёлкал тумблерами
  // заодно с командой.
  if(e.altKey) return;

  // ---- ТУМБЛЕРЫ: только с Shift ------------------------------------------
  //
  // ПОРЯДОК НАЖАТИЯ РЕШАЕТ, и это не тонкость. Одна клавиша несёт два смысла:
  // сама по себе она берёт ручку, с Shift — щёлкает тумблером. Развести их
  // можно только тем, что Shift был зажат ДО буквы: если буква уже держится,
  // а Shift пришёл после — это грубый шаг стрелкой, а не переключение.
  if(e.shiftKey && !derzhimRuchki.has(c)){
    for(const t of SWITCHES){
      if(c!==t.kl) continue;
      e.preventDefault();
      if(e.repeat) return;
      const pol=t.pol||2;
      switches[t.k]=(switches[t.k]+1)%pol;
      if(t.mikro && switches[t.k]) vklyuchiMikrofon();
      vspyshkat=t; vspyshka=8; send();
      return;
    }
  }

  // ---- РУЧКА: взять и держать ---------------------------------------------
  for(const r of KNOBS){
    if(c!==r.kl) continue;
    e.preventDefault();
    if(e.repeat) return;
    derzhimRuchki.set(c, r);
    poslednyaya=r; vspyshka=6;
    // Голосу нужен источник: без микрофона ручка глубины крутится впустую.
    if(r.k==='golos' && knobs.golos>0) vklyuchiMikrofon();
    if(r.k==='ist' && knobs.ist<.98) vklyuchiMikrofon();
    return;
  }

  // ---- СТРЕЛКИ: ведут то, что держишь -------------------------------------
  //
  // БЕЗ ЗАЖАТОЙ БУКВЫ СТРЕЛКИ НЕ ДЕЛАЮТ НИЧЕГО. Это подстраховка: голая
  // стрелка, листающая пресеты, по невнимательности уводит прибор совсем не
  // туда. Всё навигационное живёт под ⌥ и разбирается выше.
  const strelka = c==='ArrowLeft' ? -1 : c==='ArrowRight' ? 1 : 0;
  if(strelka){
    if(!derzhimRuchki.size) return;
    e.preventDefault();
    if(e.repeat){ const s2=derzhim.get(c); if(s2) s2.zhivo=performance.now(); return; }
    const тек=performance.now();
    derzhim.set(c,{znak:strelka, nachalo:тек, zhivo:тек,
                   skor: e.shiftKey ? 10 : (e.metaKey||e.ctrlKey) ? 3 : 1});
    // Модификаторы ускоряют ход: shift вдесятеро, cmd/ctrl втрое.
    const skor = e.shiftKey ? 10 : (e.metaKey||e.ctrlKey) ? 3 : 1;
    for(const r of derzhimRuchki.values()){
      // У СТУПЕНЧАТОЙ ручки промежуточных положений не бывает: нажатие
      // переставляет её на соседнюю ступень, и удержание ничего не разгоняет.
      if(r.stupeni){
        const n=r.stupeni.length-1;
        const bylo=clamp(Math.round((knobs[r.k]||0)*n),0,n);
        knobs[r.k]=clamp(bylo+strelka,0,n)/n;
      } else {
        knobs[r.k]=clamp((knobs[r.k]||0)+strelka*.02*skor,0,1);
      }
      poslednyaya=r;
    }
    vspyshka=6; send();
    return;
  }

  // ---- ПЛОЩАДКИ -----------------------------------------------------------
  // Цифровой ряд отдан им целиком, двенадцать точек, и пробел тринадцатой:
  // ладонь на корпусе. Держать можно сколько угодно разом — тело одно, и
  // каждая новая точка это новая перемычка через него.
  const пл = PLOSCHADKI[c] || 0;
  if(пл){
    e.preventDefault();
    if(!ploschadki.has(пл)) ploschadki.set(пл,{nazhata:performance.now()});
    return;
  }
});

// Отпускание клавиши, потеря фокуса, сворачивание вкладки. Все три
// обработчика были однажды снесены вместе с соседней правкой, и клавиши
// перестали отпускаться вовсе: ручка уезжала до упора, площадка оставалась
// прижатой навсегда. Это и было залипание, на которое жаловался yala.
addEventListener('keyup',e=>{
  derzhim.delete(e.code);
  derzhimRuchki.delete(e.code);
  // Последняя буква отпущена — вести больше нечего, и держать стрелки незачем.
  if(!derzhimRuchki.size) derzhim.clear();
  const п = PLOSCHADKI[e.code];
  if(п) ploschadki.delete(п);
});
addEventListener('blur',()=>{ derzhim.clear(); derzhimRuchki.clear(); ploschadki.clear(); });
addEventListener('visibilitychange',()=>{ derzhim.clear(); derzhimRuchki.clear(); ploschadki.clear(); });

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
// Знаки, ступени, цвета и слои живут в ekran.js — один экземпляр на
// панель и картину. Держать их в двух местах значит развести их на первой
// же правке, что уже трижды и случилось.
// ЗНАКИ ПАНЕЛИ — ИЗ ТОЙ ЖЕ СЕМЬИ, и шкала физически УТОЛЩАЕТСЯ к острию.
// Сплошной прямоугольник среди круглых знаков читался из другого прибора, а
// звезда на шкале не читалась вовсе. Здесь тот же ряд, что у картины:
// погасшее искрой, основание колечком, тело лучистым пятном, остриё полным
// кружком. Смысл не теряется — где горит и докуда, видно даже лучше, потому
// что толщина работает вместе с цветом.
// Одиночные метки панели — тумблеры и шаг сетки — берут знаки из того же
// ряда, что фигура: искра там, где не горит, лучистое пятно там, где горит.
const ZN_NET=ZNAKI[0][1], ZN_EST=ZNAKI[0][4];

// СЕТКА. Те же числа, что и в разметке: модуль — строка, рамка — два
// модуля сверху и снизу, три слева и справа. Держать их в одном месте
// незачем в двух: разойдутся.
// Модуль сетки — строка. Она теперь одна на панель и картину: 8 пикселей.
// Рамка сверху и снизу четыре модуля, по бокам десять знакомест.
const MODUL=8, RAMKA_V=4*MODUL;
// КАРТИНА НИКОГДА НЕ ОБРЕЗАЕТСЯ. Она либо стоит целиком, либо её нет.
//
// Обрезка по краю окна казалась хорошей мыслью — «панель вытесняет картину», —
// но на узком окне от неё оставался бессмысленный ломоть, поля пропадали, и
// вся композиция разваливалась. Целое маленькое читается лучше обломка
// большого.
//
// Отсюда и правило размера: картина занимает то, что осталось после панели,
// но не крупнее ПОТОЛКА. Потолок нужен, чтобы на широком экране она не росла
// без конца, отрывая панель к левому краю: после него растут поля, а не
// картина. А когда остаётся меньше ПОЛА, картины нет вовсе и панель встаёт
// одна по центру.
const POTOLOK_KART=212, POL_KART=48;
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
let SVOD=[], EKRAN=null;
// ГРАНИЦЫ СТУПЕНЕЙ ЗАВОДЯТСЯ ЗАПОЛНЕННЫМИ. Их считает картина, а панель на
// них живёт — и пока прибор молчит и фигуры нет, панель осталась бы вовсе без
// шкал: они рисуются в долях этих порогов. Начальная лестница геометрическая,
// как всякая настоящая; с первым же звуком её сменит посчитанная.
const GRANI=Float32Array.from([1, .5, .25, .12, .06]);
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
// Скользящее среднее, на месте. Окно широкое нарочно: семи отсчётов
// осциллографа не хватило и близко — это доля миллисекунды, а сжатие
// шевелится быстрее. Тридцать один отсчёт это уже полмиллисекунды, то есть
// порядок постоянной атаки, и след перестаёт дробиться.
const SGL=new Float32Array(TOCHEK);
function sgladi(v, n){
  const r=15;
  for(let i=0;i<n;i++){
    let s=0, k=0;
    for(let j=i-r;j<=i+r;j++){ if(j<0||j>=n) continue; s+=v[j]; k++; }
    SGL[i]=s/k;
  }
  v.set(SGL.subarray(0,n));
}

// Короткие отрезки одного цвета отдаём соседям: цвет длиной в один-два
// отсчёта — это крапина, а не цвет.
function slei(c, n, min){
  let i=0;
  while(i<n){
    let j=i; while(j<n && c[j]===c[i]) j++;
    if(j-i<min){
      const lev = i>0 ? c[i-1] : (j<n ? c[j] : c[i]);
      for(let k=i;k<j;k++) c[k]=lev;
    }
    i=j;
  }
}

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

// Ширина знакоместа, снятая в прошлый раз. Нужна ЗАЩЁЛКОЙ: если мерка вдруг
// вернёт ноль, взять старое верно, а взять запасные 6.6 — нет.
let SHS=4.82;
function pomer(){
  const ris=$('#canvas');
  if(!ris) return;
  // МЕРКУ СТАВИМ В ПАНЕЛЬ, А НЕ В КАРТИНУ.
  //
  // Картину мы сами прячем через `display:none`, когда места мало, — а в
  // спрятанном узле ширина любого пробника ноль. Мерка падала на запасные
  // 6.6 вместо настоящих 4.82, и дальше всё считалось с чужим знакоместом:
  // панель выходила шириной 343 вместо 251, места «не оставалось» никогда, и
  // картина не возвращалась, даже когда окно расширяли обратно. Защёлка.
  // Панель видна всегда, шрифт и сетка у неё те же.
  const proba=document.createElement('span');
  proba.style.cssText='position:absolute;visibility:hidden;white-space:pre';
  proba.textContent='0'.repeat(100);
  ($('#panel')||ris).appendChild(proba);
  const мерка=proba.getBoundingClientRect().width/100;
  proba.remove();
  if(мерка>1) SHS=мерка;
  const shs=SHS;

  // ПРОПОРЦИЯ КАРТИНЫ ПОСТОЯННА. Вдвое шире, чем выше — горизонтальный овал.
  // Это форма фигуры, и она не должна зависеть от того, какое окно человек
  // растянул: одна и та же сборка обязана выглядеть одинаково. Меняется
  // только МАСШТАБ — сколько знакомест уложится.
  //
  // Здесь стояло «картина принимает форму окна», и это было ошибкой в обе
  // стороны: в широком коротком окне фигура расплющивалась в ленту, в
  // высоком узком вытягивалась в вертикальный овал.
  const str=parseFloat(getComputedStyle(ris).lineHeight)||8;
  // МЕСТО ПОД КАРТИНУ МЕРЯЕТСЯ ПО РАЗМЕТКЕ, а не по innerWidth.
  //
  // Спрашивать окно нельзя: при масштабе страницы innerWidth и настоящая
  // ширина верстки расходятся — намерено 944 против 664, и картина считалась
  // на треть шире места, а потому вылезала за край всегда. Экран же во всю
  // рамку и от содержимого не зависит: у него и спрашиваем. Клетку самой
  // картины спрашивать по-прежнему нельзя — она берёт ширину по содержимому,
  // а содержимое это она сама.
  const zanyato=($('#line').offsetHeight||MODUL)+MODUL;
  // Ширину панели берём ЧИСЛОМ, а не у разметки: она постоянна по построению
  // (все строки добиты до SHIR_PANELI), а спрошенная у разметки она равна
  // нулю до первого нажатия — панель пуста, — и картина успевала родиться
  // вдвое шире места, а потом прыгнуть.
  const shirPan=SHIR_PANELI*shs;
  const ekr=$('#screen');
  const shirDost=(ekr?ekr.clientWidth:800)-shirPan-8*shs;
  const vysDost=(document.documentElement.clientHeight||800)-2*RAMKA_V-zanyato;
  const poShir=clamp(Math.floor(shirDost/shs),0,420);
  const poVys=clamp(Math.floor(vysDost/str),10,200);
  // Сколько строк картины приходится на знакоместо при нужной пропорции.
  const naZnak=shs/(OVAL*str);
  // РАЗМЕР: сколько осталось после панели, но не крупнее потолка; если окно
  // низкое — по высоте. Ширина считается ПЕРВОЙ, строки из неё: обратный
  // порядок округлял ширину вверх и картина вылезала на пару знакомест за
  // отведённое ей место.
  //
  // ЧИСЛО СТРОК ЧЁТНОЕ: строка картины — половина модуля, и только при чётном
  // их числе низ картины садится на ту же линию, что и строки панели.
  //
  // ПОЛ ДЕРЖИТ РАЗМЕР ПОЛЯ, А НЕ ВИДИМОСТЬ. Это разные вещи, и путать их
  // нельзя: пороги ступеней считаются ПО КАРТИНЕ и раздаются панели. Стоило
  // полю схлопнуться в ноль знакомест — а на узком окне остаток выходил
  // отрицательным, — как гистограмма оказывалась пустой, все пять порогов
  // садились в `POROG_GOR`, и от шкал оставались одни острия: тринадцать
  // точек на всю панель, ни дорожек, ни хвостов. Поле живёт всегда, просто
  // ниже пола его не показывают.
  let nov=Math.max(POL_KART, Math.min(poShir, POTOLOK_KART));
  let novv=Math.max(10, Math.round(nov*naZnak)&~1);
  if(novv>poVys){
    novv=Math.max(10, poVys&~1);
    nov=Math.round(novv/naZnak);
  }
  // Меньше пола картину не показываем: там уже не фигура, а крапина.
  const est = poShir>=POL_KART;
  // ПАНЕЛЬ — ОДНА ФОРМА ВСЕГДА: одна колонка, постоянная ширина, никаких
  // порогов. Перекладка по колонкам и была источником рывков: высота панели
  // прыгала вдвое-втрое, высота картины считается из «сколько осталось после
  // панели», и перемер шёл вторым проходом на следующем кадре.
  kolonok = 1;
  // Первый раз собираем в любом случае: размер может совпасть с исходным,
  // а полей и слоёв ещё нет вовсе.
  if(nov!==Sh||novv!==V||!EKRAN){ Sh=nov; V=novv; peresoberiSloi(); }
  // ПАНЕЛЬ СТОИТ ПО ОДНОЙ ГОРИЗОНТАЛИ С КАРТИНОЙ. Она ниже картины и висела
  // прижатой к верху — два блока рядом читались как случайно положенные.
  // Сдвиг округляется до целого модуля: иначе строки панели сойдут с сетки.
  // Сдвигается тот, кто НИЖЕ, — и панель под картину, и картина под панель.
  // Прежде двигалась только панель, и когда картина становилась мельче её,
  // та висела прижатой к верху, а под панелью зияло.
  const pan=$('#panel'), koro=ris.parentElement;
  if(pan && koro){
    // Коробка панели держит свою ширину ЧИСЛОМ, а не содержимым: до первого
    // нажатия панель пуста, и без этого место под неё в композиции не
    // резервировалось — картина рождалась шире, чем ей причитается, а с
    // первой нажатой клавишей прыгала.
    const shp=Math.round(shirPan)+'px';
    if(pan.style.width!==shp) pan.style.width=shp;
    const vys=est?novv*str:0, ph=($('#knobs').offsetHeight||0);
    const dp = vys>ph ? Math.round((vys-ph)/2/MODUL)*MODUL : 0;
    const dk = ph>vys ? Math.round((ph-vys)/2/MODUL)*MODUL : 0;
    if(pan.style.marginTop!==dp+'px') pan.style.marginTop=dp+'px';
    if(koro.style.marginTop!==dk+'px') koro.style.marginTop=dk+'px';
  }
  // Размер коробки задаётся ЧИСЛОМ, а не содержимым: все слои сняты с потока,
  // и держать её было бы нечем.
  koro.style.display = est ? '' : 'none';
  ris.style.width=(Sh*shs)+'px';
  ris.style.height=(V*str)+'px';
}

// Поля и слои пересоздаются ВМЕСТЕ: пересоздать часть значит оставить
// остальные прежней длины и получить на краях мусор.
function peresoberiSloi(){
  const ris=$('#canvas'); if(!ris) return;
  POLE=[]; SHIPY=[]; SVOD=[];
  for(let c=0;c<CVETOV;c++){
    POLE.push(new Float32Array(Sh*V)); SHIPY.push(new Float32Array(Sh*V));
    // Тело и щупальца сводятся в одно поле на цвет — движку приходит по
    // одному полю на цвет, а не по два.
    SVOD.push(new Float32Array(Sh*V));
  }
  EKRAN = EKRAN ? (EKRAN.peresoberi(Sh,V), EKRAN) : new Ekran(ris, Sh, V);
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
// Ниже этого пика показывать нечего: прибор молчит. Минус пятьдесят децибел
// — это не тихо, это выключено. Порог стоял на минус шестидесяти, и на нём
// фигура мигала: у выключенного прибора остаётся дрожь на осевшей ёмкости,
// замерено 0.0011 — ровно на границе.
const TISHINA=3e-3;
let PUSTO=0;
function kartina(){
  // ФИГУРА НОРМИРУЕТСЯ, и в этом её сила: одна и та же сборка выглядит
  // одинаково при любой громкости. Но у нормировки есть край — при полной
  // тишине она вытягивает шум последнего разряда в полноценную фигуру, и
  // выключенный прибор выглядел живее включённого. Молчит — не рисуем.
  if((report.pik||0) < TISHINA){
    if(EKRAN && !PUSTO){ PUSTO=1; for(const e of EKRAN.pre) e.textContent=''; }
    return;
  }
  PUSTO=0;
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
  // ВЕС СГЛАЖИВАЕТСЯ ПО ОТСЧЁТАМ, и это не косметика.
  //
  // Замер: средний слитный отрезок красного в картине был 2.07 знакоместа
  // против 3.38 у зелёного и 14 у ползунка на панели. Островок из двух
  // клеток ТЕРЯЕТ ЦВЕТНОСТЬ — цветовое разрешение глаза втрое-вчетверо ниже
  // яркостного, — и красное читалось бурым при том же самом цвете, ореоле и
  // знаке. Оттенками это не лечится в принципе.
  //
  // Причина в нарезке: цвет назначался каждому отсчёту порознь, а обработка
  // действует не по отсчётам. Её постоянные времени — доли миллисекунды на
  // атаке и десятки на отпускании, то есть ДЕСЯТКИ отсчётов осциллографа.
  // Дробить её след в крапину значит показывать зернистость измерения, а не
  // явление. Сглаживание по семи соседям возвращает следу его настоящую
  // длину.
  sgladi(VESP, A.n); sgladi(VESG, A.n);
  const porK = otsechka(VESP, A.n, .30, .085);
  const porG = otsechka(VESG, A.n, .26, .24);
  for(let i=0;i<A.n;i++){
    const wp=VESP[i], wg=VESG[i];
    CVET[i] = (wg>porG && wg*1.4>=wp) ? 2 : wp>porK ? 1 : 0;
  }
  // И добиваем одиночек: отрезок короче трёх отсчётов всё равно прочитается
  // крапиной, а не цветом. Отдаём его соседям.
  slei(CVET, A.n, 2);

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

  // Тело и щупальца сводятся в одно поле на цвет: движку приходит по одному.
  for(let c=0;c<CVETOV;c++){
    const p=POLE[c], sp=SHIPY[c], sv=SVOD[c];
    for(let i=0;i<sv.length;i++) sv[i]=p[i]+sp[i];
  }
  // ПОРОГИ СТУПЕНЕЙ И ОТРИСОВКА — ОБЩИЙ ДВИЖОК. Отсюда же пороги берёт
  // панель, поэтому свет у обеих половин экрана буквально один: не «такой
  // же», а тот самый.
  grani(SVOD, GRANI);
  EKRAN.risuy(SVOD, GRANI);
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
// Плоская шкала — только для СЧЁТА ШИРИНЫ ячейки. На экран она не идёт:
// рисует шкалу поле. Знаки тут любые, важна длина.
function shkala(v, sh){
  const n=clamp(Math.round(v*sh),0,sh);
  return ZN_EST.repeat(n)+ZN_NET.repeat(sh-n);
}
// ШКАЛА РИСУЕТСЯ ПОЛЕМ, А НЕ ТЕКСТОМ.
//
// В текстовом слое под неё оставляется пустое место, а свет кладёт тот же
// движок, что рисует фигуру: те же знаки, те же ступени, те же классы и те
// же пороги. Шкала и фигура — не «похожие», а буквально одно вещество.
//
// Здесь стояла своя лестница классов, свой ряд знаков и свой градиент по
// расстоянию до острия. Это была вторая система рядом с первой, и она
// неизбежно с ней расходилась: ревизия нашла семь случайных различий из
// восьми.
//
// Место помечается служебным знаком, а координаты снимаются ПОТОМ, обходом
// готовой разметки. Считать их по ходу сборки строк значило бы вести вторую
// бухгалтерию рядом с первой и однажды с ней разойтись; с разметки же
// снимаются ровно те, что есть на экране.
const MET='\u0001';
let SHKALY=[];
function shkalaMesto(v, sh, zona){
  SHKALY.push({v, sh, zona, n:clamp(Math.round(v*sh),0,sh)});
  return MET.repeat(sh);
}
function najdiShkaly(html){
  const stroki=html.replace(/<[^>]*>/g,'').split('\n');
  let k=0;
  for(let y=0;y<stroki.length && k<SHKALY.length;y++){
    const r=stroki[y];
    for(let x=0;x<r.length;){
      if(r[x]!==MET){ x++; continue; }
      let n=0; while(x+n<r.length && r[x+n]===MET) n++;
      SHKALY[k].x=x; SHKALY[k].y=y; k++;
      x+=n;
    }
  }
  return {shirina:Math.max(1,...stroki.map(r=>r.length)), vysota:stroki.length};
}
// ШИРИНА ПАНЕЛИ ПОСТОЯННА, и все строки добиваются до неё пробелами.
//
// Иначе панель дышит под текстом: «микрофон не включён» вшестеро длиннее
// «идёт», и всякий раз, как строка менялась, менялась и ширина панели. А от
// ширины панели считается место под картину — и картина прыгала бы вслед за
// подписью. Ни одна строка панель не перерастает: длинные подписи укорочены,
// поле ввода показывает хвост.
// Поле имени ДЕВЯТЬ, а не восемь: FEEDBACK ровно восемь букв, и при восьми
// клавиша прилипала к имени без пробела.
const SHIR_PANELI=52, POLE_IMENI=9, POLE_KLAV=4;
const vpole=(s,n)=>(s+'                    ').slice(0,n);
// КЛАВИША СТОИТ РЯДОМ С ИМЕНЕМ, а не в конце строки. Это практика, а не вкус:
// до конца строки глаз прыгает через всю шкалу, а на обратном пути путает
// соседние ряды. Порядок в строке — имя, клавиша, шкала, значение.
const chelo=(imya,kl,zn)=>
  `<span class="${zn.imya}">${vpole(imya,POLE_IMENI)}</span>`+
  `<span class="${zn.klav}">${vpole(kl||'',POLE_KLAV)}</span>`;
// Добивка до постоянной ширины считается по ВИДИМОЙ длине: разметка места не
// занимает.
function dobey(s){
  const n=s.replace(/<[^>]*>/g,'').length;
  return n<SHIR_PANELI ? s+' '.repeat(SHIR_PANELI-n) : s;
}

// ЗОНЫ. Не оформление, а устройство прибора: схема, входное гнездо и слой
// поверх. У каждой зоны четыре ступени: клавиша тише имени, имя тише
// значения, значение тише тронутого. Прежде вся ячейка красилась одним
// цветом, и панель читалась ровным пятном.
//
// ВНУТРИ ЗОНЫ ВСЁ ЕЁ ЦВЕТОМ — и подсказка клавиши, и дорожка шкалы. Правило
// картины «слабый свет принадлежит прибору, цветом помечено только сильное»
// на панели путало: у красных и синих шкал хвосты и дорожки выходили
// зелёными, а INPUT был синим с двух сторон и зелёным посередине.
const ZONY={
  shema:{imya:'z2', obych:'z3', yark:'z4', klav:'z1',  n:0},
  golos:{imya:'s3', obych:'s3', yark:'s4', klav:'s1',  n:2},
  post: {imya:'k3', obych:'k3', yark:'k4', klav:'k1',  n:1},
};
// ГРУППЫ ПО СМЫСЛУ, а не по рядам клавиатуры. Порядок здесь — порядок на
// экране, и клавиши розданы по нему же, подряд: qw er ty · ui op as df gh ·
// jk, тумблеры z x c v · b. Экран снова читается как клавиатура, только
// теперь по смыслу.
// ПИТАНИЕ ИДЁТ ПЕРВЫМ. Это не одна из групп схемы, а то, с чего прибор
// начинается: пока выключатель разомкнут, всё остальное на панели ничего не
// значит.
const GRUPPY=[['shema','gen'],['shema','kach'],['shema','setka'],
              ['golos','ist'],['golos','vmesh'],['golos','petlya'],
              ['post','post']];

function ruchki(){
  SHKALY=[];
  const sb=report.build||{};
  const shk = 12;
  const stroki=[];
  const zs=ZONY.shema, zg=ZONY.golos, zp=ZONY.post;
  // ТУМБЛЕР стоит своей строкой в своей группе. Прежде все восемь шли одной
  // строкой через всю панель — она одна была вдвое длиннее прочих и ни к
  // какой группе не относилась.
  // РУЧКА. Тронутая светится целиком, включая погасшие сегменты: сейчас она
  // главная на панели, и дробить её на ступени незачем. Тогда же шкала
  // рисуется ТЕКСТОМ, а не полем, — и метка в поле не ставится вовсе: иначе
  // все следующие шкалы разъехались бы на одну позицию.
  const ruchka=(r,zn)=>{
    const v=knobs[r.k]||0;
    // У ступенчатой ручки шкала врёт: показываем, в какое положение она
    // встала на самом деле. Концы подписаны словами, а середина — обоими:
    // там сигнал правда входит в обе точки разом.
    const st = r.stupeni
      ? ' '+r.stupeni[clamp(Math.round(v*(r.stupeni.length-1)),0,r.stupeni.length-1)]
      : r.konci
      // Три точки на ходу вместо двух: подписываем ближайшую, а между ними —
      // обе через плюс, чтобы было видно, что сигнал идёт в оба места разом.
      ? ' '+(r.konci.length>2
          ? (v<.12?r.konci[0] : v<.38?r.konci[0]+'+'+r.konci[1]
            : v<.62?r.konci[1] : v<.88?r.konci[1]+'+'+r.konci[2] : r.konci[2])
          : (v<.15?r.konci[0] : v>.85?r.konci[1] : r.konci.join('+')))
      : '';
    if(r===poslednyaya && vspyshka>0)
      return `<span class="${zn.yark}">${vpole(r.imya,POLE_IMENI)}`+
             `${vpole(r.podpis,POLE_KLAV)}${shkala(v,shk)}${st}</span>`;
    return chelo(r.imya,r.podpis,zn)+shkalaMesto(v,shk,zn.n)+
           `<span class="${zn.obych}">${st}</span>`;
  };
  const tumbler=(t,zn)=>{
    const z=switches[t.k], pol=t.pol||2;
    // У двухпозиционного подписи нет: лампочка и имя говорят всё. Подпись
    // нужна там, где положений больше двух и словом их не заменишь.
    const vid = pol>2 ? (t.podpis[z]||String(z)) : (z?ZN_EST:ZN_NET);
    const kl = (t.shift?'\u21e7':'')+(IMYAKL[t.kl] || t.kl.replace('Key','').toLowerCase());
    return chelo(t.imya,kl,zn)+
           `<span class="${z?zn.yark:zn.klav}">${vid}</span>`;
  };

  // ПОКАЗАНИЙ ПЯТЬ, и каждое влечёт действие. Было девять, и четыре из них
  // не влекли ничего: PERIOD дублировал BPM тем же числом наизнанку, FREQ
  // при работающих качелях размазана в кашу и стоит неподвижно только на
  // мёртвых настройках, DUTY красив и ни к чему не ведёт, RAIL тоже, а
  // LEVEL в нынешнем виде почти ничто — потолок и так держит ограничитель.
  // Показание, на которое нельзя ответить рукой, — это украшение.
  // ПИТАНИЕ СТОИТ ВЫШЕ ВСЕХ ПОКАЗАНИЙ: сперва орган, потом то, что он даёт.
  // Порядок внутри назван поимённо, а не «сперва ручки, потом тумблеры»:
  // сначала есть ли ток, потом откуда он, потом сколько его и надолго ли, и
  // только в конце — как схема его слышит, исправная и неисправная.
  for(const imya of ['POWER','MAINS','VOLTS','TANK','SAG','METAL']){
    const r=KNOBS.find(x=>x.imya===imya), t=SWITCHES.find(x=>x.imya===imya);
    stroki.push(r ? ruchka(r,zs) : tumbler(t,zs));
  }
  stroki.push('');

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
  stroki.push(chelo('BPM','',zs)+
    shkalaMesto(bpm?clamp(Math.log2(bpm/8)/8,0,1):0,shk,0)+` `+
    (bpm ? `<span class="${vtemp?'z4':'z1'}">${Math.round(bpm)}</span>` : '—')+
    `  <span class="z2">${rezhim}</span>`);
  // Сетка ритма: где удары и где сейчас счётчик. Имя то же, что у ручки, и
  // это НАРОЧНО: строка показывает рисунок счётчика, ручка задаёт, насколько
  // глубоко он лезет в схему. Один предмет, два органа — разводить их именами
  // значило бы разводить и в голове.
  const ris=report.risunok||[];
  if(ris.length){
    const shag=report.shag|0;
    // Шаг счётчика показан ЯРКОСТЬЮ, а не другим знаком: знак значит «удар
    // или нет», ступень — «здесь мы сейчас». Две разные вещи, два разных
    // средства.
    const s=ris.map((v,i)=>{
      const zn=v?ZN_EST:ZN_NET;
      return `<span class="${i===shag?'z4':v?'z3':'z1'}">${zn}</span>`;}).join('');
    stroki.push(chelo('SEQ','',zs)+s);
  }
  // УРОВЕНЬ И ОГРАНИЧИТЕЛЬ. Показания выхода не было вовсе — а это первое, что
  // спрашивают у любого прибора: докуда дошло и сколько срезано. Громкость
  // мерена по слуху (LUFS, K-взвешивание), а не по пику: пик у нашего треска
  // вчетверо выше среднего и врал бы вдвое.
  //
  // РАБОТА ОГРАНИЧИТЕЛЯ показана В ДЕЦИБЕЛАХ СРЕЗАННОГО, а не лампочкой
  // «жмёт / не жмёт»: лампочка горела бы всегда — он работает почти
  // непрерывно, — а важно, СКОЛЬКО он снимает.
  const lu=report.lufs||-70, lim=report.lim||0;
  stroki.push(chelo('LEVEL','',zp)+
    shkalaMesto(clamp((lu+40)/40,0,1),shk,1)+
    `<span class="k3"> ${lu>-70?Math.round(lu):'—'}</span>`+
    `<span class="k1"> LUFS</span>`+
    (lim>.1 ? `  <span class="k4">срез ${lim.toFixed(1)}</span>`
            : `  <span class="k1">срез 0.0</span>`));
  // DROPOUT. Строка появляется только если звук правда рвался — иначе её нет.
  const pot = zapas();
  if (pot > 20) stroki.push(
    `<span class="k3">${vpole('DROPOUT',POLE_IMENI)}${vpole('',POLE_KLAV)}`+
    `${Math.round(pot)} мс — воркл не успевает</span>`);
  // СРЫВ — это NaN в звуковом потоке, пойманный и вылеченный на лету. Строки
  // быть не должно никогда; если она есть, в схеме что-то разошлось.
  if(report.sryvy) stroki.push(
    `<span class="k4">${vpole('СРЫВ',POLE_IMENI)}${vpole('',POLE_KLAV)}`+
    `${report.sryvy} — ядро ловило NaN</span>`);
  stroki.push('');

  // INPUT стоит ОТДЕЛЬНО, отбитый пустыми строками: это гнездо, а не
  // показание схемы. Без него проверить микрофон нельзя вовсе — не слышно,
  // дошёл ли сигнал до ядра, или разрешение не дали, или он просто молчит.
  const mk=clamp(report.mik||0,0,1), vz=report.vozvrat||0;
  // ROOM — сколько из вышедшего комната вернула в микрофон. Показываем его
  // только когда сигнал ПРАВДА идёт: при молчащем входе это число ни о чём,
  // а строку удлиняет.
  const idet = mk>.002;
  // ЧТО ВОТКНУТО В ГНЕЗДО — выбирается мышью, прямо в строке показания.
  // Клавиши на это нет и не будет: свободных не осталось, а главное — выбор
  // источника это настройка, а не игра. Браузер всё равно потребует жеста и
  // покажет свой список, так что рука в этот миг уже на мыши.
  // Каждый вход горит сам по себе: можно оба разом. Клавиши подписаны рядом,
  // как у всего остального на панели.
  const ist=(k,imya,kl)=>`<span class="${VHODY[k]?'s4':'s1'}">${imya}</span>`+
                         `<span class="s1"> ${kl}</span>`;
  stroki.push(chelo('INPUT','',zg)+shkalaMesto(mk,shk,2)+
    `<span class="s3"> ${idet?'идёт':(VHODY.mik||VHODY.sist)?'тихо':'нет'}</span>  `+
    ist('mik','мик','\u2325m')+`<span class="s1"> · </span>`+
    ist('sist','система','\u2325\u21e7m'));
  stroki.push('');

  for(const [z,g] of GRUPPY){
    const zn=ZONY[z];
    for(const r of KNOBS) if((r.zona||'shema')===z && r.gr===g) stroki.push(ruchka(r,zn));
    for(const t of SWITCHES) if((t.zona||'shema')===z && t.gr===g)
      // ROOM — сколько из вышедшего комната вернула в микрофон. Стоял он у
      // INPUT и удлинял строку вдвое, а место ему тут: без петли это число
      // ни о чём, по нему ядро само считает усиление круга.
      stroki.push(tumbler(t,zn)+
        (t.k==='petlya'&&switches.petlya ? `  <span class="s1">ROOM ${vz.toFixed(2)}</span>` : ''));
    stroki.push('');
  }

  // Строка текста показывается всегда: без неё непонятно, что скажется.
  // Длинную строку показываем ХВОСТОМ — так же, как всякое поле ввода: тем,
  // что человек только что набрал, а не тем, с чего начал.
  const mesto=SHIR_PANELI-POLE_IMENI-POLE_KLAV-18;
  const hvost=s=>s.length>mesto ? '…'+s.slice(-(mesto-1)) : s;
  stroki.push(chelo('TEXT','',zg)+(stroka.aktivna
    ? `<span class="s4">${hvost(stroka.tekst)}▏</span>`+
      `  <span class="s1">enter · esc</span>`
    : `<span class="s3">${hvost(stroka.tekst)||'—'}</span>`+
      `  <span class="s1">enter — ввести</span>`));
  // Подпись сборки. Пока номиналы едут, играет ещё ПРЕЖНИЙ прибор — значит
  // и подписан экран должен быть им, а новый показан как то, куда едем.
  const bd=report.budet;
  stroki.push(`<span class="z1">${vpole('BUILD',POLE_IMENI)}${vpole('',POLE_KLAV)}`+
              `${sb.imya||'····'} ${(sb.semya!==undefined?sb.semya:seed)>>>0}</span>`+
    (bd ? ` <span class="z3">→ ${bd.imya} ${bd.semya>>>0}</span>`+
          ` <span class="z2">${Math.round((report.perehod||0)*100)}%</span>`
        : sb.dinamik ? `<span class="z1"> · ${Math.round(sb.dinamik)}Гц`+
                       ` · ${(sb.emkost*1e9).toFixed(1)}нФ</span>` : ''));
  // Число пресетов живёт при сборке, а не в легенде внизу: это состояние
  // прибора, а не подсказка по клавишам.
  //
  // СОХРАНЕНИЕ И УДАЛЕНИЕ НА СОЧЕТАНИЯХ. Мышь эту работу не взяла: тыкать
  // курсором в строку текста оказалось неудобно, а ради двух действий держать
  // на панели место под курсор — плата не по товару. Ctrl не даст нажать
  // ненароком, а удалённое всё равно уезжает в корзину.
  const skolko = presets.length ? `${presets.length} пресетов` : 'пресетов нет';
  stroki.push(
    `<span class="z1">${vpole('',POLE_IMENI)}${vpole('',POLE_KLAV)}${skolko}</span>`+
    `  <span class="z2">\u2325\u2191 сохранить</span>`+
    (tekuschiy>=0 ? `  <span class="k3">\u2325\u2193 удалить</span>` : ''));
  return stroki.map(dobey).join('\n');
}

// ---- ПОЛЕ ПАНЕЛИ -----------------------------------------------------------
// Тот же движок, что у фигуры, и та же мера света. Отличается ровно первая
// стадия — чем поле возбуждается: у фигуры траекторией звука, у шкалы
// значением ручки.
let PPOLE=[], PEKRAN=null, PSH=0, PV=0;
function pperesoberi(sh, v){
  const el=$('#ppole'); if(!el) return;
  PSH=sh; PV=v; PPOLE=[];
  for(let c=0;c<CVETOV;c++) PPOLE.push(new Float32Array(sh*v));
  // НИЖНЯЯ СТУПЕНЬ АКЦЕНТА У ПАНЕЛИ НУЛЕВАЯ. У картины она третья: там тёмный
  // красный на тонком знаке читается бурым, и слабое вмешательство просто не
  // помечается. На панели зона красная целиком — это решение хозяина, — и
  // хвост шкалы держит цвет до самого низа.
  PEKRAN = PEKRAN ? (PEKRAN.peresoberi(sh,v), PEKRAN)
                  : new Ekran(el, sh, v, 0, KLASS_PANELI);
}

// ПОДАЧА ЗАДАЁТСЯ В ЕДИНИЦАХ ПОРОГОВ, А НЕ В АБСОЛЮТНЫХ.
//
// Пороги ступеней плавают вместе с фигурой — они и есть доли от её горящих
// знакомест. Абсолютный свет шкалы то слепил бы, то пропадал вслед за ней. А
// подача в долях порога попадает на нужную ступень при любом их положении:
// шкала видна всегда, и связывает её с фигурой не яркость, а общая мера.
// Заодно отпадает надобность в упоре снизу, которым я собирался это лечить.
//
// Живые данные прибора колеблют подачу, и колебание видно СМЕНОЙ ЗНАКА — так
// же, как в фигуре: сегмент растёт и опадает. Длина горящей части при этом не
// дрожит никогда, иначе шкала начнёт врать про значение.
//
// ШКАЛА — КОМЕТА, А НЕ ПОЛКА.
//
// Устроена она была как «дорожка, тело, остриё»: две ровные полки и точка.
// Замер показал, чем это кончается:
//
//     раскладка по ступеням    t0    t1    t2    t3    t4
//     панель, зелёный         206     0     0    44     8
//     картина, зелёный         86    85   170   122   134
//
// Картина занимает все пять ступеней примерно поровну — отсюда её глубина.
// Панель жила на трёх, и две средние пустовали вовсе. Глубина берётся не из
// цвета и не из ореола, а из того, что заняты ВСЕ ступени: свет должен
// спадать, а не переключаться между двумя уровнями.
//
// Поэтому подача считается от острия назад: каждые SPAD знакомест — ступень
// вниз. Хвост упирается в первую ступень и ниже не идёт, дорожка лежит на
// нулевой: между телом и дорожкой всегда остаётся ступень зазора, иначе
// граница горящей части поплыла бы и шкала соврала бы про значение.
//
// У КРАСНОЙ И СИНЕЙ ШКАЛЫ ХВОСТ ЗЕЛЁНЫЙ — и это не уступка, а ровно то же
// правило, что в картине: слабый свет принадлежит прибору, цветом помечено
// только сильное. Правило «акцент не ниже третьей ступени» тут работает само
// и ничего не запирает; запирало оно, пока у шкалы не было спада — плоской
// шкале и правда некуда разложиться, кроме как в две ступени.
const SPAD=3, NIZ_HVOSTA=1;
// Свет по непрерывной ступени: между соседними подошвами линейно, выше
// верхней — с запасом.
function poStupeni(T, L){
  if(T>=4) return L[4]*(1+.5*(T-4));
  const t=T|0;
  return L[t]+(L[t+1]-L[t])*(T-t);
}
function ppole(){
  if(!PEKRAN || !GRANI[0]) return;
  // Подошвы ступеней по возрастанию; нулевая — та же граница отрисовки, что
  // и у фигуры.
  const L0=Math.max(POROG_GOR,GRANI[4]);
  const L=[L0,GRANI[3],GRANI[2],GRANI[1],GRANI[0]];
  const gdor=(GRANI[3]+L0)*.5;
  const u=clamp(report.swing??.5,0,1);
  const shina=clamp(report.shina??1,0,1);
  // Дыхание считается В СТУПЕНЯХ, а не в разах: качели ведут весь спад на
  // полступени вверх-вниз, просадка шины подсаживает его целиком.
  const dyh=(u-.5)*.7-(1-shina)*1.4;
  for(let c=0;c<CVETOV;c++) PPOLE[c].fill(0);
  for(const s of SHKALY){
    if(s.x===undefined || s.y>=PV) continue;
    const p=PPOLE[s.zona], baz=s.y*PSH+s.x;
    for(let i=0;i<s.sh;i++){
      const j=baz+i;
      if(j<0||j>=p.length) continue;
      // Погасшая часть — дорожка, и она ЦВЕТОМ СВОЕЙ ЗОНЫ. Зелёной она была,
      // пока панель жила по правилу картины; на панели зона красная целиком.
      if(i>=s.n){ p[j]=gdor; continue; }
      // Остриё держит верхнюю ступень всегда: им отмечено значение, и мигать
      // ему нельзя. Дышит и дрожит хвост — сменой знака, а не длиной.
      const d=s.n-1-i;
      let T=4.4;
      if(d){
        // Дрожь идёт ВОЛНОЙ вдоль шкалы. Шаг фазы на знакоместо был 1.9 рад:
        // соседние оказывались почти в противофазе, и спад рассыпался в рябь
        // 2-3-2-3-4 — рядом стоящие знаки прыгали через ступень. При 0.55 рад
        // волна укладывается в длину шкалы примерно за период, и ряд читается
        // ровно: 1-1-1-2-2-2-3-3-4.
        T=4-d/SPAD+dyh+Math.sin(i*.55+s.y*2.7+ugol*9)*.42;
        T=T>4?4:T<NIZ_HVOSTA?NIZ_HVOSTA:T;
      }
      p[j]=poStupeni(T,L);
    }
  }
  PEKRAN.risuy(PPOLE, GRANI);
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
  // Клавиша без подписи примыкает к предыдущей: ↑ и ↓ делают одно дело в две
  // стороны, и «↑ листать · ↓ листать» было бы враньём про два разных дела.
  const kom=[];
  for(const k of KOMANDY){
    const kl=`${k.ctrl?'\u2303':''}${k.alt?'\u2325':''}${k.shift?'\u21e7':''}${klavisha(k.kl)}`;
    if(!k.imya && kom.length) kom[kom.length-1]=kom[kom.length-1].replace(' ', ' '+kl+' ');
    else kom.push(`${kl} ${k.imya}`);
  }
  kom.push('1\u20130 - = площадки', '\u2423 ладонь', '\u2318 втрое', '\u21e7 вдесятеро');
  // ЦВЕТ ОБЪЯСНЯЕТ СЕБЯ САМ. Строка «красное — работа поста, синее — голос»
  // стояла тут потому, что зон не было; теперь зелёные, синие и красные
  // ручки лежат отдельными блоками, и подпись под картиной повторяет то,
  // что и так видно сверху.
  return `<span class="z1">${kom.join(' \u00b7 ')}</span>`;
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
  // Заголовка нет. Про выключенное питание говорит сама панель: POWER стоит
  // первой строкой, и погашенная лампочка на ней видна раньше любой подписи.
  if(bylaShapka!==1){ bylaShapka=1; $('#head').innerHTML=''; }

  // КАРТИНА ПЕРЕРИСОВЫВАЕТСЯ НА ОТЧЁТ, а не на кадр экрана. Прибор
  // отчитывается тридцать раз в секунду — между отчётами рисовать нечего,
  // те же данные легли бы дважды. Заодно уходит расхождение на экранах со
  // 120 Гц: там след гас вдвое быстрее просто потому, что кадров больше.
  const n = window.dbg.otchetov|0;
  // Картина пишет себя в слои сама: разметку ей больше не отдают.
  if(n!==bylOtchet){ bylOtchet=n; kartina(); }

  const r = ruchki();
  // Координаты шкал снимаются с готовой разметки; поле под них
  // пересобирается, только если изменился его размер.
  const raz = najdiShkaly(r);
  if(raz.shirina!==PSH || raz.vysota!==PV) pperesoberi(raz.shirina, raz.vysota);
  // Служебный знак в текстовом слое становится пробелом: место занято, а
  // рисует шкалу поле снизу.
  if(r!==byliRuchki){ byliRuchki=r; $('#knobs').innerHTML=r.split(MET).join(' '); }
  ppole();
  // Панель сама задаёт, сколько места осталось картине: стоя — своей
  // высотой, лёжа — своей шириной. Пока панель не нарисована, брать эти
  // числа неоткуда, а меняться они могут и потом — от числа колонок, от
  // длинной подписи. Меряем заново, когда её коробка правда стала другой.
  const p=$('#panel'), ko=p.offsetWidth+'×'+p.offsetHeight;
  if(ko!==bylaKorobka){ bylaKorobka=ko; pomer(); }
  // Число пресетов ушло отсюда в панель, под сборку: это состояние прибора,
  // а не подсказка по клавишам.
  const l = legenda()+
    (vest && performance.now()<vestdo ? `\n<span class="z4">${vest}</span>` : '');
  if(l!==bylaStroka){ bylaStroka=l; $('#line').innerHTML=l; }
}
pomer();
kadr();
