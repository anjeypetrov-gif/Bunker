// Страница админки. Данные подтягиваются с /api/admin/report и /api/admin/live (нужен тот же ?token=...).
// Графики рисуются на чистом SVG, без внешних библиотек и CDN.
export const adminPageHtml = (): string => String.raw`<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Бункер — админка</title>
<style>
:root{--bg:#0b0e14;--panel:#111827;--line:#263244;--tx:#e2e8f0;--mut:#94a3b8;--am:#fbbf24;--bl:#38bdf8;--gr:#34d399;--rd:#f87171;--vi:#a78bfa}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--tx)}
.wrap{max-width:1180px;margin:0 auto;padding:16px}
h1{margin:0;font-size:22px;color:var(--am);letter-spacing:.04em;text-transform:uppercase}
h2{margin:0 0 10px;font-size:13px;color:var(--am);letter-spacing:.08em;text-transform:uppercase}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:12px}
.live{display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--mut)}
.live b{color:var(--tx)}
.pill{background:var(--panel);border:1px solid var(--line);padding:4px 10px;border-radius:999px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gr);margin-right:6px;box-shadow:0 0 8px var(--gr)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);padding:10px;margin-bottom:14px}
.bar button,.bar select,.bar input{background:#0b1220;color:var(--tx);border:1px solid var(--line);padding:6px 10px;font:inherit;border-radius:4px}
.bar button{cursor:pointer}
.bar button.on{background:var(--am);color:#111;border-color:var(--am);font-weight:600}
.bar label{color:var(--mut);display:flex;gap:6px;align-items:center}
.sp{flex:1}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:var(--panel);border:1px solid var(--line);padding:10px 12px}
.kpi .l{color:var(--mut);font-size:12px}
.kpi .v{font-size:24px;font-weight:700;margin:2px 0}
.kpi .d{font-size:12px;color:var(--mut)}
.up{color:var(--gr)}.dn{color:var(--rd)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:14px}
.card{background:var(--panel);border:1px solid var(--line);padding:12px;min-width:0}
.card.wide{grid-column:1/-1}
svg{display:block;width:100%;height:auto}
.leg{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 0;font-size:12px;color:var(--mut)}
.leg i{display:inline-block;width:10px;height:10px;margin-right:5px;border-radius:2px}
.row{display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:8px;align-items:center;margin:4px 0;font-size:13px}
.row .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .t{background:#0b1220;height:10px;border-radius:2px;overflow:hidden}
.row .t>div{height:100%;background:var(--am)}
.row .c{color:var(--mut);font-variant-numeric:tabular-nums;min-width:62px;text-align:right}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left}
th{color:var(--mut);font-weight:500}
.mut{color:var(--mut)}
pre{background:#0b1220;padding:8px;overflow:auto;white-space:pre-wrap;margin:6px 0;font-size:12px;border-left:3px solid var(--rd)}
#tip{position:fixed;pointer-events:none;background:#020617;border:1px solid var(--line);padding:6px 9px;font-size:12px;display:none;z-index:9;white-space:nowrap}
.empty{color:var(--mut);padding:18px 0;text-align:center}
.tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.tabs button{background:var(--panel);color:var(--mut);border:1px solid var(--line);padding:8px 14px;font:inherit;cursor:pointer;border-radius:4px}
.tabs button.on{background:var(--am);color:#111;border-color:var(--am);font-weight:700}
.alpha{font-size:10px;color:var(--vi);margin-left:4px}
.note{background:#1c1917;border:1px solid #78350f;color:#fcd34d;padding:8px 12px;margin-bottom:14px;font-size:13px;display:none}
</style></head><body><div class="wrap">
<div class="top">
  <h1>Бункер · статистика</h1>
  <div class="live" id="live"></div>
</div>
<div class="note" id="note"></div>
<div class="bar">
  <span id="presets"></span>
  <label>с <input type="date" id="dFrom"></label>
  <label>по <input type="date" id="dTo"></label>
  <label>шаг <select id="bucket">
    <option value="auto">авто</option><option value="hour">часы</option><option value="day">дни</option>
    <option value="week">недели</option><option value="month">месяцы</option></select></label>
  <span class="sp"></span>
  <label><input type="checkbox" id="auto" checked> обновлять</label>
  <button id="csv">CSV</button>
</div>
<div class="tabs" id="tabs"></div>
<div id="tabMode" style="display:none"><div class="kpis" id="mKpis"></div><div class="grid" id="mGrid"></div></div>
<div id="tabAll"><div class="kpis" id="kpis"></div>
<div class="grid">
  <div class="card wide"><h2>Посетители</h2><div id="chVisits"></div></div>
  <div class="card wide"><h2>Игровая активность</h2><div id="chGames"></div></div>
  <div class="card"><h2>Воронка</h2><div id="funnel"></div></div>
  <div class="card"><h2>Когда заходят (час суток)</h2><div id="chHour"></div></div>
  <div class="card"><h2>День недели</h2><div id="chWeek"></div></div>
  <div class="card"><h2>Страны</h2><div id="countries"></div></div>
  <div class="card"><h2>Города</h2><div id="cities"></div></div>
  <div class="card"><h2>Устройства</h2><div id="devices"></div></div>
  <div class="card"><h2>Браузеры</h2><div id="browsers"></div></div>
  <div class="card"><h2>Операционные системы</h2><div id="oses"></div></div>
  <div class="card"><h2>Языки</h2><div id="langs"></div></div>
  <div class="card"><h2>Откуда пришли</h2><div id="refs"></div></div>
  <div class="card"><h2>Размер партий (игроков)</h2><div id="hist"></div></div>
  <div class="card"><h2>Катастрофы</h2><div id="cats"></div></div>
  <div class="card"><h2>Бункеры</h2><div id="shelters"></div></div>
  <div class="card wide"><h2>Комнаты сейчас</h2><div id="rooms"></div></div>
  <div class="card wide"><h2>Последние ошибки клиентов</h2><div id="errs"></div></div>
</div></div>
<p class="mut" id="foot"></p>
</div><div id="tip"></div>
<script>
(function(){
var TOKEN = new URLSearchParams(location.search).get('token') || '';
var TZ = -new Date().getTimezoneOffset();
var DAY = 86400000;
var C = {am:'#fbbf24',bl:'#38bdf8',gr:'#34d399',rd:'#f87171',vi:'#a78bfa'};
var $ = function(id){ return document.getElementById(id); };
var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
var fmt = function(n){ return Number(n||0).toLocaleString('ru-RU'); };
var fmt1 = function(n){ return Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:1}); };
var pad = function(n){ return (n<10?'0':'')+n; };
var state = { preset:'7d', from:0, to:0, last:null, tab:'all', modes:null };
var TABS = [['all','Общее'],['classic','Классический'],['chronicle','Хроника бункера'],['3d','Бункер 3D']];

// ---------- период ----------
function dayStart(t){ var d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
var PRESETS = [['today','Сегодня'],['yest','Вчера'],['7d','7 дней'],['30d','30 дней'],['90d','90 дней'],['all','Всё время']];
function applyPreset(p){
  var now = Date.now(), t0 = dayStart(now);
  state.preset = p;
  if(p==='today'){ state.from=t0; state.to=now; }
  else if(p==='yest'){ state.from=t0-DAY; state.to=t0-1; }
  else if(p==='7d'){ state.from=t0-6*DAY; state.to=now; }
  else if(p==='30d'){ state.from=t0-29*DAY; state.to=now; }
  else if(p==='90d'){ state.from=t0-89*DAY; state.to=now; }
  else { state.from=1; state.to=now; }
  syncInputs();
}
function inputDate(t){ var d=new Date(t); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function syncInputs(){
  $('dFrom').value = state.from>1 ? inputDate(state.from) : '';
  $('dTo').value = inputDate(state.to);
  var h=''; PRESETS.forEach(function(x){ h+='<button data-p="'+x[0]+'" class="'+(state.preset===x[0]?'on':'')+'">'+x[1]+'</button> '; });
  $('presets').innerHTML = h;
}
$('presets').addEventListener('click',function(e){ var p=e.target.getAttribute&&e.target.getAttribute('data-p'); if(p){ applyPreset(p); load(); } });
function onDates(){
  var f=$('dFrom').value, t=$('dTo').value;
  if(f) state.from = new Date(f+'T00:00:00').getTime();
  if(t){ var e=new Date(t+'T23:59:59.999').getTime(); state.to=Math.min(e,Date.now()); }
  state.preset='custom'; syncInputs(); load();
}
$('dFrom').addEventListener('change',onDates);
$('dTo').addEventListener('change',onDates);
$('bucket').addEventListener('change',load);

// ---------- запросы ----------
function api(path){
  return fetch(path+(path.indexOf('?')>-1?'&':'?')+'token='+encodeURIComponent(TOKEN),{headers:{'x-admin-token':TOKEN}})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); });
}
function drawTabs(){
  $('tabs').innerHTML = TABS.map(function(x){ return '<button data-t="'+x[0]+'" class="'+(state.tab===x[0]?'on':'')+'">'+x[1]+(x[0]==='chronicle'||x[0]==='3d'?'<span class="alpha">альфа</span>':'')+'</button>'; }).join('');
  $('tabAll').style.display = state.tab==='all' ? '' : 'none';
  $('tabMode').style.display = state.tab==='all' ? 'none' : '';
}
$('tabs').addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('button'); var t=b&&b.getAttribute('data-t'); if(t){ state.tab=t; drawTabs(); if(state.modes) renderMode(); load(); } });
function load(){
  var q='/api/admin/report?from='+state.from+'&to='+state.to+'&bucket='+$('bucket').value+'&tz='+TZ;
  var qm='/api/admin/modes?from='+state.from+'&to='+state.to+'&bucket='+$('bucket').value+'&tz='+TZ;
  Promise.all([api(q),api('/api/admin/live'),api(qm)]).then(function(r){ state.last=r[0]; state.modes=r[2]; render(r[0],r[1]); renderMode(); $('note').style.display = r[0].eventsTotal===0 ? 'block':'none'; })
    .catch(function(e){ $('note').style.display='block'; $('note').textContent='Не удалось загрузить данные: '+e.message; });
}

// ---------- отрисовка ----------
function delta(cur,prev,inv){
  if(!prev && !cur) return '<span class="d">—</span>';
  if(!prev) return '<span class="d">новое</span>';
  var p=(cur-prev)/prev*100; if(!isFinite(p)) return '';
  var good = inv ? p<=0 : p>=0;
  return '<span class="d '+(good?'up':'dn')+'">'+(p>=0?'▲ +':'▼ ')+fmt1(p)+'% к пред. периоду</span>';
}
function kpi(l,v,cur,prev,inv,sub){
  return '<div class="kpi"><div class="l">'+l+'</div><div class="v">'+v+'</div>'+(cur===null?'':delta(cur,prev,inv))+(sub?'<div class="d">'+sub+'</div>':'')+'</div>';
}
function label(t,b){
  var d=new Date(t);
  if(b==='hour') return pad(d.getDate())+'.'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':00';
  if(b==='month') return pad(d.getMonth()+1)+'.'+d.getFullYear();
  if(b==='week') return 'нед. '+pad(d.getDate())+'.'+pad(d.getMonth()+1);
  return pad(d.getDate())+'.'+pad(d.getMonth()+1);
}
function render(r,live){
  var t=r.totals, p=r.prev;
  $('note').style.display = r.eventsTotal===0 ? 'block' : 'none';
  if(r.eventsTotal===0) $('note').textContent='Событий пока нет: подробный сбор начинается после обновления и накапливается с этого момента.';
  $('live').innerHTML = '<span class="pill"><span class="dot"></span>онлайн: <b>'+live.online+'</b></span>'+
    '<span class="pill">комнат: <b>'+live.rooms.length+'</b></span><span class="pill">пик: <b>'+live.peak+'</b></span>';
  var ret = t.uniques ? Math.round(100*t.returning/t.uniques) : 0;
  $('kpis').innerHTML =
    kpi('Заходы',fmt(t.visits),t.visits,p.visits)+
    kpi('Уникальные',fmt(t.uniques),t.uniques,p.uniques,false,'новых '+fmt(t.newVisitors)+' · вернулись '+fmt(t.returning)+' ('+ret+'%)')+
    kpi('Созданы комнаты',fmt(t.rooms),t.rooms,p.rooms,false,'входов по коду: '+fmt(t.joins))+
    kpi('Игр начато',fmt(t.starts),t.starts,p.starts)+
    kpi('Игр завершено',fmt(t.overs),t.overs,p.overs,false,'доходят до конца: '+fmt1(t.completionPct)+'%')+
    kpi('Провальные партии',t.overs?fmt1(t.failedPct)+'%':'—',t.overs?t.failedPct:null,p.failedPct,true,'шанс выживания <40% · всего '+fmt(t.failedGames)+' · средний шанс '+(t.overs?Math.round(t.avgSurvival)+'%':'—'))+
    kpi('Игроков в партии',fmt1(t.avgPlayers),t.avgPlayers,p.avgPlayers,false,'ботов в среднем: '+fmt1(t.avgBots))+
    kpi('Партии с ботами',fmt1(t.withBotsPct)+'%',null)+
    kpi('Длительность партии',fmt1(t.avgDurationMin)+' мин',t.avgDurationMin,p.avgDurationMin,false,'раундов: '+fmt1(t.avgRounds))+
    kpi('Ошибки клиентов',fmt(t.errors),t.errors,p.errors,true)+
    kpi('Сбой видеосвязи',t.rtcTotal?fmt1(t.rtcFailPct)+'%':'—',t.rtcTotal?t.rtcFailPct:null,p.rtcFailPct,true,'попыток: '+fmt(t.rtcTotal));
  var labels = r.series.map(function(s){ return label(s.t,r.bucket); });
  lineChart($('chVisits'),labels,[
    {name:'Заходы',color:C.am,data:r.series.map(function(s){return s.visits;})},
    {name:'Уникальные',color:C.bl,data:r.series.map(function(s){return s.uniques;})}]);
  barChart($('chGames'),labels,[
    {name:'Комнаты',color:C.vi,data:r.series.map(function(s){return s.rooms;})},
    {name:'Игры начаты',color:C.am,data:r.series.map(function(s){return s.starts;})},
    {name:'Игры завершены',color:C.gr,data:r.series.map(function(s){return s.overs;})},
    {name:'Ошибки',color:C.rd,data:r.series.map(function(s){return s.errors;})}]);
  funnel(t);
  barChart($('chHour'),r.byHour.map(function(_,i){return pad(i);}),[{name:'Заходы',color:C.am,data:r.byHour}],true);
  barChart($('chWeek'),['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],[{name:'Заходы',color:C.bl,data:r.byWeekday}],true);
  list($('countries'),r.countries); list($('cities'),r.cities);
  list($('devices'),r.devices.map(function(x){return {name:({mobile:'Телефон',tablet:'Планшет',desktop:'Компьютер'})[x.name]||x.name,n:x.n};}));
  list($('browsers'),r.browsers); list($('oses'),r.oses); list($('langs'),r.langs); list($('refs'),r.referrers);
  var hist=Object.keys(r.playersHist).map(function(k){return {name:k+' игр.',n:r.playersHist[k],k:+k};}).sort(function(a,b){return a.k-b.k;});
  list($('hist'),hist); list($('cats'),r.catastrophes); list($('shelters'),r.shelters);
  var rooms = live.rooms;
  $('rooms').innerHTML = rooms.length ? '<table><tr><th>Код</th><th>Фаза</th><th>Раунд</th><th>Людей</th><th>Ботов</th><th>Офлайн</th></tr>'+
    rooms.map(function(x){return '<tr><td>'+esc(x.code)+'</td><td>'+esc(x.phase)+'</td><td>'+x.round+'</td><td>'+x.humans+'</td><td>'+x.bots+'</td><td>'+x.offline+'</td></tr>';}).join('')+'</table>'
    : '<div class="empty">Активных комнат нет</div>';
  $('errs').innerHTML = live.errors.length ? live.errors.slice(0,15).map(function(e){
    return '<pre><b>'+esc(e.t)+'</b> '+esc(e.msg)+'\n'+esc(e.url||'')+'\n'+esc(e.ua||'')+(e.stack?'\n'+esc(e.stack):'')+'</pre>';}).join('')
    : '<div class="empty">Ошибок нет</div>';
  var since = r.firstEventAt ? new Date(r.firstEventAt).toLocaleString('ru-RU') : '—';
  $('foot').textContent = 'Детальные события накапливаются с '+since+' · всего событий: '+fmt(r.eventsTotal)+' · IP-адреса не сохраняются, определяется только страна и город.';
}
function dline(cur,prev,inv){ return delta(cur,prev,inv); }
function renderMode(){
  var tab=state.tab, M=state.modes; if(tab==='all'||!M) return;
  var m=M.modes[tab], t=m.totals, p=m.prev, k='';
  var ret = '';
  k += kpi('Заходы',fmt(t.visits),t.visits,p.visits);
  k += kpi('Уникальные',fmt(t.uniques),t.uniques,p.uniques);
  k += kpi('Игр начато',fmt(t.starts),t.starts,p.starts);
  k += kpi('Игр завершено',fmt(t.overs),t.overs,p.overs,false,'доходят до конца: '+fmt1(t.completionPct)+'%');
  if(tab==='classic'){
    k += kpi('Провальные партии',t.overs?fmt1(100-t.winPct)+'%':'—',t.overs?100-t.winPct:null,100-p.winPct,true,'средний шанс выживания '+(t.overs?Math.round(t.avgSurvival)+'%':'—'));
    k += kpi('Игроков в партии',fmt1(t.avgPlayers),t.avgPlayers,p.avgPlayers);
    k += kpi('Длительность',fmt1(t.avgDurationMin)+' мин',t.avgDurationMin,p.avgDurationMin,false,'раундов: '+fmt1(t.avgRounds));
  } else if(tab==='chronicle'){
    k += kpi('Выжили (успех)',t.overs?fmt1(t.winPct)+'%':'—',t.overs?t.winPct:null,p.winPct,false,'вердикт «выжили» или лучше');
    k += kpi('Доживает жителей',fmt1(t.avgSurvivors),t.avgSurvivors,p.avgSurvivors);
    k += kpi('Прошло дней',fmt1(t.avgRounds),t.avgRounds,p.avgRounds);
    k += kpi('Длительность',fmt1(t.avgDurationMin)+' мин',t.avgDurationMin,p.avgDurationMin);
  } else {
    k += kpi('Побед',t.overs?fmt1(t.winPct)+'%':'—',t.overs?t.winPct:null,p.winPct,false,'все шаги пройдены');
    k += kpi('Средние очки',fmt(Math.round(t.avgScore)),t.avgScore,p.avgScore);
    k += kpi('Аварий устранено',fmt1(t.avgSurvivors),t.avgSurvivors,p.avgSurvivors,false,'в среднем за партию');
    k += kpi('Длительность',fmt1(t.avgDurationMin)+' мин',t.avgDurationMin,p.avgDurationMin);
  }
  $('mKpis').innerHTML=k;
  var labels=m.series.map(function(s){return label(s.t,M.bucket);});
  var g='<div class="card wide"><h2>Заходы и игры</h2><div id="mChart"></div></div>';
  var lists=[];
  if(tab==='classic') lists=[['Катастрофы',m.catastrophes],['Бункеры',m.shelters],['Размер партий (игроков)',Object.keys(m.playersHist).map(function(x){return {name:x+' игр.',n:m.playersHist[x],k:+x};}).sort(function(a,b){return a.k-b.k;})]];
  else if(tab==='chronicle') lists=[['Темы бункера',m.themes],['Вердикты',m.verdicts],['Сколько дней длились партии',m.daysHist.map(function(x){return {name:'день '+x.name,n:x.n};})]];
  else lists=[['Бункеры',m.themes],['Профессии игроков',m.profs],['Итоги',m.results],['Победы по бункерам',m.themeWin]];
  lists.forEach(function(l,i){ g+='<div class="card"><h2>'+l[0]+'</h2><div id="mList'+i+'"></div></div>'; });
  if(tab==='chronicle') g+='<div class="card wide"><h2>События и выбор игроков</h2><div id="mEvents"></div></div>';
  $('mGrid').innerHTML=g;
  barChart($('mChart'),labels,[
    {name:'Заходы',color:C.bl,data:m.series.map(function(s){return s.visits;})},
    {name:'Игры начаты',color:C.am,data:m.series.map(function(s){return s.starts;})},
    {name:'Игры завершены',color:C.gr,data:m.series.map(function(s){return s.overs;})}]);
  lists.forEach(function(l,i){ list($('mList'+i),l[1]); });
  if(tab==='chronicle'){
    $('mEvents').innerHTML = m.events.length ? '<table><tr><th>Событие</th><th>Выпадало</th><th>Успех</th><th>Выбор вариантов (№ — раз)</th></tr>'+
      m.events.map(function(e){ return '<tr><td>'+esc(e.id)+'</td><td>'+e.n+'</td><td>'+e.okPct+'%</td><td class="mut">'+e.choices.map(function(c){return (c.i+1)+' — '+c.n;}).join(' · ')+'</td></tr>'; }).join('')+'</table>'
      : '<div class="empty">Пока нет данных: статистика копится после обновления</div>';
  }
  if(!t.starts && !t.visits) $('mGrid').insertAdjacentHTML('afterbegin','<div class="note" style="display:block;grid-column:1/-1">Данных по этому режиму пока нет: сбор начинается после обновления.</div>');
}
function funnel(t){
  var steps=[['Уникальные посетители',t.uniques],['Вошли в комнату',t.rooms+t.joins],['Начали игру',t.starts],['Доиграли до конца',t.overs]];
  var max=Math.max(1,steps[0][1],steps[1][1],steps[2][1],steps[3][1]);
  $('funnel').innerHTML = steps.map(function(s,i){
    var pc = i>0 && steps[i-1][1] ? ' · '+fmt1(100*s[1]/steps[i-1][1])+'%' : '';
    return '<div class="row"><div class="n">'+s[0]+'</div><div class="t"><div style="width:'+(100*s[1]/max)+'%"></div></div><div class="c">'+fmt(s[1])+pc+'</div></div>';
  }).join('') + '<div class="mut" style="font-size:12px;margin-top:6px">Шаги считаются по событиям, а не по людям: одна комната — несколько входов.</div>';
}
function list(el,items){
  if(!items||!items.length){ el.innerHTML='<div class="empty">Нет данных</div>'; return; }
  var tot=items.reduce(function(s,x){return s+x.n;},0)||1, max=Math.max.apply(null,items.map(function(x){return x.n;}))||1;
  el.innerHTML = items.map(function(x){
    return '<div class="row"><div class="n" title="'+esc(x.name)+'">'+esc(x.name)+'</div><div class="t"><div style="width:'+(100*x.n/max)+'%"></div></div><div class="c">'+fmt(x.n)+' · '+Math.round(100*x.n/tot)+'%</div></div>';
  }).join('');
}

// ---------- SVG-графики ----------
var W=1000,H=260,PL=44,PR=10,PT=10,PB=28;
function niceMax(m){ if(m<=4) return 4; var p=Math.pow(10,Math.floor(Math.log10(m))); var f=m/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; }
function frame(labels,max,hideLabels){
  var s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
  for(var i=0;i<=4;i++){
    var y=PT+(H-PT-PB)*i/4, v=max*(4-i)/4;
    s+='<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+y+'" y2="'+y+'" stroke="#263244" stroke-width="1"/>'+
       '<text x="'+(PL-6)+'" y="'+(y+4)+'" fill="#94a3b8" font-size="11" text-anchor="end">'+fmt(Math.round(v))+'</text>';
  }
  var n=labels.length, step=Math.max(1,Math.ceil(n/(hideLabels?24:12)));
  var iw=(W-PL-PR)/Math.max(1,n);
  for(var j=0;j<n;j+=step){
    s+='<text x="'+(PL+iw*(j+0.5))+'" y="'+(H-8)+'" fill="#94a3b8" font-size="11" text-anchor="middle">'+esc(labels[j])+'</text>';
  }
  return s;
}
function legend(series){ return '<div class="leg">'+series.map(function(s){return '<span><i style="background:'+s.color+'"></i>'+esc(s.name)+'</span>';}).join('')+'</div>'; }
function tipFor(el,labels,series,n){
  var svg=el.querySelector('svg'), tip=$('tip');
  svg.addEventListener('mousemove',function(ev){
    var rc=svg.getBoundingClientRect(), x=(ev.clientX-rc.left)/rc.width*W;
    var i=Math.floor((x-PL)/((W-PL-PR)/n)); if(i<0||i>=n){ tip.style.display='none'; return; }
    tip.innerHTML='<b>'+esc(labels[i])+'</b><br>'+series.map(function(s){return '<span style="color:'+s.color+'">●</span> '+esc(s.name)+': '+fmt(s.data[i]);}).join('<br>');
    tip.style.display='block'; tip.style.left=Math.min(window.innerWidth-170,ev.clientX+14)+'px'; tip.style.top=(ev.clientY+14)+'px';
  });
  svg.addEventListener('mouseleave',function(){ tip.style.display='none'; });
}
function lineChart(el,labels,series){
  var n=labels.length; if(!n){ el.innerHTML='<div class="empty">Нет данных</div>'; return; }
  var max=niceMax(Math.max.apply(null,[1].concat.apply([],series.map(function(s){return s.data;}))));
  var iw=(W-PL-PR)/n, s=frame(labels,max);
  series.forEach(function(se,k){
    var pts=se.data.map(function(v,i){ return [PL+iw*(i+0.5), PT+(H-PT-PB)*(1-v/max)]; });
    var path=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' ');
    if(k===0) s+='<path d="'+path+' L'+pts[n-1][0]+' '+(H-PB)+' L'+pts[0][0]+' '+(H-PB)+'Z" fill="'+se.color+'" opacity=".12"/>';
    s+='<path d="'+path+'" fill="none" stroke="'+se.color+'" stroke-width="2.2" vector-effect="non-scaling-stroke"/>';
    if(n<=45) pts.forEach(function(p){ s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3" fill="'+se.color+'"/>'; });
  });
  el.innerHTML=s+'</svg>'+legend(series); tipFor(el,labels,series,n);
}
function barChart(el,labels,series,single){
  var n=labels.length; if(!n){ el.innerHTML='<div class="empty">Нет данных</div>'; return; }
  var max=niceMax(Math.max.apply(null,[1].concat.apply([],series.map(function(s){return s.data;}))));
  var iw=(W-PL-PR)/n, gw=iw*0.8, bw=gw/series.length, s=frame(labels,max,single);
  series.forEach(function(se,k){
    se.data.forEach(function(v,i){
      var h=(H-PT-PB)*v/max, x=PL+iw*i+(iw-gw)/2+bw*k;
      if(v>0) s+='<rect x="'+x.toFixed(1)+'" y="'+(H-PB-h).toFixed(1)+'" width="'+Math.max(1,bw-1).toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+se.color+'" rx="1"/>';
    });
  });
  el.innerHTML=s+'</svg>'+(single?'':legend(series)); tipFor(el,labels,series,n);
}

// ---------- CSV ----------
$('csv').addEventListener('click',function(){
  var r=state.last; if(!r) return;
  var rows=['период;заходы;уникальные;комнаты;игры начаты;игры завершены;ошибки'];
  r.series.forEach(function(s){ rows.push([label(s.t,r.bucket),s.visits,s.uniques,s.rooms,s.starts,s.overs,s.errors].join(';')); });
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));
  a.download='bunker-stats.csv'; a.click();
});

drawTabs(); applyPreset('7d'); load();
setInterval(function(){ if($('auto').checked && state.preset!=='yest' && state.preset!=='custom') { if(state.preset!=='all'){ var keep=state.to-state.from; applyPreset(state.preset); } else { state.to=Date.now(); } load(); } else if($('auto').checked){ load(); } },30000);
})();
</script></body></html>`;
