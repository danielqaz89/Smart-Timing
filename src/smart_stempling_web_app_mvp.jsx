import React, { useEffect, useMemo, useState } from "react";
const API_BASE = "https://smart-timing.onrender.com/api";
/**
 * Smart Stempling – Web App (MVP)
 * -----------------------------------------------------------
 * Én-fil-løsning: inneholder både
 *  - Introduksjonsskjema (Prosjektinformasjon)
 *  - Hovedappen (SmartStemplingMain)
 *
 * Norsk UI. Inneholder:
 *  - Lokal lagring
 *  - Stemple inn/ut + manuell føring
 *  - CSV-import
 *  - Mandag–fredag-fokus i summer
 *  - Timesats med stabil input
 *  - Gjentakelser per måned (Tittel + Aktivitet + Ukedag)
 *  - Valgfri toveis synk via Google Apps Script-webhook (POST + GET)
 */

// ---------- Typer ----------
type Activity = "Work" | "Meeting";

// Norsk visningsnavn for aktivitet
function activityLabel(a: Activity): string {
  return a === "Work" ? "Arbeid" : "Møte";
}

type LogRow = {
  id: string;
  date: string; // yyyy-mm-dd
  start: string; // HH:MM
  end: string;   // HH:MM
  breakHours: number; // desimaltimer
  activity: Activity;
  title: string;
  project?: string;
  place?: string;
  notes?: string;
  createdAt: number;
};

type ProjectInfo = {
  konsulent: string;
  oppdragsgiver: string;
  tiltak: string;
  periode: string;
  klientId: string;
};

// ---------- Lagringsnøkler ----------
const LS_KEY = "smart-stempling-logs-v1";
const LS_ACTIVE_CLOCK = "smart-stempling-active-clock";
const LS_RATE = "smart-stempling-hourly-rate";
const LS_WEBHOOK_ENABLED = "smart-stempling-webhook-enabled";
const LS_WEBHOOK_URL = "smart-stempling-webhook-url";
const LS_SHEET_URL = "smart-stempling-sheet-url";
const LS_PROJECT_INFO = "smart-stempling-project-info";

