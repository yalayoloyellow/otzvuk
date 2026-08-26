// СВОД — ПРОВЕРКА САМОГО СЧЁТА, а не звука.
//
// Все прежние стенды мерили, ЧТО прибор делает. Этот проверяет, ПРАВИЛЬНО ЛИ
// он это считает. Разница принципиальная: замер звука не отличает физику от
// ошибки в арифметике — и то и другое звучит.
//
// Три проверки, и каждая ловит свой класс ошибок.
//
//   1. СВЕРКА С ФОРМУЛОЙ. Там, где у задачи есть решение на бумаге, ответ
//      программы обязан с ним совпасть. Одинокая RC заряжается ровно по
//      экспоненте; одинокий генератор идёт ровно с периодом
//      τ·ln[(Ve−Vн)/(Ve−Vв)] + τ·ln[(Vв−Ve′)/(Vн−Ve′)]. Это ловит ошибки в
//      решателе — те самые, которых на слух не слышно.
//
//   2. БАЛАНС ТОКА ПИТАНИЯ. Сколько тока прибор берёт из батареи — величина,
//      которую можно посчитать ДВАЖДЫ, независимо: по ветвям и по тому, что
//      сообщено батарее. Расхождение — ошибка учёта.
//
//   3. СХОДИМОСТЬ ПО ШАГУ. Всё, что меняется при уменьшении шага счёта, —
//      не физика, а погрешность интегрирования.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000; let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}}; } };
const ИСХ = readFileSync('./chaos.worklet.js','utf8');
// Классы ядра наружу не выставлены — вытаскиваем их через хвост.
new Function(ИСХ + '\n;globalThis.ЯДРО={Cell,Build,Noise,Speaker,Battery,Opto,Device};')();
const {Cell, Build, Noise, Speaker, Device} = globalThis.ЯДРО;

const ТИХО = { teplovoy(){ return 0; }, flikker(){ return 0; } };
const дт = 1/(48000*4);

console.log('1. СВЕРКА С ФОРМУЛОЙ — одинокий генератор');
console.log('   сборка      период счётом   период формулой   ошибка');
for (const semya of [1626943591, 139297718, 3016926094, 770901]){
  const sb = new Build(semya);
  const vt = sb.vt[0];
  const c = new Cell(sb, sb.C[0], vt, ТИХО);
  // Все ветви фиксированы: ни оптопары, ни соседей, ни температуры.
  const Ros = 6e5, Ru = 1e12, Rsv = 1e12, Vdd = sb.EMF, Vupr = Vdd;
  // То же, что считает решатель, но на бумаге.
  const Rf = Ros + sb.Rvyh;
  const Gh = 1/Rf + 1/Ru + sb.Gut + 1/Rsv;
  const Veh = (Vdd/Rf + Vupr/Ru) / Gh;         // выход вверху
  const Vel = (0/Rf   + Vupr/Ru) / Gh;         // выход внизу
  const τ = sb.C[0] / Gh;
  // Пороги при полном питании: живость равна единице, петля не схлопнута.
  const Vв = Vdd * vt.vverh, Vн = Vdd * vt.vniz;
  const t1 = τ * Math.log((Veh - Vн)/(Veh - Vв));    // заряд снизу вверх
  const t2 = τ * Math.log((Vв - Vel)/(Vн - Vel));    // разряд сверху вниз
  const формула = t1 + t2;
  // Тот же генератор, но посчитанный решателем.
  let периодов = 0, сумма = 0, было = null;
  for (let n = 0; n < 48000*4*3; n++){
    const q0 = c.q;
    c.step(Ros, Vupr, Ru, 0, 0, Rsv, Vdd, 0, 0, 0);
    if (!q0 && c.q){                           // фронт вверх — начало периода
      const t = n * дт;
      if (было !== null && периодов < 200){ сумма += t - было; периодов++; }
      было = t;
    }
  }
  const счётом = периодов ? сумма/периодов : NaN;
  const ош = (счётом/формула - 1)*100;
  console.log('   '+String(semya).padStart(10)+'   '+(счётом*1e3).toFixed(4).padStart(9)+' мс   '
    +(формула*1e3).toFixed(4).padStart(9)+' мс   '+(ош>=0?'+':'')+ош.toFixed(3)+' %');
}

console.log('\n2. СВЕРКА С ФОРМУЛОЙ — заряд одинокой RC (переключение запрещено)');
{
  const sb = new Build(1626943591);
  const c = new Cell(sb, sb.C[0], {vverh: 9.9, vniz: -9.9}, ТИХО);   // пороги недостижимы
  const Ros = 4e5, Ru = 1e12, Rsv = 1e12, Vdd = sb.EMF;
  const Rf = Ros + sb.Rvyh, G = 1/Rf + 1/Ru + sb.Gut + 1/Rsv;
  const Ve = (Vdd/Rf + Vdd/Ru)/G, τ = sb.C[0]/G;
  c.V = 0; c.q = 1;
  const шагов = Math.round(τ/дт);
  for (let n = 0; n < шагов; n++) c.step(Ros, Vdd, Ru, 0, 0, Rsv, Vdd, 0, 0, 0);
  const ждём = Ve * (1 - Math.exp(-1));
  console.log('   через одну τ: счётом '+c.V.toFixed(6)+' В, формулой '+ждём.toFixed(6)
    +' В, ошибка '+((c.V/ждём-1)*100).toFixed(4)+' %');
}

