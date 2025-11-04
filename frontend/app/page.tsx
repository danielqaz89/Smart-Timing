"use client";
import { useEffect, useMemo, useState, forwardRef, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUserSettings, useQuickTemplates, useProjectInfo } from "../lib/hooks";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";
import { useSnackbar } from "notistack";
import SettingsDrawer from "../components/SettingsDrawer";
import MigrationBanner from "../components/MigrationBanner";
import MobileBottomNav from "../components/MobileBottomNav";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SettingsIcon from "@mui/icons-material/Settings";
import CircularProgress from "@mui/material/CircularProgress";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import { API_BASE, createLog, deleteLog, fetchLogs, createLogsBulk, webhookTestRelay, deleteLogsMonth, deleteLogsAll, updateLog, sendTimesheet, type LogRow } from "../lib/api";
import { exportToPDF } from "../lib/pdfExport";
import { useThemeMode } from "../components/ThemeRegistry";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import QuickStampFAB from "../components/QuickStampFAB";
import TemplateManager from "../components/TemplateManager";

// Locale-safe helpers for Timesats input (Norwegian)
const nbFormatter = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function sanitizeRateInput(raw: string) {
  let out = ""; let seenSep = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if ((ch === ',' || ch === '.') && !seenSep) { out += ','; seenSep = true; }
  }
  return out;
}
function parseRate(text: string) {
  const n = parseFloat((text || "").split(".").join(",").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function formatRate(n: number) {
  try { return nbFormatter.format(n || 0); } catch { return String(n || 0); }
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [] as any[];
  const header = lines[0].split(/,|;|\t/).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = idx(["dato","date"]);
  const iStart = idx(["inn","start","start_time"]);
  const iEnd = idx(["ut","end","end_time"]);
  const iPause = idx(["pause","break","break_hours"]);
  const iActivity = idx(["aktivitet","activity"]);
  const iTitle = idx(["tittel","title"]);
  const iProject = idx(["prosjekt","project"]);
  const iPlace = idx(["sted","place"]);
  const iNotes = idx(["notater","notes"]);

  const rows = lines.slice(1).map((ln) => ln.split(/,|;|\t/));
  const out = rows.map((cols) => {
    const d = cols[iDate]?.trim();
    const st = cols[iStart]?.trim();
    const et = cols[iEnd]?.trim();
    const bh = Number(cols[iPause] || 0) || 0;
    const act = cols[iActivity]?.trim();
    return {
      date: dayjs(d).format("YYYY-MM-DD"),
      start: st?.slice(0,5),
      end: et?.slice(0,5),
      breakHours: bh,
      activity: act === "Møte" ? "Meeting" : act === "Arbeid" ? "Work" : (act as any),
      title: cols[iTitle]?.trim() || undefined,
      project: cols[iProject]?.trim() || undefined,
      place: cols[iPlace]?.trim() || undefined,
      notes: cols[iNotes]?.trim() || undefined,
    };
  }).filter(r => r.date && r.start && r.end);

  return out;
}

function CsvImport({ onImported, onToast }: { onImported: () => Promise<void> | void, onToast: (msg: string, sev?: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [ignoreWeekend, setIgnoreWeekend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  function validateRow(r: any) {
    const validDate = dayjs(r.date, "YYYY-MM-DD", true).isValid();
    const time = /^\d{2}:\d{2}$/;
    const validStart = time.test(r.start || "");
    const validEnd = time.test(r.end || "");
    const validBreak = typeof r.breakHours === "number" && r.breakHours >= 0;
    return validDate && validStart && validEnd && validBreak;
  }

  useEffect(() => {
    (async () => {
      if (!file) { setPreview([]); setInvalidCount(0); setTotalCount(0); return; }
      const text = await file.text();
      const rows = parseCsv(text);
      const invalid = rows.filter((r) => !validateRow(r)).length;
      setInvalidCount(invalid);
      setTotalCount(rows.length);
      setPreview(rows.slice(0, 10));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      let rows = parseCsv(text);
      if (ignoreWeekend) rows = rows.filter((r) => {
        const d = dayjs(r.date).day();
        return d !== 0 && d !== 6; // exclude Sun(0) and Sat(6)
      });
      if (rows.length === 0) { onToast("Ingen rader å importere", "warning"); return; }
      await createLogsBulk(rows);
      await onImported();
      onToast(`Import fullført: ${rows.length} rader`, "success");
      setFile(null);
    } catch (e:any) {
      onToast(`Import feilet: ${e?.message || e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2">Format: Dato, Inn, Ut, Pause, Aktivitet, Tittel, Prosjekt, Sted, Notater</Typography>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" component="label">
          Velg fil
          <input hidden type="file" accept=".csv,text/csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Button>
        <Typography sx={{ alignSelf: "center" }}>{file?.name ?? "Ingen fil valgt"}</Typography>
      </Stack>
      {file && (
        <>
          <Stack direction="row" spacing={2}>
            <Chip label={`Totalt: ${totalCount}`} />
            <Chip color={invalidCount ? "error" : "success"} label={`Ugyldige: ${invalidCount}`} />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Dato</TableCell>
                <TableCell>Inn</TableCell>
                <TableCell>Ut</TableCell>
                <TableCell>Pause</TableCell>
                <TableCell>Aktivitet</TableCell>
                <TableCell>Tittel</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i} sx={{ bgcolor: validateRow(r) ? undefined : "rgba(255,0,0,0.08)" }}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.start}</TableCell>
                  <TableCell>{r.end}</TableCell>
                  <TableCell>{r.breakHours}</TableCell>
                  <TableCell>{r.activity}</TableCell>
                  <TableCell>{r.title}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Stack direction="row" spacing={2}>
        <Chip label={ignoreWeekend ? "Ignorer helg: På" : "Ignorer helg: Av"} onClick={() => setIgnoreWeekend(!ignoreWeekend)} />
        <Button disabled={!file || busy || invalidCount > 0} variant="contained" onClick={handleImport}>Importer</Button>
      </Stack>
    </Stack>
  );
}

function WebhookSection({ onImported, onToast, settings, updateSettings }: { onImported: () => Promise<void> | void, onToast: (msg: string, sev?: any) => void, settings: any, updateSettings: any }) {
  const [busy, setBusy] = useState(false);
  const active = settings?.webhook_active || false;
  const webhookUrl = settings?.webhook_url || '';
  const sheetUrl = settings?.sheet_url || '';

  async function sendTest() {
    if (!webhookUrl) return;
    setBusy(true);
    try {
      await webhookTestRelay(webhookUrl, { type: "test", message: "Smart Timing testrad" });
    } finally {
      setBusy(false);
    }
  }

  function makeCsvUrl(url: string) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("docs.google.com") && u.pathname.includes("/spreadsheets/d/")) {
        const id = u.pathname.split("/spreadsheets/d/")[1]?.split("/")[0];
        const gidMatch = u.hash.match(/gid=(\d+)/) || u.search.match(/gid=(\d+)/);
        const gid = gidMatch ? gidMatch[1] : "0";
        return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
      }
      return url;
    } catch { return url; }
  }

  async function importFromSheet() {
    if (!sheetUrl) return;
    setBusy(true);
    try {
      const csvUrl = makeCsvUrl(sheetUrl);
      const resp = await fetch(`${API_BASE}/api/proxy/fetch-csv?url=${encodeURIComponent(csvUrl)}`);
      const text = await resp.text();
      const rows = parseCsv(text);
      if (rows.length) await createLogsBulk(rows);
      await onImported();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField label="Webhook URL" fullWidth value={webhookUrl} onChange={(e) => updateSettings({webhook_url: e.target.value})} />
        <TextField label="Google Sheets URL (valgfritt)" fullWidth value={sheetUrl} onChange={(e) => updateSettings({sheet_url: e.target.value})} />
      </Stack>
      <Stack direction="row" spacing={2}>
        <Chip label={active ? "Aktiver synk: På" : "Aktiver synk: Av"} onClick={() => updateSettings({webhook_active: !active})} />
        <Button disabled={!webhookUrl || busy} variant="outlined" onClick={async () => { await sendTest(); onToast("Webhook testrad sendt"); }}>Send testrad</Button>
        <Button disabled={!sheetUrl || busy} variant="outlined" onClick={importFromSheet}>Importer fra Google Sheets</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">Oppsett lagres i nettleseren. For import må arket være delt "Anyone with the link" eller publisert.</Typography>
    </Stack>
  );
}


function MonthBulk({ onDone, onToast }: { onDone: () => Promise<void> | void, onToast: (msg: string, sev?: any) => void }) {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [breakHours, setBreakHours] = useState(0.5);
  const [activity, setActivity] = useState<"Work" | "Meeting">("Work");
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);

  function generateRows() {
    const base = dayjs(month + "-01");
    const days = base.daysInMonth();
    const rows: any[] = [];
    for (let d = 1; d <= days; d++) {
      const dd = base.date(d);
      const dow = dd.day();
      if (dow === 0 || dow === 6) continue; // weekdays only
      rows.push({
        date: dd.format("YYYY-MM-DD"),
        start,
        end,
        breakHours,
        activity,
        title: title || undefined,
        project: project || undefined,
        place: place || undefined,
      });
    }
    return rows;
  }

  async function handleInsert() {
    setBusy(true);
    try {
      const rows = generateRows();
      if (rows.length === 0) { onToast("Ingen hverdager i valgt måned", "warning"); return; }
      await createLogsBulk(rows);
      onToast(`Lagt inn ${rows.length} hverdager`, "success");
      await onDone();
    } catch (e:any) {
      onToast(`Feil ved innlegging: ${e?.message || e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField type="month" label="Måned" InputLabelProps={{ shrink: true }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <TextField type="time" label="Inn" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField type="time" label="Ut" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
        <TextField type="number" label="Pause (timer)" value={breakHours} onChange={(e) => setBreakHours(Number(e.target.value) || 0)} />
        <FormControl>
          <InputLabel>Aktivitet</InputLabel>
          <Select label="Aktivitet" value={activity} onChange={(e) => setActivity(e.target.value as any)}>
            <MenuItem value="Work">Arbeid</MenuItem>
            <MenuItem value="Meeting">Møte</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField label="Tittel / Møte" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
        <TextField label="Prosjekt / Kunde" value={project} onChange={(e) => setProject(e.target.value)} fullWidth />
        <TextField label="Sted / Modus" value={place} onChange={(e) => setPlace(e.target.value)} fullWidth />
      </Stack>
      <Button variant="contained" onClick={handleInsert} disabled={busy}>Legg inn for hele måneden</Button>
    </Stack>
  );
}

function SendTimesheet({ month, onToast, settings, updateSettings }: { month: string; onToast: (msg: string, sev?: any) => void; settings: any; updateSettings: any }) {
  const [busy, setBusy] = useState(false);
  const sender = settings?.timesheet_sender || '';
  const recipient = settings?.timesheet_recipient || '';
  const format = settings?.timesheet_format || 'xlsx';
  const smtpPass = settings?.smtp_app_password || '';

  async function handleSend() {
    setBusy(true);
    try {
      await sendTimesheet({ month, senderEmail: sender, recipientEmail: recipient, format });
      onToast('Timeliste sendt', 'success');
    } catch (e:any) {
      onToast(`Kunne ikke sende: ${e?.message || e}`, 'error');
    } finally { setBusy(false); }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField label="Avsender e-post" value={sender} onChange={(e)=>updateSettings({timesheet_sender: e.target.value})} fullWidth />
        <TextField label="Mottaker e-post" value={recipient} onChange={(e)=>updateSettings({timesheet_recipient: e.target.value})} fullWidth />
        <FormControl>
          <InputLabel>Format</InputLabel>
          <Select label="Format" value={format} onChange={(e)=>updateSettings({timesheet_format: e.target.value})}>
            <MenuItem value="xlsx">XLSX</MenuItem>
            <MenuItem value="pdf">PDF</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <TextField type="password" label="App-passord (SMTP)" value={smtpPass} onChange={(e)=>updateSettings({smtp_app_password: e.target.value})} fullWidth />
      <Button variant="contained" onClick={handleSend} disabled={busy || !sender || !recipient}>Send</Button>
      <Typography variant="caption" color="text.secondary">Vi gjetter SMTP basert på e-post (Gmail/Outlook/Yahoo/iCloud/Proton m.fl.). Bruk app-passord for Gmail/Outlook.</Typography>
    </Stack>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const showToast = (msg: string, sev: any = "success") => enqueueSnackbar(msg, { variant: sev });
  
  // Section refs for mobile navigation
  const stemplingRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [mobileDialogContent, setMobileDialogContent] = useState<"stamp-work" | "stamp-meeting" | "manual-entry" | "import" | null>(null);
  
  // Database-backed settings
  const { settings, updateSettings: updateSettingsDb, mutate: mutateSettings } = useUserSettings();
  const { templates, createTemplate, deleteTemplate } = useQuickTemplates();
  const { projectInfo, isLoading: projectLoading } = useProjectInfo();
  
  // Wrapper to update settings with toast
  const updateSettings = async (partial: any) => {
    try {
      await updateSettingsDb(partial);
    } catch (e: any) {
      showToast(`Feil ved lagring: ${e?.message || e}`, 'error');
    }
  };

  type UndoAction =
    | { type: "delete"; row: LogRow }
    | { type: "update"; id: string; prev: Partial<LogRow & { start: string; end: string; breakHours: number }> };
  const [undo, setUndo] = useState<UndoAction | null>(null);
  async function handleUndo() {
    if (!undo) return;
    if (undo.type === "delete") {
      const r = undo.row as any;
      await createLog({
        date: r.date,
        start: (r.start_time || "").slice(0,5),
        end: (r.end_time || "").slice(0,5),
        breakHours: Number(r.break_hours || 0),
        activity: (r.activity as any) || "Work",
        title: r.title || undefined,
        project: r.project || undefined,
        place: r.place || undefined,
        notes: r.notes || undefined,
      });
      await mutate();
      showToast("Sletting angret");
    } else if (undo.type === "update") {
      const { id, prev } = undo;
      await updateLog(id, {
        date: prev.date as any,
        start: (prev.start || (prev as any).start_time || "") as any,
        end: (prev.end || (prev as any).end_time || "") as any,
        breakHours: (prev.breakHours as any) ?? (prev.break_hours as any),
        activity: prev.activity as any,
        title: (prev.title as any) ?? null,
        project: (prev.project as any) ?? null,
        place: (prev.place as any) ?? null,
        notes: (prev.notes as any) ?? null,
      });
      await mutate();
      showToast("Endring angret");
    }
    setUndo(null);
  }

  const [quickActivity, setQuickActivity] = useState<"Work" | "Meeting">("Work");
  const [quickProject, setQuickProject] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPlace, setQuickPlace] = useState("");
  const [quickNotes, setQuickNotes] = useState("");

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [start, setStart] = useState(dayjs().format("HH:mm"));
  const [end, setEnd] = useState(dayjs().format("HH:mm")); // Auto-fill same as start
  const [breakHours, setBreakHours] = useState(0);
  const [expenseCoverage, setExpenseCoverage] = useState(0);
  const [manualActivity, setManualActivity] = useState<"Work" | "Meeting">("Work");
  const [manualTitle, setManualTitle] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [manualPlace, setManualPlace] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'week'>(settings?.view_mode || 'month');
  
  // Sync view mode from settings
  useEffect(() => {
    if (settings?.view_mode) {
      setViewMode(settings.view_mode as 'month' | 'week');
    }
  }, [settings?.view_mode]);
  
  // Update view mode in database
  const updateViewMode = async (mode: 'month' | 'week') => {
    setViewMode(mode);
    try {
      await updateSettings({ view_mode: mode });
    } catch (e) {
      console.error('Failed to save view mode:', e);
    }
  };

  // Detect active stamp (today's entry with same start/end time)
  const activeStamp = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    return logs.find(l => l.date === today && l.start_time === l.end_time);
  }, [logs]);

  // Timer for active stamp
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  useEffect(() => {
    if (!activeStamp) {
      setElapsedTime("00:00:00");
      return;
    }
    const interval = setInterval(() => {
      const start = dayjs(`${activeStamp.date} ${activeStamp.start_time}`);
      const now = dayjs();
      const diff = now.diff(start, 'second');
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setElapsedTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStamp]);

  // Settings from database with fallbacks
  const rate = settings?.hourly_rate || 0;
  const [rateInput, setRateInput] = useState<string>("");
  useEffect(() => { setRateInput(formatRate(rate)); }, [rate]);
  const paidBreak = settings?.paid_break || false;
  const taxPct = settings?.tax_pct || 35;
  const monthNav = settings?.month_nav || dayjs().format("YYYYMM");
  const [calcBusy, setCalcBusy] = useState(false);
  const getKey = (index: number) => {
    const m = dayjs(monthNav + "01").subtract(index, "month").format("YYYYMM");
    return ["logs", m] as const;
  };
  const { data, isLoading, isValidating, mutate, size, setSize } = useSWRInfinite(
    getKey,
    ([, m]) => fetchLogs(m),
    { revalidateOnFocus: false }
  );
  const allLogs: LogRow[] = (data || []).flat();
  
  // Filter logs based on search query and view mode
  const logs = useMemo(() => {
    let filtered = allLogs;
    
    // Apply week filter if in week mode
    if (viewMode === 'week') {
      const startOfWeek = dayjs().startOf('week');
      const endOfWeek = dayjs().endOf('week');
      filtered = filtered.filter(l => {
        const logDate = dayjs(l.date);
        return logDate.isAfter(startOfWeek.subtract(1, 'day')) && logDate.isBefore(endOfWeek.add(1, 'day'));
      });
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.title?.toLowerCase().includes(q) ||
        l.project?.toLowerCase().includes(q) ||
        l.place?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q) ||
        l.activity?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [allLogs, searchQuery, viewMode]);
  const totalHours = useMemo(() => {
    return logs.reduce((sum, r) => {
      const d = dayjs(r.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return sum; // Mon–Fri only
      const start = dayjs(`${r.date} ${r.start_time}`);
      const end = dayjs(`${r.date} ${r.end_time}`);
      const breakUsed = paidBreak ? 0 : Number(r.break_hours || 0);
      const diff = end.diff(start, "minute") / 60 - breakUsed;
      return sum + Math.max(0, diff);
    }, 0);
  }, [logs, paidBreak]);
  
  const totalExpenses = useMemo(() => {
    return logs.reduce((sum, r) => {
      const d = dayjs(r.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return sum; // Mon–Fri only
      return sum + Number(r.expense_coverage || 0);
    }, 0);
  }, [logs]);
  useEffect(() => {
    setCalcBusy(true);
    const t = setTimeout(() => setCalcBusy(false), 150);
    return () => clearTimeout(t);
  }, [taxPct, rate, paidBreak, logs]);

  async function handleQuickStamp() {
    await createLog({
      date: dayjs().format("YYYY-MM-DD"),
      start: dayjs().format("HH:mm"),
      end: dayjs().format("HH:mm"),
      breakHours: 0,
      activity: quickActivity,
      title: quickTitle || undefined,
      project: quickProject || undefined,
      place: quickPlace || undefined,
      notes: quickNotes || undefined,
    });
    setQuickNotes("");
    await mutate();
    showToast("Stempling registrert");
  }

  // Quick stamp from FAB
  async function handleQuickStampFromFAB(template: any) {
    await createLog({
      date: dayjs().format("YYYY-MM-DD"),
      start: dayjs().format("HH:mm"),
      end: dayjs().format("HH:mm"),
      breakHours: 0,
      activity: template.activity,
      title: template.title || undefined,
      project: template.project || undefined,
      place: template.place || undefined,
      notes: undefined,
    });
    await mutate();
    showToast(`Stemplet inn: ${template.activity === 'Work' ? 'Arbeid' : 'Møte'}`);
  }

  // Stamp out from FAB
  async function handleStampOutFromFAB() {
    if (!activeStamp) return;
    await updateLog(activeStamp.id, {
      date: activeStamp.date,
      start: activeStamp.start_time?.slice(0,5),
      end: dayjs().format("HH:mm"),
      breakHours: 0,
      activity: activeStamp.activity as any,
      title: activeStamp.title || null,
      project: activeStamp.project || null,
      place: activeStamp.place || null,
      notes: activeStamp.notes || null,
      expenseCoverage: 0,
    });
    await mutate();
    showToast("Stemplet ut");
  }

  async function handleAddManual() {
    await createLog({
      date,
      start,
      end,
      breakHours: Number(breakHours) || 0,
      expenseCoverage: Number(expenseCoverage) || 0,
      activity: manualActivity,
      title: manualTitle || undefined,
      project: manualProject || undefined,
      place: manualPlace || undefined,
      notes: manualNotes || undefined,
    });
    // Clear form after submit
    setDate(dayjs().format("YYYY-MM-DD"));
    setStart(dayjs().format("HH:mm"));
    setEnd(dayjs().format("HH:mm"));
    setBreakHours(0);
    setExpenseCoverage(0);
    setManualTitle("");
    setManualProject("");
    setManualPlace("");
    setManualNotes("");
    await mutate();
    showToast("Rad lagt til");
  }

  async function handleDelete(row: LogRow) {
    await deleteLog(row.id);
    await mutate();
    setUndo({ type: "delete", row });
    const key = enqueueSnackbar("Rad slettet", {
      variant: "info",
      autoHideDuration: 5000,
      action: () => (
        <Button color="secondary" size="small" onClick={async () => { await handleUndo(); closeSnackbar(key as any); }}>Angre</Button>
      )
    } as any);
  }

  async function handleBulkDelete() {
    if (!confirm(`Sikker på at du vil slette ${selectedIds.size} rader?`)) return;
    for (const id of selectedIds) {
      await deleteLog(id);
    }
    await mutate();
    showToast(`${selectedIds.size} rader slettet`, "success");
    setSelectedIds(new Set());
    setBulkMode(false);
  }

  function toggleSelection(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  }

  function selectAll() {
    setSelectedIds(new Set(logs.map(l => l.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  const parentRef = useMemo(() => ({ current: null as any }), []);
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 8,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  function startEdit(r: LogRow) {
    setEditingId(r.id);
    setEditForm({
      date: r.date,
      start: r.start_time?.slice(0,5) || "",
      end: r.end_time?.slice(0,5) || "",
      breakHours: Number(r.break_hours || 0),
      expenseCoverage: Number(r.expense_coverage || 0),
      activity: (r.activity as any) || "Work",
      title: r.title || "",
      project: r.project || "",
      place: r.place || "",
      notes: r.notes || "",
    });
  }
  function cancelEdit() { setEditingId(null); setEditForm({}); }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to cancel edit
      if (e.key === 'Escape' && editingId) {
        cancelEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingId]);
  async function saveEdit(id: string, prevRow?: LogRow) {
    if (prevRow) {
      setUndo({ type: "update", id, prev: prevRow as any });
      const key = enqueueSnackbar("Endring lagret", {
        variant: "success",
        autoHideDuration: 5000,
        action: () => (
          <Button color="secondary" size="small" onClick={async () => { await handleUndo(); closeSnackbar(key as any); }}>Angre</Button>
        )
      } as any);
    }
    await updateLog(id, {
      ...editForm,
      title: editForm.title || null,
      project: editForm.project || null,
      place: editForm.place || null,
      notes: editForm.notes || null,
      expenseCoverage: editForm.expenseCoverage || 0,
    });
    await mutate();
    showToast("Rad oppdatert");
    cancelEdit();
  }

  // Infinite scroll: load previous month when near bottom
  useEffect(() => {
    const el = parentRef.current as HTMLElement | null;
    if (!el) return;
    function onScroll() {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && !isValidating) {
        setSize((s) => s + 1);
      }
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [parentRef, isValidating, setSize]);

  // Keyboard shortcuts for month navigation (only when not typing in input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === "ArrowLeft") updateSettings({month_nav: dayjs(monthNav + "01").subtract(1, "month").format("YYYYMM")});
      if (e.key === "ArrowRight") updateSettings({month_nav: dayjs(monthNav + "01").add(1, "month").format("YYYYMM")});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monthNav, updateSettings]);

  // Setup gate: redirect to /setup if no project info in database
  const router = useRouter();
  const [hasCheckedSetup, setHasCheckedSetup] = useState(false);
  const [hasInitializedMonth, setHasInitializedMonth] = useState(false);
  
  useEffect(() => {
    // Only check once when loading is complete
    if (!projectLoading && !hasCheckedSetup) {
      setHasCheckedSetup(true);
      if (!projectInfo) {
        router.replace('/setup');
      }
    }
  }, [projectInfo, projectLoading, router, hasCheckedSetup]);

  // Initialize month_nav from project periode if not set
  useEffect(() => {
    if (projectInfo && !settingsLoading && !hasInitializedMonth && (!monthNav || monthNav === dayjs().format("YYYYMM"))) {
      const periode = projectInfo.periode;
      if (periode) {
        // Try to parse periode like "Desember 2024", "Q1 2025", "Januar 2025", etc.
        const parsed = parsePeriodeToYYYYMM(periode);
        if (parsed && parsed !== monthNav) {
          updateSettings({ month_nav: parsed });
        }
      }
      setHasInitializedMonth(true);
    }
  }, [projectInfo, monthNav, settingsLoading, hasInitializedMonth, updateSettings]);

  // Helper to parse periode text to YYYYMM format
  function parsePeriodeToYYYYMM(periode: string): string | null {
    const lower = periode.toLowerCase().trim();
    
    // Norwegian month names
    const months: Record<string, string> = {
      'januar': '01', 'jan': '01',
      'februar': '02', 'feb': '02',
      'mars': '03', 'mar': '03',
      'april': '04', 'apr': '04',
      'mai': '05', 'may': '05',
      'juni': '06', 'jun': '06',
      'juli': '07', 'jul': '07',
      'august': '08', 'aug': '08',
      'september': '09', 'sep': '09',
      'oktober': '10', 'okt': '10', 'oct': '10',
      'november': '11', 'nov': '11',
      'desember': '12', 'des': '12', 'dec': '12',
    };
    
    // Extract year (4 digits)
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : dayjs().format('YYYY');
    
    // Try to find month name
    for (const [name, num] of Object.entries(months)) {
      if (lower.includes(name)) {
        return `${year}${num}`;
      }
    }
    
    // Check for Q1, Q2, Q3, Q4 format
    if (lower.match(/q[1-4]/)) {
      const quarter = lower.match(/q([1-4])/)?.[1];
      if (quarter) {
        const monthMap: Record<string, string> = { '1': '01', '2': '04', '3': '07', '4': '10' };
        return `${year}${monthMap[quarter]}`;
      }
    }
    
    return null;
  }

  // Mobile navigation handlers
  const handleMobileNavigate = (section: "home" | "logs" | "stats" | "settings") => {
    if (section === "settings") {
      setSettingsOpen(true);
      return;
    }
    const refs = {
      home: stemplingRef,
      logs: logsRef,
      stats: statsRef,
    };
    refs[section]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleMobileQuickAction = (action: "stamp-work" | "stamp-meeting" | "manual-entry" | "import") => {
    if (action === "stamp-work") {
      setQuickActivity("Work");
      stemplingRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "stamp-meeting") {
      setQuickActivity("Meeting");
      stemplingRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "manual-entry") {
      manualRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "import") {
      importRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Show loading state while checking project info to prevent flicker
  if (projectLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only" 
        style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
      >
        {isLoading ? 'Laster data...' : `${logs.length} loggføringer lastet for ${monthNav}`}
      </div>
      <MigrationBanner onComplete={() => mutateSettings()} />
      <Stack 
        direction={{ xs: "column", sm: "row" }} 
        justifyContent="space-between" 
        alignItems={{ xs: "stretch", sm: "center" }} 
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h4">Smart Stempling</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: "center", sm: "flex-end" }}>
          <IconButton onClick={useThemeMode().toggleMode} size="small" title="Bytt tema">
            {useThemeMode().mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          <Link href="/reports" passHref legacyBehavior>
            <Button 
              variant="outlined" 
              size="small"
              aria-label="Se rapporter"
              title="Se rapporter"
            >
              Rapporter
            </Button>
          </Link>
          <Link href="/setup" passHref legacyBehavior>
            <Button 
              variant="outlined" 
              size="small"
              aria-label="Rediger prosjektinformasjon"
              title="Rediger prosjektinformasjon"
            >
              Prosjekt
            </Button>
          </Link>
          <SettingsDrawer />
        </Stack>
      </Stack>

      {/* Project Info Banner */}
      {projectInfo && (
        <Card sx={{ mb: 2, bgcolor: 'rgba(25, 118, 210, 0.08)', borderLeft: 4, borderColor: 'primary.main' }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">Konsulent</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.konsulent}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">Bedrift</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.bedrift}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">Oppdragsgiver</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.oppdragsgiver}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Stack direction="row" spacing={1}>
                  {projectInfo.tiltak && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Tiltak</Typography>
                      <Typography variant="body2">{projectInfo.tiltak}</Typography>
                    </Box>
                  )}
                  {projectInfo.periode && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Periode</Typography>
                      <Typography variant="body2">{projectInfo.periode}</Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={4} ref={stemplingRef}>
          <Card>
            <CardHeader title="Stempling" />
            <CardContent>
              <Stack spacing={2}>
                {activeStamp && (
                  <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Stack spacing={1}>
                      <Typography variant="caption" color="success.dark" fontWeight="bold">
                        Stemplet inn: {activeStamp.start_time?.slice(0,5)} - {activeStamp.activity === 'Work' ? 'Arbeid' : 'Møte'}
                      </Typography>
                      <Typography variant="h4" color="success.dark" fontWeight="bold">
                        {elapsedTime}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                <FormControl fullWidth>
                  <InputLabel>Aktivitet</InputLabel>
                  <Select
                    label="Aktivitet"
                    value={quickActivity}
                    onChange={(e) => setQuickActivity(e.target.value as any)}
                  >
                    <MenuItem value="Work">Arbeid</MenuItem>
                    <MenuItem value="Meeting">Møte</MenuItem>
                  </Select>
                </FormControl>
                <TextField label="Tittel / Møte" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} fullWidth />
                <TextField label="Prosjekt / Kunde" value={quickProject} onChange={(e) => setQuickProject(e.target.value)} fullWidth />
                <TextField label="Sted / Modus" value={quickPlace} onChange={(e) => setQuickPlace(e.target.value)} fullWidth />
                <TextField label="Notater (valgfritt)" value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} multiline minRows={2} fullWidth />
                <Button 
                  variant="contained" 
                  onClick={handleQuickStamp}
                  size="large"
                  sx={{ py: 1.5 }}
                >
                  Stemple INN
                </Button>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {templates.map((t) => (
                    <Chip 
                      key={t.id}
                      label={t.label} 
                      size="small" 
                      onClick={() => {
                        setQuickActivity(t.activity);
                        setQuickTitle(t.title || '');
                        setQuickProject(t.project || '');
                        setQuickPlace(t.place || '');
                      }}
                      clickable
                      aria-label={`Bruk mal: ${t.label}`}
                    />
                  ))}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4} ref={manualRef}>
          <Card>
            <CardHeader title="Legg til manuelt" />
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField type="date" label="Dato" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} sx={{ flex: 1 }} />
                  <Chip label="I dag" size="small" onClick={() => setDate(dayjs().format("YYYY-MM-DD"))} />
                  <Chip label="I går" size="small" onClick={() => setDate(dayjs().subtract(1, 'day').format("YYYY-MM-DD"))} />
                </Stack>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => {
                    const lastEntry = logs.find(l => dayjs(l.date).isBefore(dayjs()));
                    if (lastEntry) {
                      setManualActivity(lastEntry.activity as any);
                      setStart(lastEntry.start_time?.slice(0,5) || "");
                      setEnd(lastEntry.end_time?.slice(0,5) || "");
                      setBreakHours(Number(lastEntry.break_hours || 0));
                      setManualTitle(lastEntry.title || "");
                      setManualProject(lastEntry.project || "");
                      setManualPlace(lastEntry.place || "");
                      showToast("Forrige rad kopiert");
                    } else {
                      showToast("Ingen tidligere rader funnet", "warning");
                    }
                  }}
                >
                  Kopier forrige rad
                </Button>
                <FormControl fullWidth>
                  <InputLabel>Aktivitet</InputLabel>
                  <Select
                    label="Aktivitet"
                    value={manualActivity}
                    onChange={(e) => setManualActivity(e.target.value as any)}
                  >
                    <MenuItem value="Work">Arbeid</MenuItem>
                    <MenuItem value="Meeting">Møte</MenuItem>
                  </Select>
                </FormControl>
                <Stack direction="row" spacing={2}>
                  <TextField type="time" label="Inn" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} fullWidth />
                  <TextField 
                    type="time" 
                    label="Ut" 
                    InputLabelProps={{ shrink: true }} 
                    value={end} 
                    onChange={(e) => setEnd(e.target.value)} 
                    fullWidth 
                    error={end < start && end !== "" && start !== ""}
                    helperText={end < start && end !== "" && start !== "" ? "Ut må være etter Inn" : ""}
                  />
                </Stack>
                <TextField type="number" label="Pause (timer)" value={breakHours} onChange={(e) => setBreakHours(Number(e.target.value))} fullWidth />
                <TextField 
                  type="number" 
                  label="Utgiftsdekning (kr)" 
                  value={expenseCoverage} 
                  onChange={(e) => setExpenseCoverage(Number(e.target.value) || 0)} 
                  fullWidth 
                  InputProps={{ inputProps: { min: 0, step: 10 } }}
                  aria-label="Utgiftsdekning i kroner"
                />
                <TextField label="Tittel / Møte" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} fullWidth />
                <TextField label="Prosjekt / Kunde" value={manualProject} onChange={(e) => setManualProject(e.target.value)} fullWidth />
                <TextField label="Sted / Modus" value={manualPlace} onChange={(e) => setManualPlace(e.target.value)} fullWidth />
                <TextField label="Notater" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} multiline minRows={2} fullWidth />
                <Button 
                  variant="contained" 
                  onClick={handleAddManual}
                  size="large"
                  sx={{ py: 1.5 }}
                >
                  Legg til
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4} ref={statsRef}>
          <Card>
            <CardHeader title="Månedsfilter og nøkkeltall" />
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" onClick={() => updateSettings({month_nav: dayjs(monthNav+"01").subtract(1, "month").format("YYYYMM")})}>{"<"}</Button>
                  <TextField label="Måned" value={monthNav} onChange={(e) => updateSettings({month_nav: e.target.value.replace(/[^0-9]/g, '').slice(0,6)})} />
                  <Button size="small" onClick={() => updateSettings({month_nav: dayjs(monthNav+"01").add(1, "month").format("YYYYMM")})}>{">"}</Button>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                  <Chip 
                    label="Uke"
                    size="small" 
                    onClick={() => updateViewMode('week')}
                    color={viewMode === 'week' ? "primary" : "default"}
                    variant={viewMode === 'week' ? "filled" : "outlined"}
                  />
                  <Chip 
                    label="Måned"
                    size="small" 
                    onClick={() => updateViewMode('month')}
                    color={viewMode === 'month' ? "primary" : "default"}
                    variant={viewMode === 'month' ? "filled" : "outlined"}
                  />
                  <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                  <Chip 
                    label="Denne måneden" 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      updateSettings({month_nav: dayjs().format("YYYYMM")});
                    }}
                    color={monthNav === dayjs().format("YYYYMM") ? "primary" : "default"}
                  />
                  <Chip 
                    label="Forrige måned" 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      updateSettings({month_nav: dayjs().subtract(1, "month").format("YYYYMM")});
                    }}
                    color={monthNav === dayjs().subtract(1, "month").format("YYYYMM") ? "primary" : "default"}
                  />
                  <Chip 
                    label="Dette året" 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      updateSettings({month_nav: dayjs().startOf("year").format("YYYYMM")});
                    }}
                  />
                </Stack>
                <Divider />
                <Typography variant="body2">Totale timer (man–fre)</Typography>
                <Typography variant="h4">{totalHours.toFixed(2)}</Typography>
                <Stack direction="row" spacing={2}>
                  <Box>
                    <Typography variant="body2">Arbeid</Typography>
                    <Typography variant="h6">{logs.filter(l => l.activity === "Work").length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2">Møter</Typography>
                    <Typography variant="h6">{logs.filter(l => l.activity === "Meeting").length}</Typography>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip label={paidBreak ? "Betalt pause" : "Ubetalt pause"} onClick={() => updateSettings({paid_break: !paidBreak})} />
                  <Typography variant="caption" color="text.secondary">Ved betalt pause trekkes ikke pause fra timene.</Typography>
                </Stack>
                <TextField
                  label="Timesats (kr/t)"
                  value={rateInput}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = sanitizeRateInput(e.target.value);
                    setRateInput(v);
                    const n = parseRate(v);
                    if (!isNaN(n)) updateSettings({ hourly_rate: n });
                  }}
                  onBlur={() => setRateInput(formatRate(rate))}
                />
                <Typography variant="body2">Estimert lønn (man–fre)</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {calcBusy && <CircularProgress size={16} />}
                  <Typography variant="h5">{(rate * totalHours).toLocaleString("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 })}</Typography>
                </Stack>
                <Typography variant="body2">Utgiftsdekning</Typography>
                <Typography variant="h6">{totalExpenses.toLocaleString("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 })}</Typography>
                <Typography variant="body2">Total utbetaling</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {calcBusy && <CircularProgress size={16} />}
                  <Typography variant="h5" color="primary">{(rate * totalHours + totalExpenses).toLocaleString("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 })}</Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  <FormControl sx={{ minWidth: 160 }}>
                    <InputLabel>Skatteprosent</InputLabel>
                    <Select
                      label="Skatteprosent"
                      value={String(taxPct)}
                      onChange={(e) => { updateSettings({tax_pct: Number(e.target.value)}); showToast("Skatteprosent oppdatert"); }}
                    >
                      {[20,25,30,35,40,45,50].map(p => (
                        <MenuItem key={p} value={String(p)}>{p}%</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box>
                    <Typography variant="body2">Sett av til skatt</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {calcBusy && <CircularProgress size={14} />}
                      <Typography variant="h6">{(rate * totalHours * (taxPct/100)).toLocaleString("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 })}</Typography>
                    </Stack>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button variant="outlined" color="warning" onClick={async () => { await deleteLogsMonth(dayjs().format("YYYYMM")); showToast("Denne måneden nullstilt", "success"); await mutate(); }}>Nullstill denne måneden</Button>
                  <Button variant="outlined" color="error" onClick={async () => { if (confirm("Sikker på at du vil slette hele datasettet?")) { await deleteLogsAll(); showToast("Hele datasettet er nullstilt", "success"); await mutate(); } }}>Nullstill hele datasettet</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <TemplateManager
            templates={templates}
            onCreate={createTemplate}
            onDelete={deleteTemplate}
            onToast={showToast}
          />
        </Grid>
        <Grid item xs={12} ref={importRef}>
          <Card>
            <CardHeader title="Importer timeplan (CSV)" />
            <CardContent>
              <CsvImport onImported={async () => { await mutate(); }} onToast={showToast} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Google Sheets Webhook (toveis)" />
            <CardContent>
              <WebhookSection onImported={async () => { await mutate(); }} onToast={showToast} settings={settings} updateSettings={updateSettings} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Legg inn hverdager for måned" />
            <CardContent>
              <MonthBulk onDone={async () => { await mutate(); }} onToast={showToast} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Send inn timeliste" />
            <CardContent>
              <SendTimesheet month={monthNav} onToast={showToast} settings={settings} updateSettings={updateSettings} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={3} ref={logsRef}>
        <Card>
          <CardHeader 
            title={`Logg for ${monthNav}`}
            action={
              <Stack direction="row" spacing={1}>
                {bulkMode && selectedIds.size > 0 && (
                  <Button 
                    variant="contained" 
                    color="error"
                    size="small" 
                    onClick={handleBulkDelete}
                  >
                    Slett {selectedIds.size}
                  </Button>
                )}
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    setSelectedIds(new Set());
                  }}
                >
                  {bulkMode ? 'Avbryt' : 'Velg flere'}
                </Button>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => exportToPDF(allLogs, monthNav, projectInfo, settings)}
                  disabled={allLogs.length === 0}
                >
                  Eksporter PDF
                </Button>
              </Stack>
            }
          />
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
              <TextField 
                placeholder="Søk i logger (tittel, prosjekt, sted, notater, aktivitet)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                size="small"
              />
              {bulkMode && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={selectAll}>Velg alle</Button>
                  <Button size="small" onClick={deselectAll}>Fjern alle</Button>
                </Stack>
              )}
            </Stack>
            <div style={{ height: 360, overflow: 'auto' }} ref={parentRef}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                <TableRow>
                  {bulkMode && <TableCell padding="checkbox" />}
                  <TableCell>Dato</TableCell>
                  <TableCell>Inn</TableCell>
                  <TableCell>Ut</TableCell>
                  <TableCell>Pause</TableCell>
                  <TableCell>Aktivitet</TableCell>
                  <TableCell>Tittel</TableCell>
                  <TableCell>Prosjekt</TableCell>
                  <TableCell>Sted</TableCell>
                  <TableCell>Notater</TableCell>
                  <TableCell align="right">Utgifter</TableCell>
                  <TableCell align="right">Handlinger</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((vi) => {
                    const r = logs[vi.index];
                    return (
                      <div key={r.id} style={{ position: 'absolute', top: vi.start, left: 0, right: 0 }}>
                        <TableRow hover>
                          {bulkMode && editingId !== r.id && (
                            <TableCell padding="checkbox">
                              <input 
                                type="checkbox" 
                                checked={selectedIds.has(r.id)} 
                                onChange={() => toggleSelection(r.id)}
                                style={{ cursor: 'pointer' }}
                              />
                            </TableCell>
                          )}
                          {editingId === r.id ? (
                            <>
                              {bulkMode && <TableCell />}
                              <TableCell><TextField type="date" value={editForm.date} onChange={(e)=>setEditForm({...editForm, date: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField type="time" value={editForm.start} onChange={(e)=>setEditForm({...editForm, start: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField type="time" value={editForm.end} onChange={(e)=>setEditForm({...editForm, end: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField type="number" value={editForm.breakHours} onChange={(e)=>setEditForm({...editForm, breakHours: Number(e.target.value)})} size="small" /></TableCell>
                              <TableCell>
                                <FormControl size="small" fullWidth>
                                  <Select value={editForm.activity} onChange={(e)=>setEditForm({...editForm, activity: e.target.value})}>
                                    <MenuItem value="Work">Arbeid</MenuItem>
                                    <MenuItem value="Meeting">Møte</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell><TextField value={editForm.title} onChange={(e)=>setEditForm({...editForm, title: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField value={editForm.project} onChange={(e)=>setEditForm({...editForm, project: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField value={editForm.place} onChange={(e)=>setEditForm({...editForm, place: e.target.value})} size="small" /></TableCell>
                              <TableCell><TextField value={editForm.notes} onChange={(e)=>setEditForm({...editForm, notes: e.target.value})} size="small" /></TableCell>
                              <TableCell align="right"><TextField type="number" value={editForm.expenseCoverage} onChange={(e)=>setEditForm({...editForm, expenseCoverage: Number(e.target.value)||0})} size="small" InputProps={{inputProps:{min:0}}} /></TableCell>
                              <TableCell align="right">
                                <IconButton aria-label="Lagre endringer" size="small" onClick={() => saveEdit(r.id, r)}><SaveIcon fontSize="small" /></IconButton>
                                <IconButton aria-label="Avbryt redigering" size="small" onClick={() => cancelEdit()}><CloseIcon fontSize="small" /></IconButton>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>{r.date}</TableCell>
                              <TableCell>{r.start_time?.slice(0,5)}</TableCell>
                              <TableCell>{r.end_time?.slice(0,5)}</TableCell>
                              <TableCell>{r.break_hours}</TableCell>
                              <TableCell>{r.activity}</TableCell>
                              <TableCell>{r.title}</TableCell>
                              <TableCell>{r.project}</TableCell>
                              <TableCell>{r.place}</TableCell>
                              <TableCell>{r.notes}</TableCell>
                              <TableCell align="right">{r.expense_coverage ? `${Number(r.expense_coverage).toLocaleString('no-NO')} kr` : '—'}</TableCell>
                              <TableCell align="right">
                                <IconButton aria-label="Rediger rad" size="small" onClick={() => startEdit(r)}><EditIcon fontSize="small" /></IconButton>
                                <IconButton aria-label="Slett rad" size="small" onClick={() => handleDelete(r)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      </div>
                    );
                  })}
                </div>
                {!isLoading && logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Typography variant="body2">Ingen rader i denne måneden enda.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Box>

      {/* Mobile Bottom Navigation - Hidden on desktop */}
      <MobileBottomNav
        onNavigate={handleMobileNavigate}
        onQuickAction={handleMobileQuickAction}
        currentSection="home"
      />

      {/* Add bottom padding for mobile nav */}
      <Box sx={{ height: 70, display: { xs: 'block', md: 'none' } }} />
      
      {/* Quick Stamp FAB (Mobile Only) */}
      <QuickStampFAB
        templates={templates}
        activeStamp={activeStamp}
        onStampIn={handleQuickStampFromFAB}
        onStampOut={handleStampOutFromFAB}
      />
    </Container>
  );
}