// ---------- Hjelpere ----------
function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function nowTimeStr(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function parseHM(hm: string) { const [h, m] = hm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); }
function minutesToHours(mins: number) { return mins / 60; }
function isMonToFri(dateISO: string) { const d = new Date(dateISO + "T00:00:00"); const wd = d.getDay(); return wd >= 1 && wd <= 5; }
function weekdayName(dateISO: string) { const d = new Date(dateISO + "T00:00:00"); return d.toLocaleDateString('nb-NO', { weekday: "short" }); }
function monthKey(dateISO: string) { const d = new Date(dateISO + "T00:00:00"); return `${d.getFullYear()}${pad(d.getMonth()+1)}`; }
function recurrenceKey(row: LogRow) { return `${monthKey(row.date)}|${weekdayName(row.date)}|${row.activity}|${row.title.trim().toLowerCase()}`; }
function computeHours(row: LogRow) { const dur = Math.max(0, parseHM(row.end) - parseHM(row.start)); const hours = minutesToHours(dur) - (row.breakHours || 0); return Math.max(0, Number.isFinite(hours) ? hours : 0); }
function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function nok(n: number) { try { return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK' }).format(n || 0); } catch { return `${(n || 0).toFixed(2)} kr`; } }

// Selvtester (endres ikke) + utvidet testdekning
(function runSelfTests(){
  const r1: LogRow = { id: "t1", date: "2025-11-03", start: "08:00", end: "12:00", breakHours: 0.5, activity: "Work", title: "Test", createdAt: 0 };
  console.assert(Math.abs(computeHours(r1) - 3.5) < 1e-9, "computeHours feilet");
  console.assert(monthKey("2025-11-03") === "202511", "monthKey feilet");
  const rk = recurrenceKey(r1); console.assert(rk.toLowerCase().includes("work") && rk.includes("202511"), "recurrenceKey feilet");
  console.assert(parseHM("01:30") === 90, "parseHM 01:30 feilet");
  console.assert(minutesToHours(150) === 2.5, "minutesToHours feilet");
  // Ekstra
  console.assert(weekdayName("2025-11-03").length >= 2, "weekdayName feilet");
})();

// ---------- CSV Import ----------
function parseDateFlexible(s: string): string | null {
  var t = (s || "").trim(); if (!t) return null;
  if (t.length === 10 && t[4] === '-' && t[7] === '-') { // YYYY-MM-DD
    var y = Number(t.slice(0,4)), m = Number(t.slice(5,7)), d = Number(t.slice(8,10));
    if (y > 1900 && m>=1 && m<=12 && d>=1 && d<=31) return t;
  }
  if (t.indexOf('.') > -1) { // DD.MM.YYYY
    var parts = t.split('.'); if (parts.length===3){
      var dd=Number(parts[0].trim()), mm=Number(parts[1].trim()), yyyy=Number(parts[2].trim());
      if (yyyy>1900 && mm>=1 && mm<=12 && dd>=1 && dd<=31) return `${yyyy}-${pad(mm)}-${pad(dd)}`;
    }
  }
  return null;
}
function normalizeActivityLabel(s: string): Activity { var t=(s||'').toLowerCase(); if (t.indexOf('mø')===0||t.indexOf('mo')===0||t.indexOf('meeting')!==-1) return 'Meeting'; return 'Work'; }
function safeTrim(v:any): string | undefined { if (v==null) return undefined; var s=String(v).trim(); return s? s: undefined; }
function parseCSV(text: string): Record<string,string>[] {
  var lines = text.split('\n').filter(l=>l.trim().length>0); if (!lines.length) return [];
  var header = lines[0].split(',').map(h=>h.trim().toLowerCase()); var rows: Record<string,string>[]=[];
  for (var i=1;i<lines.length;i++){ var cols=lines[i].split(','); var rec:Record<string,string>={}; for (var c=0;c<header.length;c++) rec[header[c]]=(cols[c]||'').trim(); rows.push(rec);} return rows;
}
function mapCSVToLogRows(recs: Record<string,string>[], ignoreWeekend: boolean): LogRow[] {
  var keyMap: Record<string,string> = { 'dato':'date','date':'date','inn':'start','start':'start','ut':'end','end':'end','pause':'break','break':'break','aktivitet':'activity','activity':'activity','tittel':'title','title':'title','prosjekt':'project','project':'project','sted':'place','place':'place','notater':'notes','notes':'notes' };
  var out: LogRow[] = [];
  recs.forEach(function(r){
    var low: Record<string,string> = {}; for (var k in r) low[k.toLowerCase()] = r[k];
    function get(name:string){ if (low[name]!=null) return low[name]; for (var kk in keyMap) if (keyMap[kk]===name && low[kk]!=null) return low[kk]; return undefined; }
    var d = parseDateFlexible(get('date')||''); if (!d) return; if (ignoreWeekend && !isMonToFri(d)) return;
    var start = get('start')||''; var end = get('end')||''; if (!start || !end) return;
    var breakHours=0; var braw=get('break'); if (braw){ var bn=parseFloat(braw.split(',').join('.')); if (Number.isFinite(bn)) breakHours=Math.max(0,bn); }
    var activity = normalizeActivityLabel(get('activity')||'');
    var row: LogRow = { id: uuid(), date: d, start, end, breakHours, activity, title: safeTrim(get('title'))||'', project: safeTrim(get('project')), place: safeTrim(get('place')), notes: safeTrim(get('notes')), createdAt: Date.now() };
    out.push(row);
  });
  return out;
}
// CSV selvtester
console.assert(parseDateFlexible('2025-11-02')==='2025-11-02','parseDateFlexible ISO');
console.assert(parseDateFlexible('02.11.2025')==='2025-11-02','parseDateFlexible NO');
console.assert(normalizeActivityLabel('Arbeid')==='Work','norm Arbeid');
console.assert(normalizeActivityLabel('Møte')==='Meeting','norm Møte');

// ---------- Timesats (stabil input) ----------
const nbFormatter = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function sanitizeRateInputManual(raw: string): string { let result=""; let seenSep=false; for (const ch of raw){ if (ch>='0'&&ch<='9'){ result+=ch; } else if ((ch===','||ch==='.') && !seenSep){ result+=','; seenSep=true; } } return result; }
function stripAllSpaces(s: string): string { let out=""; for (const ch of s){ if (ch!== ' ' && ch!== '\u00A0' && ch!== '\u202F') out+=ch; } return out; }
function parseRateManual(text: string): number { const normalized=(text||"").split(".").join(",").replace(",","."); const n=parseFloat(normalized); return Number.isFinite(n)? n: NaN; }
function RateInputManual({ value, onChange }: { value: string; onChange: (v: string) => void; }){
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-300">Timesats</label>
      <input
        type="text"
        inputMode="decimal"
        className="bg-black/30 rounded-xl px-3 py-2 border border-white/10 w-36 min-w-[9rem] text-right tabular-nums"
        placeholder="kr/t"
        value={value}
        onChange={(e)=>onChange(sanitizeRateInputManual(e.target.value))}
        onBlur={()=>{ const n=parseRateManual(value); if(!isNaN(n)){ const formatted=stripAllSpaces(nbFormatter.format(n)); onChange(formatted);} }}
      />
      <span className="text-sm text-slate-400">kr/t</span>
    </div>
  );
}
// rate selvtester
console.assert(parseRateManual("250")===250,"rate 250");
console.assert(parseRateManual("250,5")===250.5,"rate 250,5");
console.assert(parseRateManual("250.75")===250.75,"rate 250.75");
console.assert(sanitizeRateInputManual("2,,5")==="2,5","sanitize ,,");
console.assert(sanitizeRateInputManual("2..5")==="2,5","sanitize ..");

// ---------- Webhook (toveis) ----------
function extractSheetIdFromUrl(url: string): string | null { const m = url.match(/\/d\/([a-zA-Z0-9-_]+)/); return m? m[1]: null; }
function toWebhookPayload(r: LogRow, hourlyRate: number){ const h=computeHours(r); const belop = isMonToFri(r.date)? h*hourlyRate: 0; return { dato:r.date, ukedag:weekdayName(r.date), inn:r.start, ut:r.end, pause:r.breakHours||0, timer:Number(h.toFixed(2)), aktivitet:activityLabel(r.activity), tittel:r.title, prosjekt:r.project||"", sted:r.place||"", notater:r.notes||"", beløp:Number(belop.toFixed(2)) }; }
async function postRowToWebhook(webhookUrl:string, row:LogRow, hourlyRate:number){ await fetch(webhookUrl,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(toWebhookPayload(row,hourlyRate)) }); }
async function fetchRowsFromWebhook(webhookUrl:string){ const res = await fetch(webhookUrl, { method:'GET' }); if (!res.ok) throw new Error('Kunne ikke hente fra webhook'); return res.json(); }