console.log('\n3. БАЛАНС ТОКА ПИТАНИЯ — ЛОГИКА ОТДЕЛЬНО ОТ КАПСЮЛЯ');
console.log('   Капсюль жрёт десятки миллиампер, логика — микроамперы. Складывать');
console.log('   их в одну сверку нельзя: расхождение логики тонет целиком.');
{
  const БАЗА = {volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
                drift:0,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,
                petlya:0,kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0};
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:1626943591}});
  c.port.onmessage({data:{t:'p', v:БАЗА}});
  const n=128, L=new Float32Array(n), R=new Float32Array(n);
  let лог=0, вет=0, обр=0, упр=0, скв=0, дин=0, шт=0;
  const наст = c.pr.bat.step.bind(c.pr.bat);
  c.pr.bat.step = function(I, ...ост){
    const pr = c.pr, sb = pr.sb, Vdd = pr.Vpit;
    лог += I - (pr.tokdin || 0);
    дин += (pr.tokdin || 0);
    for (let i = 0; i < 3; i++){
      const u = pr.cells[i];
      // Ветвь обратной связи тянет из шины ТОЛЬКО когда выход вверху: внизу
      // тот же резистор сливает заряд в общий провод, а не берёт из батареи.
      const o = u.q ? (Vdd - u.V) / (pr.Rzar[i] + sb.Rvyh) : 0;
      // Ветвь ограничения разряда висит на Vупр, а Vупр это шина.
      const y = (Vdd * (1 + (c.utechka || 0) * .1) - u.V) / (pr.Rzar[i] * Math.max(pr.ki, u.kmin));
      const s2 = u.schelchok ? 2.2e-3 * 8e-8 * 48000 * 4 : 0;
      обр += o; упр += y; скв += s2; вет += o + y + s2;
    }
    шт++;
    return наст(I, ...ост);
  };
  for (let b = 0; b < Math.round(48000*2/n); b++) c.process([[]],[[L,R]]);
  const мк = v => (v/шт*1e6).toFixed(2).padStart(8);
  console.log('   сообщено батарее логикой: '+мк(лог)+' мкА');
  console.log('   сумма по ветвям:          '+мк(вет)+' мкА');
  console.log('     из них обратная связь:  '+мк(обр)+' мкА');
  console.log('     ветвь ограничения:      '+мк(упр)+' мкА');
  console.log('     сквозной бросок:        '+мк(скв)+' мкА');
  console.log('   расхождение: '+((вет-лог)/лог*100).toFixed(1)+' %');
  console.log('   для сравнения, капсюль:   '+(дин/шт*1e3).toFixed(2)+' мА  ('
    +(дин/лог).toFixed(0)+'× больше логики)');
}

console.log('\n4. СХОДИМОСТЬ ПО ШАГУ — что изменится, если считать вдвое чаще');
{
  const БАЗА = {volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
                drift:0,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,
                petlya:0,kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0};
  const прогон = (over) => {
    let K2 = null;
    globalThis.registerProcessor = (n,k) => K2 = k;
    new Function(ИСХ.replace('const OVER = 4;', 'const OVER = '+over+';'))();
    const c = new K2();
    c.port.onmessage({data:{t:'seed', v:1626943591}});
    c.port.onmessage({data:{t:'p', v:БАЗА}});
    const n=128, L=new Float32Array(n), R=new Float32Array(n);
    let kv=0,k=0, f=0, fn=0, упор=0, шагов=0;
    for (let b=0;b<Math.round(48000*3/n);b++){
      c.process([[]],[[L,R]]);
      if (b < Math.round(48000/n)) continue;
      for (let i=0;i<n;i++){ kv+=L[i]*L[i]; k++; }
      for (const u of c.pr.cells) if (u.f>0 && u.f<20000){ f+=u.f; fn++; }
    }
    return {скз: Math.sqrt(kv/k), f: fn? f/fn : 0};
  };
  const a = прогон(4), b = прогон(8), d = прогон(16);
  console.log('   OVER=4:  скз '+a.скз.toFixed(6)+'  средняя частота ячеек '+a.f.toFixed(2)+' Гц');
  console.log('   OVER=8:  скз '+b.скз.toFixed(6)+'  средняя частота ячеек '+b.f.toFixed(2)+' Гц');
  console.log('   OVER=16: скз '+d.скз.toFixed(6)+'  средняя частота ячеек '+d.f.toFixed(2)+' Гц');
  console.log('   ход частоты 4→8: '+((b.f/a.f-1)*100).toFixed(2)+' %,  8→16: '
    +((d.f/b.f-1)*100).toFixed(2)+' %');
}