// ---------- Hovedkomponent ----------
function SmartStemplingMain({ info }: { info: ProjectInfo }){
  const [rows, setRows] = useState<LogRow[]>([]);
  const [month, setMonth] = useState<string>(()=>monthKey(todayStr()));
  const [activity, setActivity] = useState<Activity>("Work");
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<string>(todayStr());
  const [start, setStart] = useState<string>(nowTimeStr());
  const [end, setEnd] = useState<string>(nowTimeStr());
  const [breakHours, setBreakHours] = useState<number>(0);
  const [hourlyRateInput, setHourlyRateInput] = useState<string>(()=>localStorage.getItem(LS_RATE)??"");
  const hourlyRate = useMemo(()=>{ const n=parseRateManual(hourlyRateInput); return Number.isFinite(n)&&n>=0? n: 0; },[hourlyRateInput]);

  // Webhook state
  const [whEnabled, setWhEnabled] = useState<boolean>(() => (localStorage.getItem(LS_WEBHOOK_ENABLED) ?? 'false') === 'true');
  const [webhookUrl, setWebhookUrl] = useState<string>(()=>localStorage.getItem(LS_WEBHOOK_URL)??"");
  const [sheetUrl, setSheetUrl] = useState<string>(()=>localStorage.getItem(LS_SHEET_URL)??"");
  const [whError, setWhError] = useState<string| null>(null);

  // last fra storage
// Load logs from backend when component mounts
useEffect(() => {
  async function loadLogs() {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      const data = await res.json();
      setRows(data);
    } catch (err) {
      console.error("Failed to load logs:", err);
    }
  }
  loadLogs();
}, []);

// When rows change, you can skip storing to localStorage
// (optional: keep it as backup if offline)

  useEffect(()=>{ localStorage.setItem(LS_RATE, hourlyRateInput); },[hourlyRateInput]);
  useEffect(()=>{ localStorage.setItem(LS_WEBHOOK_ENABLED, String(whEnabled)); },[whEnabled]);
  useEffect(()=>{ localStorage.setItem(LS_WEBHOOK_URL, webhookUrl); },[webhookUrl]);
  useEffect(()=>{ localStorage.setItem(LS_SHEET_URL, sheetUrl); },[sheetUrl]);

  const months = useMemo(()=>{ const s = new Set(rows.map(r=>monthKey(r.date))); const arr = Array.from(s); arr.sort(); return arr; },[rows]);
  const monthRows = useMemo(()=> rows.filter(r=>monthKey(r.date)===month), [rows, month]);

  const stats = useMemo(()=>{ let total=0, work=0, meeting=0, days=new Set<string>(); monthRows.forEach(r=>{ if(!isMonToFri(r.date)) return; const h=computeHours(r); total+=h; if(r.activity==="Work") work+=h; else meeting+=h; days.add(r.date); }); return { total, work, meeting, days: days.size, earnings: total*hourlyRate };
  },[monthRows, hourlyRate]);

  const recurrenceMap = useMemo(()=>{ const map = new Map<string,{key:string,count:number,sample:LogRow}>(); monthRows.forEach(r=>{ const key=recurrenceKey(r); const old=map.get(key); if(old) old.count+=1; else map.set(key,{key,count:1,sample:r}); }); return Array.from(map.values()).filter(x=>x.count>1).sort((a,b)=>b.count-a.count); },[monthRows]);

  async function addRow() {
    if (!date || !start || !end) return alert("Fyll inn Dato, Inn og Ut.");
  
    const newRow = {
      date,
      start,
      end,
      breakHours: Number(breakHours) || 0,
      activity,
      title: title.trim(),
      project: project.trim() || undefined,
      place: place.trim() || undefined,
      notes: notes.trim() || undefined
    };
  
    try {
      const res = await fetch(`${API_BASE}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow)
      });
      const saved = await res.json();
      setRows(prev => [saved, ...prev]);
    } catch (err) {
      console.error("Failed to add row:", err);
      alert("Kunne ikke lagre til serveren.");
    }
  }
  
  async function deleteRow(id) {
    if (!confirm("Slette denne raden?")) return;
    try {
      await fetch(`${API_BASE}/logs/${id}`, { method: "DELETE" });
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("Failed to delete log:", err);
    }
  }

  await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(info)
  });
  

  // Stempling
  const [activeClock, setActiveClock] = useState<null | {startedAtISO:string; startedTime:string; activity:Activity; title:string; project?:string; place?:string;}>(null);
  useEffect(()=>{ try{ const ac = localStorage.getItem(LS_ACTIVE_CLOCK); if(ac) setActiveClock(JSON.parse(ac)); }catch{} },[]);
  useEffect(()=>{ if(activeClock) localStorage.setItem(LS_ACTIVE_CLOCK, JSON.stringify(activeClock)); else localStorage.removeItem(LS_ACTIVE_CLOCK); },[activeClock]);
  function handleClockIn(){ if(activeClock) return; if(!title.trim()) return alert("Skriv en tittel før du stempler inn."); setActiveClock({ startedAtISO: todayStr(), startedTime: nowTimeStr(), activity, title:title.trim(), project: project.trim()||undefined, place: place.trim()||undefined }); }
  function handleClockOut(){ if(!activeClock) return; const endTime = nowTimeStr(); const newRow:LogRow={ id: uuid(), date: activeClock.startedAtISO, start: activeClock.startedTime, end: endTime, breakHours:0, activity: activeClock.activity, title: activeClock.title, project: activeClock.project, place: activeClock.place, notes: notes.trim()||undefined, createdAt: Date.now()}; setRows(prev=>[newRow,...prev]); if(whEnabled && webhookUrl){ postRowToWebhook(webhookUrl, newRow, hourlyRate).catch(e=>setWhError(String(e))); } setActiveClock(null); }

  // UI helpers
  const Card: React.FC<React.PropsWithChildren<{className?: string}>> = ({className, children}) => (<div className={`rounded-2xl shadow p-4 bg-white/5 border border-white/10 ${className||""}`}>{children}</div>);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Smart Stempling</h1>
          <p className="text-slate-300 mt-1">MVP • Lokal lagring • Fokus: mandag–fredag i rapporter • Gjentakelser per måned</p>
          <p className="text-slate-400 text-sm mt-2">Konsulent: <b>{info.konsulent||'-'}</b> • Oppdragsgiver: <b>{info.oppdragsgiver||'-'}</b> • Tiltak: <b>{info.tiltak||'-'}</b> • Periode: <b>{info.periode||'-'}</b> • Klient ID/Saks nr: <b>{info.klientId||'-'}</b></p>
        </header>

        {/* Kontrollrad */}
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <Card>
            <h2 className="font-medium mb-3">Stempling</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10" onClick={()=>setActivity("Work")}>Arbeid</button>
              <button className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10" onClick={()=>setActivity("Meeting")}>Møte</button>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Tittel / Møte" value={title} onChange={e=>setTitle(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Prosjekt / Kunde" value={project} onChange={e=>setProject(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Sted / Modus" value={place} onChange={e=>setPlace(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Notater (valgfritt)" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              {!activeClock ? (
                <button onClick={handleClockIn} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium">Stemple INN</button>
              ) : (
                <button onClick={handleClockOut} className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 font-medium">Stemple UT</button>
              )}
              {activeClock && (
                <span className="text-sm text-slate-300">Startet {activeClock.startedAtISO} kl. {activeClock.startedTime} – {activityLabel(activeClock.activity)} • {activeClock.title}</span>
              )}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {(([{label:"Arbeid",activity:"Work" as Activity,title:"Fokusarbeid"}, {label:"Daglig standup",activity:"Meeting" as Activity,title:"Standup"}, {label:"Kundemøte",activity:"Meeting" as Activity,title:"Kundemøte"}] as Array<{label:string,activity:Activity,title:string}>)).map((q) => (
                <button key={q.label} onClick={()=>{ setActivity(q.activity); setTitle(q.title); }} className="text-xs rounded-full border border-white/10 px-3 py-1 hover:bg-white/10">{q.label}</button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-medium mb-3">Legg til manuelt</h2>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" value={date} onChange={e=>setDate(e.target.value)} />
              <select className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" value={activity} onChange={e=>setActivity(e.target.value as Activity)}>
                <option value="Work">Arbeid</option>
                <option value="Meeting">Møte</option>
              </select>
              <input type="time" className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" value={start} onChange={e=>setStart(e.target.value)} />
              <input type="time" className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" value={end} onChange={e=>setEnd(e.target.value)} />
              <input type="number" step="0.25" className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Pause (timer)" value={breakHours} onChange={e=>setBreakHours(Number(e.target.value))} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Tittel / Møte" value={title} onChange={e=>setTitle(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Prosjekt / Kunde" value={project} onChange={e=>setProject(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Sted / Modus" value={place} onChange={e=>setPlace(e.target.value)} />
              <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10 col-span-2" placeholder="Notater" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
            <div className="mt-3">
              <button onClick={addRow} className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 font-medium">Legg til</button>
            </div>
          </Card>

          <Card>
            <h2 className="font-medium mb-3">Månedsfilter og nøkkeltall</h2>
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <select className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" value={month} onChange={e=>setMonth(e.target.value)}>
                {[...new Set([month, ...months])].sort().map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
              <button className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10" onClick={()=>setMonth(monthKey(todayStr()))}>Denne måneden</button>
              <RateInputManual value={hourlyRateInput} onChange={setHourlyRateInput} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-black/30 p-3 border border-white/10"><div className="text-slate-300">Totale timer (man–fre)</div><div className="text-xl font-semibold">{stats.total.toFixed(2)}</div></div>
              <div className="rounded-xl bg-black/30 p-3 border border-white/10"><div className="text-slate-300">Arbeid</div><div className="text-xl font-semibold">{stats.work.toFixed(2)}</div></div>
              <div className="rounded-xl bg-black/30 p-3 border border-white/10"><div className="text-slate-300">Møter</div><div className="text-xl font-semibold">{stats.meeting.toFixed(2)}</div></div>
              <div className="rounded-xl bg-black/30 p-3 border border-white/10"><div className="text-slate-300">Dager logget</div><div className="text-xl font-semibold">{stats.days}</div></div>
              <div className="rounded-xl bg-black/30 p-3 border border-white/10 col-span-2"><div className="text-slate-300">Estimert lønn (man–fre)</div><div className="text-xl font-semibold">{nok(stats.earnings)}</div></div>
            </div>
          </Card>
        </div>

        {/* Importer timeplan (CSV) */}
        <Card>
          <h2 className="font-medium mb-3">Importer timeplan (CSV)</h2>
          <p className="text-sm text-slate-300 mb-2">Format (med header): <code>Dato,Inn,Ut,Pause,Aktivitet,Tittel,Prosjekt,Sted,Notater</code>. Støtter også engelske navn (Date/Start/End/Break/Activity/...)</p>
          <p className="text-xs text-slate-400 mb-3">Dato: <code>YYYY-MM-DD</code> eller <code>DD.MM.YYYY</code>. Aktivitet: <code>Arbeid</code>/<code>Møte</code> eller <code>Work</code>/<code>Meeting</code>.</p>
          <div className="flex items-center gap-3 mb-3">
            <input type="file" accept=".csv,text/csv" className="block text-sm" onChange={async (e)=>{ const file=e.target.files?.[0]; if(!file) return; const text=await file.text(); const recs=parseCSV(text); const toAdd=mapCSVToLogRows(recs,true); if(toAdd.length===0){ alert('Fant ingen gyldige rader i filen.'); e.currentTarget.value=''; return;} setRows(prev=>[...toAdd,...prev]); alert(`Importert ${toAdd.length} rader.`); e.currentTarget.value=''; }} />
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked disabled /> Ignorer helg (lør/søn)</label>
          </div>
        </Card>

        {/* Webhook-synk (toveis) */}
        <Card className="mt-6">
          <h2 className="font-medium mb-3">Google Sheets Webhook (toveis)</h2>
          <p className="text-sm text-slate-300 mb-2">Lim inn <b>webhook-URL</b> (Apps Script webapp) eller <b>Google Sheets-URL</b> – vi trekker ut ID automatisk. Webhooken må støtte <code>POST</code> for append og <code>GET</code> for eksport.</p>
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={whEnabled} onChange={e=>setWhEnabled(e.target.checked)} /> Aktiver synk</label>
            {whError && <span className="text-rose-300 text-sm">Feil: {whError}</span>}
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Webhook URL (https://script.google.com/.../exec)" value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} />
            <input className="bg-black/30 rounded-xl px-3 py-2 border border-white/10" placeholder="Google Sheets URL (valgfritt)" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10" disabled={!whEnabled || !webhookUrl} onClick={async ()=>{ try{ const t:LogRow={ id:uuid(), date: todayStr(), start:'09:00', end:'10:00', breakHours:0, activity:'Work', title:'Test-sync', createdAt: Date.now() }; await postRowToWebhook(webhookUrl, t, hourlyRate); alert('Sendte en testrad.'); }catch(e:any){ setWhError(String(e)); } }}>Send testrad</button>
            <button className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10" disabled={!whEnabled || !webhookUrl} onClick={async ()=>{ try{ setWhError(null); const data = await fetchRowsFromWebhook(webhookUrl); if(!Array.isArray(data)) { alert('Uventet respons fra webhook. Forventet JSON-array.'); return; } // Forventet struktur: [ [Dato,Ukedag,Inn,Ut,Pause,Timer,Aktivitet,Tittel,Prosjekt,Sted,Notater,Beløp], ... ]
              const imported: LogRow[] = [];
              data.forEach((arr:any)=>{ if(!Array.isArray(arr)||arr.length<6) return; const datum = parseDateFlexible(String(arr[0])||''); if(!datum) return; const act = (String(arr[6]||'').toLowerCase().includes('mø'))? 'Meeting' : (String(arr[6]||'').toLowerCase().includes('meet')? 'Meeting':'Work'); const row:LogRow={ id:uuid(), date: datum, start: String(arr[2]||''), end: String(arr[3]||''), breakHours: Number(String(arr[4]||'0').replace(',','.'))||0, activity: act as Activity, title: String(arr[7]||''), project: String(arr[8]||'')||undefined, place: String(arr[9]||'')||undefined, notes: String(arr[10]||'')||undefined, createdAt: Date.now() }; imported.push(row); });
              if(imported.length===0){ alert('Ingen gyldige rader å importere.'); return; } setRows(prev=>[...imported, ...prev]); alert(`Importert ${imported.length} rader fra Sheets.`); }catch(e:any){ setWhError(String(e)); } }}>Importer fra Google Sheets</button>
          </div>
          <p className="text-xs text-slate-400 mt-3">Kolonnerekkefølge i arket må være: Dato | Ukedag | Inn | Ut | Pause | Timer | Aktivitet | Tittel | Prosjekt | Sted | Notater | Beløp.</p>
        </Card>

        {/* Gjentakelser */}
        <Card className="mb-6 mt-6">
          <div className="flex items-center justify-between mb-3"><h2 className="font-medium">Gjentakelser i {month}</h2><span className="text-sm text-slate-400">Gjenkjenner pr. Tittel + Aktivitet + Ukedag</span></div>
          {recurrenceMap.length===0 ? (<p className="text-slate-400">Ingen gjentakelser registrert denne måneden enda.</p>) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recurrenceMap.map(({key,count,sample})=> (
                <div key={key} className="rounded-xl bg-black/30 p-3 border border-white/10">
                  <div className="text-sm text-slate-300">{weekdayName(sample.date)} • {activityLabel(sample.activity)}</div>
                  <div className="font-semibold">{sample.title || <em className="text-slate-400">(uten tittel)</em>}</div>
                  <div className="text-sm text-slate-400 mt-1">Antall: {count}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Loggtabell */}
        <Card>
          <div className="flex items-center justify-between mb-3"><h2 className="font-medium">Logg for {month}</h2><div className="text-sm text-slate-400">Kun mandag–fredag inngår i summer</div></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-300">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3">Dato</th>
                  <th className="py-2 pr-3">Ukedag</th>
                  <th className="py-2 pr-3">Inn</th>
                  <th className="py-2 pr-3">Ut</th>
                  <th className="py-2 pr-3">Pause</th>
                  <th className="py-2 pr-3">Timer</th>
                  <th className="py-2 pr-3">Aktivitet</th>
                  <th className="py-2 pr-3">Tittel</th>
                  <th className="py-2 pr-3">Prosjekt</th>
                  <th className="py-2 pr-3">Sted</th>
                  <th className="py-2 pr-3">Notater</th>
                  <th className="py-2 pr-3">Beløp</th>
                  <th className="py-2 pr-3">Slett</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.length===0 ? (
                  <tr><td colSpan={13} className="py-6 text-center text-slate-400">Ingen rader i denne måneden ennå.</td></tr>
                ) : (
                  monthRows.sort((a,b)=>b.createdAt-a.createdAt).map(r=>{ const hours=computeHours(r); const amount=isMonToFri(r.date)? hours*hourlyRate: 0; return (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                      <td className="py-2 pr-3">{weekdayName(r.date)}</td>
                      <td className="py-2 pr-3">{r.start}</td>
                      <td className="py-2 pr-3">{r.end}</td>
                      <td className="py-2 pr-3">{r.breakHours || 0}</td>
                      <td className="py-2 pr-3">{isMonToFri(r.date) ? hours.toFixed(2) : <span className="text-slate-500">0.00*</span>}</td>
                      <td className="py-2 pr-3">{activityLabel(r.activity)}</td>
                      <td className="py-2 pr-3">{r.title}</td>
                      <td className="py-2 pr-3">{r.project || ""}</td>
                      <td className="py-2 pr-3">{r.place || ""}</td>
                      <td className="py-2 pr-3">{r.notes || ""}</td>
                      <td className="py-2 pr-3">{nok(amount)}</td>
                      <td className="py-2 pr-3"><button onClick={()=>deleteRow(r.id)} className="text-rose-300 hover:text-rose-200">Slett</button></td>
                    </tr>
                  ); })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2">* Timer fra lør/søn vises som 0.00 i summeringer.</p>
        </Card>

        <footer className="mt-8 text-xs text-slate-500">Laget for Norwedfilm • Lokal prototype. Webhook toveis-synk støttes med Apps Script. Eksport til CSV/Sheets kan utvides.</footer>
      </div>
    </div>
  );
}

// ---------- App (med introduksjonsskjema) ----------
export default function App(){
  const [info, setInfo] = useState<ProjectInfo>(()=>{ try{ return JSON.parse(localStorage.getItem(LS_PROJECT_INFO)||"null") || {konsulent:"",oppdragsgiver:"",tiltak:"",periode:"",klientId:""}; }catch{ return {konsulent:"",oppdragsgiver:"",tiltak:"",periode:"",klientId:""}; } });
  const [submitted, setSubmitted] = useState<boolean>(()=> Object.values(info).some(v=>String(v||"").trim().length>0));
  useEffect(()=>{ localStorage.setItem(LS_PROJECT_INFO, JSON.stringify(info)); },[info]);

  if (!submitted){
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
        <div className="max-w-md w-full p-6 bg-white/5 rounded-2xl border border-white/10 shadow-xl">
          <h1 className="text-2xl font-semibold mb-4 text-center">Prosjektinformasjon</h1>
          <div className="grid gap-3">
            <input className="bg-black/30 border border-white/10 rounded-xl px-3 py-2" placeholder="Konsulent" value={info.konsulent} onChange={(e)=>setInfo({...info, konsulent:e.target.value})} />
            <input className="bg-black/30 border border-white/10 rounded-xl px-3 py-2" placeholder="Oppdragsgiver" value={info.oppdragsgiver} onChange={(e)=>setInfo({...info, oppdragsgiver:e.target.value})} />
            <input className="bg-black/30 border border-white/10 rounded-xl px-3 py-2" placeholder="Tiltak" value={info.tiltak} onChange={(e)=>setInfo({...info, tiltak:e.target.value})} />
            <input className="bg-black/30 border border-white/10 rounded-xl px-3 py-2" placeholder="Periode" value={info.periode} onChange={(e)=>setInfo({...info, periode:e.target.value})} />
            <input className="bg-black/30 border border-white/10 rounded-xl px-3 py-2" placeholder="Klient ID / Saks nr" value={info.klientId} onChange={(e)=>setInfo({...info, klientId:e.target.value})} />
          </div>
          <button className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 rounded-xl py-2 font-medium" onClick={()=>setSubmitted(true)}>Fortsett</button>
        </div>
      </div>
    );
  }

  return <SmartStemplingMain info={info} />;
}
