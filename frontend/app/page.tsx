"use client";
import { useEffect, useMemo, useState, useRef, forwardRef, useDeferredValue } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { TableVirtuoso } from 'react-virtuoso';
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
  Switch,
  Checkbox,
  Skeleton,
  Tooltip,
  Collapse,
  useMediaQuery,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Fab,
} from "@mui/material";
import { useSnackbar } from "notistack";
import SettingsDrawer from "../components/SettingsDrawer";
import MigrationBanner from "../components/MigrationBanner";
import MobileBottomNav from "../components/MobileBottomNav";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SettingsIcon from "@mui/icons-material/Settings";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CircularProgress from "@mui/material/CircularProgress";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import RestoreIcon from "@mui/icons-material/Restore";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import StopIcon from "@mui/icons-material/Stop";
import TimerIcon from "@mui/icons-material/Timer";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { keyframes } from "@mui/material/styles";
import dayjs from "dayjs";
import { API_BASE, createLog, deleteLog, fetchLogs, createLogsBulk, webhookTestRelay, deleteLogsMonth, deleteLogsAll, updateLog, sendTimesheet, sendTimesheetViaGmail, getGoogleAuthStatus, generateMonthlyReport, type LogRow, archiveLog, unarchiveLog, archiveMonth } from "../lib/api";
import { exportToPDF } from "../lib/pdfExport";
import { useThemeMode } from "../components/ThemeRegistry";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import QuickStampFAB from "../components/QuickStampFAB";
import dynamic from 'next/dynamic';
const TemplateManager = dynamic(() => import('../components/TemplateManager'), { ssr: false });
const HoursBarChart = dynamic(() => import('../components/HoursBarChart'), { ssr: false });
const CalendarHeatmap = dynamic(() => import('../components/CalendarHeatmap'), { ssr: false });
import { useTranslations } from "../contexts/TranslationsContext";

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
  // Norwegian format uses comma as decimal separator (e.g., "1.234,56" or "500,00")
  // Remove any dots (thousand separator), then replace comma with dot for parseFloat
  const normalized = (text || "").replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}
function formatRate(n: number) {
  try { return nbFormatter.format(n || 0); } catch { return String(n || 0); }
}
// Safe number helpers to avoid NaN propagating into UI
const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const nokFmt = new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
const formatCurrency = (v: number) => nokFmt.format(safeNumber(v, 0));

// Pulse animation for active stamp
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

// Success animation
const successScale = keyframes`
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
`;

// Helper to format YYYYMM as "Month YYYY" in Norwegian
function formatMonthLabel(yyyymm: string): string {
  if (!yyyymm || yyyymm.length !== 6) return yyyymm;
  const year = yyyymm.slice(0, 4);
  const month = yyyymm.slice(4, 6);
  const monthNames = [
    "januar", "februar", "mars", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember"
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[monthIndex] || month;
  return `${monthName} ${year}`;
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
  const { t } = useTranslations();
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
      if (rows.length === 0) { onToast(t('import.none', 'Ingen rader å importere'), "warning"); return; }
      await createLogsBulk(rows);
      await onImported();
      onToast(`${t('import.done', 'Import fullført')}: ${rows.length} ${t('import.rows', 'rader')}`, "success");
      setFile(null);
    } catch (e:any) {
      onToast(`${t('import.failed', 'Import feilet')}: ${e?.message || e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2">{t('import.format_hint', 'Format: Dato, Inn, Ut, Pause, Aktivitet, Tittel, Prosjekt, Sted, Notater')}</Typography>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" component="label">
          {t('import.choose_file', 'Velg fil')}
          <input hidden type="file" accept=".csv,text/csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Button>
        <Typography sx={{ alignSelf: "center" }}>{file?.name ?? t('import.no_file', 'Ingen fil valgt')}</Typography>
      </Stack>
      {file && (
        <>
          <Stack direction="row" spacing={2}>
            <Chip label={`${t('import.total', 'Totalt')}: ${totalCount}`} />
            <Chip color={invalidCount ? "error" : "success"} label={`${t('import.invalid', 'Ugyldige')}: ${invalidCount}`} />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('table.date', 'Dato')}</TableCell>
                <TableCell>{t('table.in', 'Inn')}</TableCell>
                <TableCell>{t('table.out', 'Ut')}</TableCell>
                <TableCell>{t('table.break', 'Pause')}</TableCell>
                <TableCell>{t('table.activity', 'Aktivitet')}</TableCell>
                <TableCell>{t('table.title', 'Tittel')}</TableCell>
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
        <Chip label={ignoreWeekend ? t('import.ignore_weekend_on', 'Ignorer helg: På') : t('import.ignore_weekend_off', 'Ignorer helg: Av')} onClick={() => setIgnoreWeekend(!ignoreWeekend)} />
        <Button disabled={!file || busy || invalidCount > 0} variant="contained" onClick={handleImport}>{t('import.import', 'Importer')}</Button>
      </Stack>
    </Stack>
  );
}

function WebhookSection({ onImported, onToast, settings, updateSettings }: { onImported: () => Promise<void> | void, onToast: (msg: string, sev?: any) => void, settings: any, updateSettings: any }) {
  const { t } = useTranslations();
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
        <TextField label={t('fields.webhook_url', 'Webhook URL')} fullWidth value={webhookUrl} onChange={(e) => updateSettings({webhook_url: e.target.value})} />
        <TextField label={`${t('fields.google_sheets_url', 'Google Sheets URL')} (${t('placeholders.optional', 'valgfritt')})`} fullWidth value={sheetUrl} onChange={(e) => updateSettings({sheet_url: e.target.value})} />
      </Stack>
      <Stack direction="row" spacing={2}>
        <Chip label={active ? t('sync.enable_on', 'Aktiver synk: På') : t('sync.enable_off', 'Aktiver synk: Av')} onClick={() => updateSettings({webhook_active: !active})} />
        <Button disabled={!webhookUrl || busy} variant="outlined" onClick={async () => { await sendTest(); onToast(t('webhook.test_sent', 'Webhook testrad sendt')); }}>{t('webhook.send_test', 'Send testrad')}</Button>
        <Button disabled={!sheetUrl || busy} variant="outlined" onClick={importFromSheet}>{t('import.from_sheets', 'Importer fra Google Sheets')}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('import.sheet_note', 'Oppsett lagres i nettleseren. For import må arket være delt "Anyone with the link" eller publisert.')}</Typography>
    </Stack>
  );
}


function MonthBulk({ onDone, onToast }: { onDone: () => Promise<void> | void, onToast: (msg: string, sev?: any) => void }) {
  const { t } = useTranslations();
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
      if (rows.length === 0) { onToast(t('bulk.no_weekdays', 'Ingen hverdager i valgt måned'), "warning"); return; }
      await createLogsBulk(rows);
      onToast(`${t('bulk.inserted', 'Lagt inn')} ${rows.length} ${t('bulk.weekdays', 'hverdager')}`, "success");
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
        <TextField type="month" label={t('fields.month', 'Måned')} InputLabelProps={{ shrink: true }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <TextField type="time" label={t('fields.in', 'Inn')} InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField type="time" label={t('fields.out', 'Ut')} InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
        <TextField type="number" label={t('fields.break_hours', 'Pause (timer)')} value={breakHours} onChange={(e) => setBreakHours(Number(e.target.value) || 0)} />
        <FormControl>
          <InputLabel>{t('fields.activity', 'Aktivitet')}</InputLabel>
          <Select label={t('fields.activity', 'Aktivitet')} value={activity} onChange={(e) => setActivity(e.target.value as any)}>
            <MenuItem value="Work">{t('stats.work', 'Arbeid')}</MenuItem>
            <MenuItem value="Meeting">{t('stats.meetings', 'Møte')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField label={t('fields.title_meeting', 'Tittel / Møte')} value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
        <TextField label={t('fields.project_client', 'Prosjekt / Kunde')} value={project} onChange={(e) => setProject(e.target.value)} fullWidth />
        <TextField label={t('fields.place_mode', 'Sted / Modus')} value={place} onChange={(e) => setPlace(e.target.value)} fullWidth />
      </Stack>
      <Button variant="contained" onClick={handleInsert} disabled={busy}>{t('bulk.insert_month', 'Legg inn for hele måneden')}</Button>
    </Stack>
  );
}

function ReportGenerator({ month, onToast }: { month: string; onToast: (msg: string, sev?: any) => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [template, setTemplate] = useState<'auto' | 'standard' | 'miljøarbeider'>('auto');
  const [showComposer, setShowComposer] = useState(false);
  const [customIntro, setCustomIntro] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewChanges, setPreviewChanges] = useState<{ original: string; corrected: string; replacements: Array<{ from: string; to: string }> }>({ original: '', corrected: '', replacements: [] });

  // Function to detect potential names in text
  function detectPotentialNames(text: string): string[] {
    if (!text) return [];
    
    // Common Norwegian first names pattern: Capitalized word 2-15 chars
    const words = text.split(/\s+/);
    const potentialNames: string[] = [];
    
    // Norwegian name patterns
    const namePattern = /^[A-ZÆØÅ][a-zæøå]{1,14}$/;
    
    // Common words to exclude (not names)
    const excludeWords = new Set([
      'Dette', 'Denne', 'Gutten', 'Jenta', 'Brukeren', 'Deltakeren', 'Klienten',
      'Personen', 'Ungdom', 'Barnet', 'Familien', 'Gruppen', 'Aktivitet',
      'Møte', 'Arbeid', 'Rapport', 'Periode', 'Måned', 'I', 'Vi', 'De', 'Det',
      'En', 'Et', 'Og', 'Men', 'For', 'Med', 'Hos', 'Til', 'Fra', 'Om',
    ]);
    
    for (const word of words) {
      // Check if word matches name pattern and is not an excluded word
      if (namePattern.test(word) && !excludeWords.has(word)) {
        // Additional check: if followed by another capitalized word, likely a full name
        const index = words.indexOf(word);
        if (index < words.length - 1 && namePattern.test(words[index + 1])) {
          potentialNames.push(`${word} ${words[index + 1]}`);
        } else {
          potentialNames.push(word);
        }
      }
    }
    
    return [...new Set(potentialNames)];
  }

  // Check for names when text changes (miljøarbeider template only)
  useEffect(() => {
    if (template === 'miljøarbeider' || template === 'auto') {
      const introNames = detectPotentialNames(customIntro);
      const notesNames = detectPotentialNames(customNotes);
      setDetectedNames([...new Set([...introNames, ...notesNames])]);
    } else {
      setDetectedNames([]);
    }
  }, [customIntro, customNotes, template]);

  // Show preview of corrections
  function showCorrectionPreview() {
    let correctedIntro = customIntro;
    let correctedNotes = customNotes;
    const replacements: Array<{ from: string; to: string }> = [];

    function escapeRegExp(s: string) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // Function to determine appropriate replacement based on context
    function getReplacementTerm(name: string, context: string): string {
      const lowerContext = context.toLowerCase();
      const lowerName = name.toLowerCase();
      
      // Check if it's a full name (two words)
      const isFullName = name.split(' ').length === 2;
      
      // Context-based replacements
      if (lowerContext.includes('gutt') || lowerContext.includes('han ') || lowerContext.includes('hans ')) {
        return 'gutten';
      }
      if (lowerContext.includes('jent') || lowerContext.includes('hun ') || lowerContext.includes('hennes ')) {
        return 'jenta';
      }
      if (lowerContext.includes('barn')) {
        return 'barnet';
      }
      if (lowerContext.includes('ungdom')) {
        return 'ungdommen';
      }
      if (lowerContext.includes('familie')) {
        return 'familien';
      }
      if (lowerContext.includes('klient') || lowerContext.includes('bruker')) {
        return 'brukeren';
      }
      if (lowerContext.includes('deltaker')) {
        return 'deltakeren';
      }
      
      // Default replacements based on name characteristics
      // Try to preserve capitalization of first letter if at sentence start
      const escapedName = escapeRegExp(name);
      const isStartOfSentence = new RegExp(`[.?!]\\s*${escapedName}`).test(context);
      const defaultTerm = isFullName ? 'Brukeren' : 'personen';
      
      return isStartOfSentence ? defaultTerm.charAt(0).toUpperCase() + defaultTerm.slice(1) : defaultTerm;
    }
    
    // Replace names and track changes
    detectedNames.forEach(name => {
      const escapedName = escapeRegExp(name);
      const introContextMatch = customIntro.match(new RegExp(`.{0,50}${escapedName}.{0,50}`, 'i'));
      const introContext = introContextMatch ? introContextMatch[0] : '';
      const introReplacement = getReplacementTerm(name, introContext);
      
      if (correctedIntro.includes(name)) {
        replacements.push({ from: name, to: introReplacement });
        correctedIntro = correctedIntro.replace(new RegExp(escapedName, 'g'), introReplacement);
      }
    });
    
    detectedNames.forEach(name => {
      const escapedName = escapeRegExp(name);
      const notesContextMatch = customNotes.match(new RegExp(`.{0,50}${escapedName}.{0,50}`, 'i'));
      const notesContext = notesContextMatch ? notesContextMatch[0] : '';
      const notesReplacement = getReplacementTerm(name, notesContext);
      
      if (correctedNotes.includes(name)) {
        if (!replacements.find(r => r.from === name)) {
          replacements.push({ from: name, to: notesReplacement });
        }
        correctedNotes = correctedNotes.replace(new RegExp(escapedName, 'g'), notesReplacement);
      }
    });
    
    // Combine intro and notes for preview
    const originalText = `${customIntro}\n\n${customNotes}`.trim();
    const correctedText = `${correctedIntro}\n\n${correctedNotes}`.trim();
    
    setPreviewChanges({ original: originalText, corrected: correctedText, replacements });
    setShowPreview(true);
  }
  
  // Apply the corrections
  function applyCorrections() {
    const lines = previewChanges.corrected.split('\n\n');
    setCustomIntro(lines[0] || '');
    setCustomNotes(lines[1] || '');
    setShowPreview(false);
    onToast(t('reports.names_replaced', 'Navn erstattet med generelle betegnelser'), 'success');
  }

  // Check Google auth status on mount
  useEffect(() => {
    (async () => {
      try {
        const status = await getGoogleAuthStatus();
        setGoogleConnected(status.isConnected && !status.needsReauth);
      } catch (e) {
        console.error('Failed to check Google auth:', e);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  async function handleGenerateReport() {
    setBusy(true);
    try {
      const result = await generateMonthlyReport({
        month,
        template,
        customIntro: customIntro.trim() || undefined,
        customNotes: customNotes.trim() || undefined,
      });
      onToast(`Rapport opprettet! Åpnes i ny fane...`, 'success');
      // Open document in new tab
      window.open(result.documentUrl, '_blank');
      // Reset composer
      setShowComposer(false);
      setCustomIntro('');
      setCustomNotes('');
    } catch (e: any) {
      onToast(`Kunne ikke generere rapport: ${e?.message || e}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (checkingAuth) {
    return <CircularProgress size={24} />;
  }

  if (!googleConnected) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('reports.connect_google', 'Koble til Google-kontoen din for å generere rapporter.')}
      </Typography>
    );
  }

  if (!showComposer) {
    return (
      <Stack spacing={2}>
        <Typography variant="body2">
          {t('reports.description', 'Generer en profesjonell månedsrapport i Google Docs med prosjektinfo, statistikk og detaljert logg.')}
        </Typography>
        <Button 
          variant="contained" 
          onClick={() => setShowComposer(true)}
        >
          {t('reports.write', 'Skriv rapport')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h6" sx={{ flex: 1 }}>{t('reports.composer_title', 'Rapportsammenstilling')}</Typography>
        <Button size="small" onClick={() => setShowComposer(false)}>{t('common.cancel', 'Avbryt')}</Button>
      </Stack>

      {/* Template Selection */}
      <FormControl fullWidth>
        <InputLabel>{t('reports.template_label', 'Rapportmal')}</InputLabel>
        <Select
          label={t('reports.template_label', 'Rapportmal')}
          value={template}
          onChange={(e) => setTemplate(e.target.value as any)}
        >
          <MenuItem value="auto">{t('reports.template_auto', 'Automatisk (basert på prosjekt)')}</MenuItem>
          <MenuItem value="standard">{t('reports.template_standard', 'Standard')}</MenuItem>
          <MenuItem value="miljøarbeider">{t('reports.template_social', 'Miljøarbeider / Sosialarbeider')}</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary">
        {template === 'auto' && t('reports.template_hint_auto', 'Malen velges automatisk basert på din rolle i prosjektet.')}
        {template === 'standard' && t('reports.template_hint_standard', 'Standard rapport med fokus på arbeidstimer og møter.')}
        {template === 'miljøarbeider' && t('reports.template_hint_social', 'Aktivitetsrapport med fokus på klientmøter og sosiale aktiviteter.')}
      </Typography>
      
      {/* Privacy Guidelines for Miljøarbeider */}
      {(template === 'miljøarbeider' || (template === 'auto' && true)) && (
        <Stack spacing={1} sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('reports.privacy_header', '⚠️ Personvernretningslinjer for miljøarbeider')}</Typography>
          <Typography variant="body2" component="div">
            <strong>{t('reports.important', 'Viktig')}:</strong> {t('reports.no_personal_data', 'Rapporter skal ikke inneholde personopplysninger.')}
          </Typography>
          <Typography variant="body2" component="div">
            • {t('reports.no_names', 'Ikke bruk navn på klienter')}<br/>
            • {t('reports.use_generic_terms', 'Bruk heller generelle betegnelser: "Gutten", "Jenta", "Brukeren", "Deltakeren"')}<br/>
            • {t('reports.avoid_identifying_details', 'Unngå detaljer som kan identifisere personer (alder, adresse, spesifikke situasjoner)')}<br/>
            • {t('reports.focus_on_activities_development', 'Fokuser på aktiviteter og utvikling, ikke identitet')}<br/>
            • {t('reports.consider_anonymizing_places', 'Vurder anonymisering av steder hvis nødvendig')}
          </Typography>
          <Typography variant="caption" sx={{ fontStyle: 'italic', mt: 1 }}>
            {t('reports.gdpr_footer', 'Disse retningslinjene sikrer GDPR-etterlevelse og beskytter klientenes personvern.')}
          </Typography>
        </Stack>
      )}
      
      {/* Name Detection Warning */}
      {detectedNames.length > 0 && (template === 'miljøarbeider' || template === 'auto') && (
        <Stack spacing={2} sx={{ 
          p: 2, 
          bgcolor: 'error.light', 
          borderRadius: 1, 
          border: '2px solid', 
          borderColor: 'error.main',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.8 },
          },
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'error.dark' }}>
            {t('reports.names_warning_title', '🚨 ADVARSEL: Mulige navn oppdaget!')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'error.dark' }}>
            {t('reports.names_warning_text', 'Teksten din ser ut til å inneholde navn som kan identifisere personer:')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
            {detectedNames.map((name, idx) => (
              <Chip 
                key={idx} 
                label={name} 
                color="error" 
                size="small"
                sx={{ fontWeight: 'bold' }}
              />
            ))}
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.dark' }}>
            {t('reports.names_auto_replace_question', 'Skal vi automatisk erstatte disse navnene med generelle betegnelser?')}
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button 
              variant="contained" 
              color="success"
              size="small"
              onClick={showCorrectionPreview}
              sx={{ fontWeight: 'bold' }}
>
              {t('reports.fix_auto_button', '✅ Fiks automatisk')}
            </Button>
            <Typography variant="caption" sx={{ alignSelf: 'center', color: 'error.dark', fontStyle: 'italic' }}>
              {t('reports.example_replacement', 'Eksempel')}: "{detectedNames[0]}" → "{t('reports.example_boy', 'Gutten')}" / "{t('reports.example_girl', 'Jenta')}" / "{t('reports.example_user', 'Brukeren')}"
            </Typography>
          </Stack>
        </Stack>
      )}

      <Divider />

      {/* Custom Introduction */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{t('reports.intro_optional', 'Innledning (valgfritt)')}</Typography>
        <TextField
          multiline
          rows={4}
          placeholder={
            template === 'miljøarbeider' ?
            t('reports.intro_placeholder_social', "Skriv en innledning til rapporten...\n\nEksempel: I løpet av denne perioden har jeg jobbet med flere brukere gjennom ulike aktiviteter. Fokuset har vært på sosial utvikling og hverdagsmestring.\n\nHusk: Unngå navn og identifiserbar informasjon.") :
            t('reports.intro_placeholder_standard', "Skriv en innledning til rapporten... \n\nEksempel: Dette er en oppsummering av mine aktiviteter i løpet av måneden. Jeg har fokusert på...")
          }
          value={customIntro}
          onChange={(e) => setCustomIntro(e.target.value)}
          fullWidth
          inputProps={{
            spellCheck: true,
            lang: 'nb-NO',
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {t('reports.intro_hint', 'Innledningen vises øverst i rapporten, før prosjektinformasjonen.')}
          {template === 'miljøarbeider' && ` ${t('reports.intro_anonymize_hint', 'Husk å anonymisere all informasjon.')}`}
        </Typography>
      </Stack>

      {/* Preview Info */}
      <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="subtitle2">{t('reports.will_include', 'Rapporten vil inneholde:')}</Typography>
        <Typography variant="body2" component="div">
          • {t('reports.includes_title_month', 'Tittel og måned')} ({month.slice(0,4)}-{month.slice(4,6)})<br/>
          {customIntro && `• ${t('reports.includes_custom_intro', 'Din egendefinerte innledning')}\n`}
          • {t('reports.includes_project_info', 'Prosjektinformasjon')}<br/>
          • {t('reports.includes_summary', 'Sammendrag (timer, dager, aktiviteter)')}<br/>
          • {t('reports.includes_detailed_log', 'Detaljert logg med alle registreringer')}<br/>
          {customNotes && `• ${t('reports.includes_custom_notes', 'Dine tilleggsnotater')}`}
        </Typography>
      </Stack>

      {/* Custom Notes */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{t('reports.notes_optional', 'Tilleggsnotater (valgfritt)')}</Typography>
        <TextField
          multiline
          rows={4}
          placeholder={
            template === 'miljøarbeider' ?
            t('reports.notes_placeholder_social', "Legg til notater på slutten av rapporten...\n\nEksempel: Generelle observasjoner om fremgang, utfordringer i arbeidet, behov for oppfølging, samarbeidspartnere involvert, etc.\n\nHusk: Ikke inkluder personidentifiserbar informasjon.") :
            t('reports.notes_placeholder_standard', "Legg til notater på slutten av rapporten...\n\nEksempel: Refleksjoner, utfordringer, planlagte tiltak for neste måned, etc.")
          }
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
          fullWidth
          inputProps={{
            spellCheck: true,
            lang: 'nb-NO',
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {t('reports.notes_hint', 'Notater vises nederst i rapporten, etter den detaljerte loggen.')}
          {template === 'miljøarbeider' && ` ${t('reports.notes_social_hint', 'Fokuser på generelle mønstre og utvikling, ikke individuelle detaljer.')}`}
        </Typography>
      </Stack>

      {/* Generate Button */}
      <Stack direction="row" spacing={2}>
        <Button 
          variant="contained" 
          onClick={handleGenerateReport} 
          disabled={busy || (detectedNames.length > 0 && (template === 'miljøarbeider' || template === 'auto'))}
          startIcon={busy ? <CircularProgress size={16} /> : null}
          fullWidth
          color={detectedNames.length > 0 && (template === 'miljøarbeider' || template === 'auto') ? 'error' : 'primary'}
>
          {busy ? t('common.generating', 'Genererer...') : detectedNames.length > 0 && (template === 'miljøarbeider' || template === 'auto') ? t('reports.remove_names_first', 'Fjern navn før generering') : t('reports.generate_docs', 'Generer Google Docs rapport')}
        </Button>
      </Stack>
      
      {detectedNames.length > 0 && (template === 'miljøarbeider' || template === 'auto') && (
        <Typography variant="caption" color="error" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
          {t('reports.cannot_generate_with_pii', '⚠️ Kan ikke generere rapport med personidentifiserbar informasjon')}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('reports.docs_footer', 'Rapporten opprettes som et nytt Google Docs-dokument som du kan redigere videre.')}
      </Typography>
      
      {/* Preview Dialog */}
      <Dialog open={showPreview} onClose={() => setShowPreview(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h6">{t('reports.preview_changes', '🔍 Forhåndsvisning av endringer')}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <Typography variant="body2">
              {t('reports.names_to_replace', 'Følgende navn vil bli erstattet med generelle betegnelser:')}
            </Typography>
            
            {/* Replacements list */}
            <Stack spacing={1}>
              {previewChanges.replacements.map((replacement, idx) => (
                <Stack key={idx} direction="row" spacing={2} alignItems="center" sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Chip label={replacement.from} color="error" size="small" sx={{ textDecoration: 'line-through' }} />
                  <Typography>→</Typography>
                  <Chip label={replacement.to} color="success" size="small" sx={{ fontWeight: 'bold' }} />
                </Stack>
              ))}
            </Stack>
            
            {/* Text preview with highlighting */}
            <Stack spacing={2}>
              <Typography variant="subtitle2">{t('reports.text_with_changes', 'Tekst med endringer markert:')}</Typography>
              <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', maxHeight: 300, overflow: 'auto' }}>
                <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                  {previewChanges.corrected.split(new RegExp(`(${previewChanges.replacements.map(r => r.to).join('|')})`, 'g')).map((part, idx) => {
                    const isReplacement = previewChanges.replacements.some(r => r.to === part);
                    return isReplacement ? (
                      <span key={idx} style={{ backgroundColor: '#4caf50', color: 'white', padding: '2px 4px', borderRadius: '3px', fontWeight: 'bold' }}>
                        {part}
                      </span>
                    ) : (
                      <span key={idx}>{part}</span>
                    );
                  })}
                </Typography>
              </Box>
            </Stack>
            
            {/* Action buttons */}
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={() => setShowPreview(false)} variant="outlined">
                {t('common.cancel', 'Avbryt')}
              </Button>
              <Button onClick={applyCorrections} variant="contained" color="success">
                {t('reports.accept_changes', '✅ Godta endringer')}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function SendTimesheet({ month, onToast, settings, updateSettings }: { month: string; onToast: (msg: string, sev?: any) => void; settings: any; updateSettings: any }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [useGmail, setUseGmail] = useState(false);
  // Local, non-persisted form state to avoid lag while typing
  const [sender, setSender] = useState<string>(settings?.timesheet_sender || '');
  const [recipient, setRecipient] = useState<string>(settings?.timesheet_recipient || '');
  const [format, setFormat] = useState<'xlsx' | 'pdf'>(settings?.timesheet_format || 'xlsx');
  const [smtpPass, setSmtpPass] = useState<string>(settings?.smtp_app_password || '');
  // Sync when settings change externally (e.g., after save elsewhere)
  useEffect(() => {
    setSender(settings?.timesheet_sender || '');
    setRecipient(settings?.timesheet_recipient || '');
    setFormat((settings?.timesheet_format as 'xlsx' | 'pdf') || 'xlsx');
    setSmtpPass(settings?.smtp_app_password || '');
  }, [settings]);

  // Check Google auth status on mount
  useEffect(() => {
    (async () => {
      try {
        const status = await getGoogleAuthStatus();
        setGoogleConnected(status.isConnected && !status.needsReauth);
        if (status.isConnected && !status.needsReauth) {
          setUseGmail(true); // Default to Gmail if connected
        }
      } catch (e) {
        console.error('Failed to check Google auth:', e);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  async function handleSendGmail() {
    setBusy(true);
    try {
      await sendTimesheetViaGmail({ month, recipientEmail: recipient, format });
      onToast(t('timesheet.sent_via_gmail', 'Timeliste sendt via Gmail'), 'success');
    } catch (e:any) {
      onToast(`${t('timesheet.send_failed', 'Kunne ikke sende')}: ${e?.message || e}`, 'error');
    } finally { setBusy(false); }
  }

  async function handleSendSMTP() {
    setBusy(true);
    try {
      await sendTimesheet({ month, senderEmail: sender, recipientEmail: recipient, format });
      onToast(t('timesheet.sent_via_smtp', 'Timeliste sendt via SMTP'), 'success');
    } catch (e:any) {
      onToast(`${t('timesheet.send_failed', 'Kunne ikke sende')}: ${e?.message || e}`, 'error');
    } finally { setBusy(false); }
  }

  if (checkingAuth) {
    return <CircularProgress size={24} />;
  }

  return (
    <Stack spacing={2}>
      {googleConnected && (
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip label={t('gmail.connected', 'Google-konto tilkoblet')} color="success" size="small" />
          <FormControl size="small">
            <InputLabel>{t('timesheet.method', 'Sendemetode')}</InputLabel>
            <Select label={t('timesheet.method', 'Sendemetode')} value={useGmail ? 'gmail' : 'smtp'} onChange={(e)=>setUseGmail(e.target.value === 'gmail')}>
              <MenuItem value="gmail">{t('timesheet.gmail_recommended', 'Gmail (anbefalt)')}</MenuItem>
              <MenuItem value="smtp">SMTP</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      )}
      
      {useGmail && googleConnected ? (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label={t('fields.recipient_email', 'Mottaker e-post')}
              value={recipient}
              onChange={(e)=> setRecipient(e.target.value)}
              onBlur={() => updateSettings({ timesheet_recipient: recipient })}
              fullWidth
            />
            <FormControl>
              <InputLabel>{t('fields.format', 'Format')}</InputLabel>
              <Select
                label={t('fields.format', 'Format')}
                value={format}
                onChange={(e)=> { const v = e.target.value as 'xlsx' | 'pdf'; setFormat(v); updateSettings({timesheet_format: v}); }}
              >
                <MenuItem value="xlsx">XLSX</MenuItem>
                <MenuItem value="pdf">PDF</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Button variant="contained" onClick={handleSendGmail} disabled={busy || !recipient}>{t('timesheet.send_via_gmail', 'Send via Gmail')}</Button>
          <Typography variant="caption" color="text.secondary">{t('timesheet.gmail_note', 'E-posten sendes fra din tilkoblede Google-konto.')}</Typography>
        </>
      ) : (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label={t('fields.sender_email', 'Avsender e-post')}
              value={sender}
              onChange={(e)=> setSender(e.target.value)}
              onBlur={() => updateSettings({ timesheet_sender: sender })}
              fullWidth
            />
            <TextField
              label={t('fields.recipient_email', 'Mottaker e-post')}
              value={recipient}
              onChange={(e)=> setRecipient(e.target.value)}
              onBlur={() => updateSettings({ timesheet_recipient: recipient })}
              fullWidth
            />
            <FormControl>
              <InputLabel>{t('fields.format', 'Format')}</InputLabel>
              <Select
                label={t('fields.format', 'Format')}
                value={format}
                onChange={(e)=> { const v = e.target.value as 'xlsx' | 'pdf'; setFormat(v); updateSettings({timesheet_format: v}); }}
              >
                <MenuItem value="xlsx">XLSX</MenuItem>
                <MenuItem value="pdf">PDF</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <TextField
            type="password"
            label={t('fields.smtp_app_password', 'App-passord (SMTP)')}
            value={smtpPass}
            onChange={(e)=> setSmtpPass(e.target.value)}
            onBlur={() => updateSettings({ smtp_app_password: smtpPass })}
            fullWidth
          />
          <Button variant="contained" onClick={handleSendSMTP} disabled={busy || !sender || !recipient}>{t('timesheet.send_via_smtp', 'Send via SMTP')}</Button>
          <Typography variant="caption" color="text.secondary">
            {googleConnected ? t('timesheet.smtp_mode', 'SMTP-modus: ') : t('timesheet.connect_google_hint', 'Koble til Google-kontoen din for enklere sending, eller ')}
            {t('timesheet.smtp_hint', 'Vi gjetter SMTP basert på e-post (Gmail/Outlook/Yahoo/iCloud/Proton m.fl.). Bruk app-passord for Gmail/Outlook.')}
          </Typography>
        </>
      )}
    </Stack>
  );
}

// Lightweight client-only lazy mount (no code-splitting, defers rendering until visible)
function LazyMount({ children, rootMargin = '200px' }: { children: React.ReactNode; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined' || !("IntersectionObserver" in window)) {
      setShow(true);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShow(true);
        obs.disconnect();
      }
    }, { rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return <div ref={ref}>{show ? children : <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} /></Box>}</div>;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const { mode, toggleMode } = useThemeMode();
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
      showToast(`${t('common.save_failed', 'Feil ved lagring')}: ${e?.message || e}`, 'error');
    }
  };

  type UndoAction =
    | { type: "delete"; row: LogRow }
    | { type: "update"; id: string; prev: Partial<LogRow & { start: string; end: string; breakHours: number }> };
  const [undo, setUndo] = useState<UndoAction | null>(null);
  
  // Auto-clear undo after 10 seconds
  useEffect(() => {
    if (!undo) return;
    const timeout = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(timeout);
  }, [undo]);
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
      showToast(t('common.deletion_undone', 'Sletting angret'));
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
      showToast(t('common.change_undone', 'Endring angret'));
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'week'>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem('view_mode') : null;
      if (v === 'month' || v === 'week') return v;
    } catch { void 0; }
    return 'month';
  });
  const [monthInput, setMonthInput] = useState<string>(settings?.month_nav || dayjs().format("YYYYMM"));
  useEffect(() => { setMonthInput(settings?.month_nav || dayjs().format("YYYYMM")); }, [settings?.month_nav]);
  
  // Sync view mode from settings (server wins and updates localStorage)
  useEffect(() => {
    if (settings?.view_mode === 'month' || settings?.view_mode === 'week') {
      setViewMode(settings.view_mode);
      try { if (typeof window !== 'undefined') window.localStorage.setItem('view_mode', settings.view_mode); } catch { void 0; }
    }
  }, [settings?.view_mode]);
  
  // Update view mode in database
  const updateViewMode = async (mode: 'month' | 'week') => {
    setViewMode(mode);
    try { if (typeof window !== 'undefined') window.localStorage.setItem('view_mode', mode); } catch { void 0; }
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
  const rateForCalc = (() => { const n = parseRate(rateInput.replace(/\s/g, '')); return Number.isFinite(n) ? n : rate; })();
  const [paidBreakLocal, setPaidBreakLocal] = useState<boolean>(!!settings?.paid_break);
  useEffect(() => { setPaidBreakLocal(!!settings?.paid_break); }, [settings?.paid_break]);
  const [taxPctLocal, setTaxPctLocal] = useState<number>(Number(settings?.tax_pct) || 35);
  useEffect(() => { setTaxPctLocal(Number(settings?.tax_pct) || 35); }, [settings?.tax_pct]);
  const monthNav = settings?.month_nav || dayjs().format("YYYYMM");
  const [calcBusy, setCalcBusy] = useState(false);
  const [showArchivedLocal, setShowArchivedLocal] = useState<boolean>(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('show_archived') : null;
      if (stored != null) return stored === 'true';
    } catch { void 0; }
    const s = (settings as any)?.show_archived;
    return typeof s === 'boolean' ? s : false;
  });
  useEffect(() => {
    if (typeof settings?.show_archived === 'boolean') {
      setShowArchivedLocal(!!settings.show_archived);
      try { if (typeof window !== 'undefined') localStorage.setItem('show_archived', String(!!settings.show_archived)); } catch { void 0; }
    }
  }, [settings?.show_archived]);
  const getKey = (index: number) => {
    const m = dayjs(monthNav + "01").subtract(index, "month").format("YYYYMM");
    return ["logs", m, showArchivedLocal ? 'archived' : 'active'] as const;
  };
  const { data, isLoading, isValidating, mutate, size, setSize } = useSWRInfinite(
    getKey,
    ([, m]) => fetchLogs(m, showArchivedLocal),
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
    
    // Apply search filter (debounced)
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      filtered = filtered.filter(l => 
        l.title?.toLowerCase().includes(q) ||
        l.project?.toLowerCase().includes(q) ||
        l.place?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q) ||
        l.activity?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [allLogs, deferredSearch, viewMode]);
  const totalHours = useMemo(() => {
    return logs.reduce((sum, r) => {
      const d = dayjs(r.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return sum; // Mon–Fri only
      const start = dayjs(`${r.date} ${r.start_time}`);
      const end = dayjs(`${r.date} ${r.end_time}`);
      const breakUsed = paidBreakLocal ? 0 : safeNumber(r.break_hours, 0);
      const minutes = end.diff(start, 'minute');
      const diffHours = minutes / 60 - breakUsed;
      if (!Number.isFinite(diffHours) || diffHours <= 0) return sum;
      return sum + diffHours;
    }, 0);
  }, [logs, paidBreak]);
  
  const totalExpenses = useMemo(() => {
    return logs.reduce((sum, r) => {
      const d = dayjs(r.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return sum; // Mon–Fri only
      const val = safeNumber(r.expense_coverage, 0);
      return sum + val;
    }, 0);
  }, [logs]);
  useEffect(() => {
    setCalcBusy(true);
    const t = setTimeout(() => setCalcBusy(false), 150);
    return () => clearTimeout(t);
  }, [taxPctLocal, rateForCalc, paidBreakLocal, logs]);

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
    showToast(t('home.stamp_recorded', 'Stempling registrert'));
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
    showToast(`${t('home.stamped_in', 'Stemplet inn')}: ${template.activity === 'Work' ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}`);
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
    showToast(t('home.stamped_out', 'Stemplet ut'));
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
    showToast(t('home.row_added', 'Rad lagt til'));
  }

  async function handleDelete(row: LogRow) {
    await deleteLog(row.id);
    await mutate();
    setUndo({ type: "delete", row });
    const key = enqueueSnackbar(t('home.row_deleted', 'Rad slettet'), {
      variant: "info",
      autoHideDuration: 5000,
      action: () => (
        <Button color="secondary" size="small" onClick={async () => { await handleUndo(); closeSnackbar(key as any); }}>{t('common.undo', 'Angre')}</Button>
      )
    } as any);
  }

  async function handleBulkDelete() {
    if (!confirm(`${t('confirm.delete_rows', 'Sikker på at du vil slette')} ${selectedIds.size} ${t('table.rows', 'rader')}?`)) return;
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
      const key = enqueueSnackbar(t('home.change_saved', 'Endring lagret'), {
        variant: "success",
        autoHideDuration: 5000,
        action: () => (
          <Button color="secondary" size="small" onClick={async () => { await handleUndo(); closeSnackbar(key as any); }}>{t('common.undo', 'Angre')}</Button>
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
    showToast(t('home.row_updated', 'Rad oppdatert'));
    cancelEdit();
  }


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
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Skeleton variant="text" width="40%" height={40} />
          <Skeleton variant="rectangular" height={120} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Skeleton variant="rectangular" height={400} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Skeleton variant="rectangular" height={400} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Skeleton variant="rectangular" height={400} />
            </Grid>
          </Grid>
          <Skeleton variant="rectangular" height={500} />
        </Stack>
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
        {isLoading ? t('aria.loading', 'Laster data...') : `${logs.length} ${t('aria.logs_loaded', 'loggføringer lastet for')} ${monthNav}`}
      </div>
      <MigrationBanner onComplete={() => mutateSettings()} />
      <Stack 
        direction={{ xs: "column", sm: "row" }} 
        justifyContent="space-between" 
        alignItems={{ xs: "stretch", sm: "center" }} 
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h4">{t('app.name', 'Smart Stempling')}</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: "center", sm: "flex-end" }}>
          <IconButton onClick={toggleMode} size="small" title={t('tooltips.switch_theme', 'Bytt tema')} aria-label={t('tooltips.switch_theme', 'Bytt tema')}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          <Link href="/reports" passHref legacyBehavior>
            <Button 
              variant="outlined" 
              size="small"
              aria-label={t('tooltips.view_reports', 'Se rapporter')}
              title={t('tooltips.view_reports', 'Se rapporter')}
>
              {t('nav.reports', 'Rapporter')}
            </Button>
          </Link>
          <Link href="/setup" passHref legacyBehavior>
            <Button 
              variant="outlined" 
              size="small"
              aria-label={t('tooltips.edit_project_info', 'Rediger prosjektinformasjon')}
              title={t('tooltips.edit_project_info', 'Rediger prosjektinformasjon')}
>
              {t('nav.project', 'Prosjekt')}
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
                <Typography variant="caption" color="text.secondary">{t('project_info.consultant', 'Konsulent')}</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.konsulent}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">{t('project_info.company', 'Bedrift')}</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.bedrift}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">{t('project_info.client', 'Oppdragsgiver')}</Typography>
                <Typography variant="body1" fontWeight="medium">{projectInfo.oppdragsgiver}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Stack direction="row" spacing={1}>
                  {projectInfo.tiltak && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">{t('project_info.measure', 'Tiltak')}</Typography>
                      <Typography variant="body2">{projectInfo.tiltak}</Typography>
                    </Box>
                  )}
                  {projectInfo.periode && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">{t('project_info.period', 'Periode')}</Typography>
                      <Typography variant="body2">{projectInfo.periode}</Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={{ xs: 3, sm: 2 }}>
        <Grid item xs={12} lg={4} ref={stemplingRef}>
          <Card>
            <CardHeader title={t('home.stamping', 'Stempling')} />
            <CardContent>
              <Stack spacing={2}>
                {activeStamp && (
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'success.light', 
                    borderRadius: 1,
                    animation: `${pulse} 2s infinite`,
                    border: 2,
                    borderColor: 'success.main'
                  }}>
                    <Stack spacing={1}>
                      <Typography variant="caption" color="success.dark" fontWeight="bold">
                        {t('home.stamped_in', 'Stemplet inn')}: {activeStamp.start_time?.slice(0,5)} - {activeStamp.activity === 'Work' ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}
                      </Typography>
                      <Typography variant="h4" color="success.dark" fontWeight="bold">
                        {elapsedTime}
                      </Typography>
                      <Button
                        variant="contained"
                        color="error"
                        onClick={async () => {
                          const now = dayjs().format("HH:mm");
                          await updateLog(activeStamp.id, {
                            date: activeStamp.date,
                            start: activeStamp.start_time?.slice(0,5) as any,
                            end: now as any,
                            breakHours: Number(activeStamp.break_hours || 0),
                            activity: activeStamp.activity as any,
                            title: activeStamp.title || null,
                            project: activeStamp.project || null,
                            place: activeStamp.place || null,
                            notes: activeStamp.notes || null,
                          });
                          await mutate();
                          showToast(t('home.stamped_out', 'Stemplet ut'));
                        }}
                        startIcon={<StopIcon />}
                        fullWidth
                        size="large"
                      >
                        {t('home.stamp_out', 'Stemple UT')} ({elapsedTime})
                      </Button>
                    </Stack>
                  </Box>
                )}
                <FormControl fullWidth>
                  <InputLabel>{t('fields.activity', 'Aktivitet')}</InputLabel>
                  <Select
                    label={t('fields.activity', 'Aktivitet')}
                    value={quickActivity}
                    onChange={(e) => setQuickActivity(e.target.value as any)}
                  >
                    <MenuItem value="Work">{t('stats.work', 'Arbeid')}</MenuItem>
                    <MenuItem value="Meeting">{t('stats.meetings', 'Møte')}</MenuItem>
                  </Select>
                </FormControl>
                <TextField label={t('fields.title_meeting', 'Tittel / Møte')} value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} fullWidth />
                <TextField label={t('fields.project_client', 'Prosjekt / Kunde')} value={quickProject} onChange={(e) => setQuickProject(e.target.value)} fullWidth />
                <TextField label={t('fields.place_mode', 'Sted / Modus')} value={quickPlace} onChange={(e) => setQuickPlace(e.target.value)} fullWidth />
                <TextField label={t('fields.notes_optional', 'Notater (valgfritt)')} value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} multiline minRows={2} fullWidth />
                <Button 
                  variant="contained" 
                  onClick={async () => {
                    await handleQuickStamp();
                    // Success animation
                    showToast(
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CheckCircleIcon sx={{ animation: `${successScale} 0.3s ease-out` }} />
                        <span>{t('home.stamped_in_success', 'Stemplet inn!')}</span>
                      </Stack> as any,
                      'success'
                    );
                  }}
                  size="large"
                  sx={{ 
                    py: 1.5,
                    transition: 'transform 0.2s ease-in-out',
                    '&:active': { transform: 'scale(0.95)' }
                  }}
                  aria-label={t('aria.stamp_in', 'Stemple inn')}
                  title={t('tooltips.stamp_in', 'Stemple inn')}
                >
                  {t('home.stamp_in', 'Stemple INN')}
                </Button>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {templates.map((template) => (
                    <Tooltip 
                      key={template.id}
                      title={
                        <Box>
                          <Typography variant="caption" fontWeight="bold">{template.label}</Typography>
                          <Typography variant="caption" display="block">Aktivitet: {template.activity === 'Work' ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}</Typography>
                          {template.title && <Typography variant="caption" display="block">Tittel: {template.title}</Typography>}
                          {template.project && <Typography variant="caption" display="block">Prosjekt: {template.project}</Typography>}
                          {template.place && <Typography variant="caption" display="block">Sted: {template.place}</Typography>}
                        </Box>
                      }
                      arrow
                    >
                    <Chip 
                      label={template.label} 
                      size="small" 
                      onClick={() => {
                        setQuickActivity(template.activity);
                        setQuickTitle(template.title || '');
                        setQuickProject(template.project || '');
                        setQuickPlace(template.place || '');
                      }}
                      clickable
                      aria-label={`${t('aria.use_template', 'Bruk mal')}: ${template.label}`}
                    />
                    </Tooltip>
                  ))}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4} ref={manualRef}>
          <Card>
            <CardHeader title={t('home.add_manual', 'Legg til manuelt')} />
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField type="date" label={t('fields.date', 'Dato')} InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} sx={{ flex: 1 }} />
                  <Chip label={t('fields.today', 'I dag')} size="small" onClick={() => setDate(dayjs().format("YYYY-MM-DD"))} />
                  <Chip label={t('fields.yesterday', 'I går')} size="small" onClick={() => setDate(dayjs().subtract(1, 'day').format("YYYY-MM-DD"))} />
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
                      showToast(t('home.copied_previous_row', 'Forrige rad kopiert'));
                    } else {
                      showToast(t('home.no_previous_rows', 'Ingen tidligere rader funnet'), "warning");
                    }
                  }}
>
                  {t('home.copy_previous_row', 'Kopier forrige rad')}
                </Button>
                <FormControl fullWidth>
                  <InputLabel>{t('fields.activity', 'Aktivitet')}</InputLabel>
                  <Select
                    label={t('fields.activity', 'Aktivitet')}
                    value={manualActivity}
                    onChange={(e) => setManualActivity(e.target.value as any)}
                  >
                    <MenuItem value="Work">{t('stats.work', 'Arbeid')}</MenuItem>
                    <MenuItem value="Meeting">{t('stats.meetings', 'Møte')}</MenuItem>
                  </Select>
                </FormControl>
                <Stack direction="row" spacing={2}>
                  <TextField 
                    type="time" 
                    label={t('fields.in', 'Inn')} 
                    InputLabelProps={{ shrink: true }} 
                    value={start} 
                    onChange={(e) => setStart(e.target.value)} 
                    fullWidth
                    error={start !== "" && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(start)}
                    helperText={start !== "" && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(start) ? t('helpers.invalid_time', 'Ugyldig klokkeslett') : ""}
                  />
                  <TextField 
                    type="time" 
                    label={t('fields.out', 'Ut')} 
                    InputLabelProps={{ shrink: true }} 
                    value={end} 
                    onChange={(e) => setEnd(e.target.value)} 
                    fullWidth 
                    error={(end < start && end !== "" && start !== "") || (end !== "" && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(end))}
                    helperText={
                      end !== "" && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(end) 
                        ? t('helpers.invalid_time', 'Ugyldig klokkeslett')
                        : (end < start && end !== "" && start !== "") 
                        ? t('helpers.out_after_in', 'Ut må være etter Inn') 
                        : ""
                    }
                  />
                </Stack>
                <TextField type="number" label={t('fields.break_hours', 'Pause (timer)')} value={breakHours} onChange={(e) => setBreakHours(Number(e.target.value))} fullWidth />
                <TextField 
                  type="number" 
                  label={t('fields.expense_coverage', 'Utgiftsdekning (kr)')} 
                  value={expenseCoverage} 
                  onChange={(e) => setExpenseCoverage(Number(e.target.value) || 0)} 
                  fullWidth 
                  InputProps={{ inputProps: { min: 0, step: 10 } }}
                  aria-label={t('fields.expense_coverage', 'Utgiftsdekning (kr)')}
                />
                <TextField label={t('fields.title_meeting', 'Tittel / Møte')} value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} fullWidth />
                <TextField label={t('fields.project_client', 'Prosjekt / Kunde')} value={manualProject} onChange={(e) => setManualProject(e.target.value)} fullWidth />
                <TextField label={t('fields.place_mode', 'Sted / Modus')} value={manualPlace} onChange={(e) => setManualPlace(e.target.value)} fullWidth />
                <TextField label={t('fields.notes', 'Notater')} value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} multiline minRows={2} fullWidth />
                <Button 
                  variant="contained" 
                  onClick={async () => {
                    await handleAddManual();
                    // Success animation trigger
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) {
                      btn.style.transform = 'scale(1.1)';
                      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 200);
                    }
                  }}
                  size="large"
                  sx={{ 
                    py: 1.5,
                    transition: 'transform 0.2s ease-in-out'
                  }}
                  disabled={!start || !end || end < start}
                >
                  {t('common.add', 'Legg til')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4} ref={statsRef}>
          <Card>
            <CardHeader 
              title={t('home.month_metrics', 'Månedsfilter og nøkkeltall')} 
              action={
                <IconButton
                  onClick={() => {
                    const newState = !(settings?.stats_collapsed || false);
                    updateSettings({ stats_collapsed: newState });
                  }}
                  size="small"
                >
                  {settings?.stats_collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                </IconButton>
              }
            />
            <Collapse in={!settings?.stats_collapsed} timeout="auto" unmountOnExit>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <IconButton 
                    size="small" 
                    onClick={() => { const v = dayjs(monthNav+"01").subtract(1, "month").format("YYYYMM"); updateSettings({month_nav: v}); setMonthInput(v); }}
                    title={t('tooltips.prev_month', 'Forrige måned')}
                    aria-label={t('tooltips.prev_month', 'Forrige måned')}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <Typography variant="body1" fontWeight="medium" sx={{ flex: 1, textAlign: 'center' }}>
                    {formatMonthLabel(monthNav)}
                  </Typography>
                  <IconButton 
                    size="small" 
                    onClick={() => { const v = dayjs(monthNav+"01").add(1, "month").format("YYYYMM"); updateSettings({month_nav: v}); setMonthInput(v); }}
                    title={t('tooltips.next_month', 'Neste måned')}
                    aria-label={t('tooltips.next_month', 'Neste måned')}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                  <Button 
                    size="small" 
                    variant="outlined"
                    startIcon={<TodayIcon />}
                    onClick={() => { 
                      const v = dayjs().format("YYYYMM"); 
                      updateSettings({month_nav: v}); 
                      setMonthInput(v);
                      updateViewMode('month');
                    }}
                    title={t('filters.this_month', 'Denne måneden')}
                  >
                    {t('common.today', 'I dag')}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                  <Chip 
                    label={t('filters.week', 'Uke')}
                    size="small" 
                    onClick={() => updateViewMode('week')}
                    color={viewMode === 'week' ? "primary" : "default"}
                    variant={viewMode === 'week' ? "filled" : "outlined"}
                  />
                  <Chip 
                    label={t('filters.month', 'Måned')}
                    size="small" 
                    onClick={() => updateViewMode('month')}
                    color={viewMode === 'month' ? "primary" : "default"}
                    variant={viewMode === 'month' ? "filled" : "outlined"}
                  />
                  <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                  <Chip 
                    label={t('filters.this_month', 'Denne måneden')} 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      const v = dayjs().format("YYYYMM");
                      setMonthInput(v);
                      updateSettings({month_nav: v});
                    }}
                    color={monthNav === dayjs().format("YYYYMM") ? "primary" : "default"}
                  />
                  <Chip 
                    label={t('filters.prev_month', 'Forrige måned')} 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      const v = dayjs().subtract(1, "month").format("YYYYMM");
                      setMonthInput(v);
                      updateSettings({month_nav: v});
                    }}
                    color={monthNav === dayjs().subtract(1, "month").format("YYYYMM") ? "primary" : "default"}
                  />
                  <Chip 
                    label={t('filters.this_year', 'Dette året')} 
                    size="small" 
                    onClick={() => {
                      updateViewMode('month');
                      const v = dayjs().startOf("year").format("YYYYMM");
                      setMonthInput(v);
                      updateSettings({month_nav: v});
                    }}
                  />
                </Stack>
                <Divider />
                <Typography variant="body2">{t('stats.total_hours_weekdays', 'Totale timer (man–fre)')}</Typography>
                <Typography variant="h4">{totalHours.toFixed(2)}</Typography>
                <Box sx={{ mt: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {(() => {
                        const workdaysInMonth = Array.from({ length: dayjs(monthNav + "01").daysInMonth() }, (_, i) => {
                          const day = dayjs(monthNav + "01").date(i + 1);
                          return day.day() !== 0 && day.day() !== 6;
                        }).filter(Boolean).length;
                        const loggedDays = new Set(logs.map(l => l.date)).size;
                        return `${loggedDays} / ~${workdaysInMonth} ${t('stats.workdays_logged', 'arbeidsdager loggført')}`;
                      })()}
                    </Typography>
                  </Stack>
                </Box>
                <HoursBarChart logs={logs} monthNav={monthNav} paidBreak={paidBreakLocal} />
                <CalendarHeatmap logs={logs} monthNav={monthNav} paidBreak={paidBreakLocal} />
                <Stack direction="row" spacing={2}>
                  <Box>
                    <Typography variant="body2">{t('stats.work', 'Arbeid')}</Typography>
                    <Typography variant="h6">{logs.filter(l => l.activity === "Work").length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2">{t('stats.meetings', 'Møter')}</Typography>
                    <Typography variant="h6">{logs.filter(l => l.activity === "Meeting").length}</Typography>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip
                    label={paidBreakLocal ? t('home.paid_break', 'Betalt pause') : t('home.unpaid_break', 'Ubetalt pause')}
                    onClick={() => {
                      const next = !paidBreakLocal;
                      setPaidBreakLocal(next);
                      updateSettings({ paid_break: next });
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">Ved betalt pause trekkes ikke pause fra timene.</Typography>
                </Stack>
                <TextField
                  label={t('fields.hourly_rate', 'Timesats (kr/t)')}
                  value={rateInput}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = sanitizeRateInput(e.target.value);
                    setRateInput(v);
                  }}
                  onBlur={() => {
                    const n = parseRate(rateInput);
                    if (Number.isFinite(n)) {
                      updateSettings({ hourly_rate: n });
                      setRateInput(formatRate(n));
                    } else {
                      setRateInput(formatRate(rate));
                    }
                  }}
                />
                <Typography variant="body2">{t('stats.estimated_salary', 'Estimert lønn (man–fre)')}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {calcBusy && <CircularProgress size={16} />}
                  <Typography variant="h5">{formatCurrency(rateForCalc * totalHours)}</Typography>
                </Stack>
                <Typography variant="body2">{t('stats.expenses', 'Utgiftsdekning')}</Typography>
                <Typography variant="h6">{formatCurrency(totalExpenses)}</Typography>
                <Typography variant="body2">{t('stats.total_payout', 'Total utbetaling')}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {calcBusy && <CircularProgress size={16} />}
                  <Typography variant="h5" color="primary">{formatCurrency(rateForCalc * totalHours + totalExpenses)}</Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  <FormControl sx={{ minWidth: 160 }}>
                    <InputLabel>{t('fields.tax_percent', 'Skatteprosent')}</InputLabel>
                    <Select
                      label={t('fields.tax_percent', 'Skatteprosent')}
                      value={String(taxPctLocal)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTaxPctLocal(Number.isFinite(v) ? v : 35);
                        updateSettings({ tax_pct: Number.isFinite(v) ? v : 35 });
                        showToast(t('settings.saved_all', 'Alle innstillinger lagret'));
                      }}
                    >
                      {[20,25,30,35,40,45,50].map(p => (
                        <MenuItem key={p} value={String(p)}>{p}%</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box>
                    <Typography variant="body2">{t('stats.set_aside_tax', 'Sett av til skatt')}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {calcBusy && <CircularProgress size={14} />}
                      <Typography variant="h6">{formatCurrency(rateForCalc * totalHours * (taxPctLocal/100))}</Typography>
                    </Stack>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button variant="outlined" color="warning" onClick={async () => { await deleteLogsMonth(dayjs().format("YYYYMM")); showToast(t('home.month_reset', 'Denne måneden nullstilt'), "success"); await mutate(); }}>{t('actions.reset_month', 'Nullstill denne måneden')}</Button>
                  <Button variant="outlined" onClick={async ()=>{ await archiveMonth(monthNav); showToast(t('home.month_archived', 'Måneden er arkivert'), 'success'); await mutate(); }}>{t('actions.archive_month', 'Arkiver denne måneden')}</Button>
<Button variant="outlined" color="error" onClick={async () => { await deleteLogsAll(); showToast(t('home.dataset_reset', 'Hele datasettet er nullstilt'), "success"); await mutate(); }}>{t('actions.reset_all', 'Nullstill hele datasettet')}</Button>
                </Stack>
              </Stack>
            </CardContent>
            </Collapse>
          </Card>
        </Grid>

      </Grid>
      <Box sx={{ mt: 3 }}>
        <Typography variant="h5" gutterBottom>{t('home.data_management', 'Dataadministrasjon')}</Typography>
        <Accordion defaultExpanded={false}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{t('home.quick_actions', 'Hurtighandlinger')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={{ xs: 3, sm: 2 }}>
              <Grid item xs={12}>
        <Grid item xs={12}>
          <LazyMount>
            <TemplateManager
              templates={templates}
              onCreate={createTemplate}
              onDelete={deleteTemplate}
              onToast={showToast}
            />
          </LazyMount>
        </Grid>
        <Grid item xs={12} ref={importRef}>
          <LazyMount>
            <Card>
              <CardHeader title={t('home.files_import', 'Importer timeplan (CSV)')} />
              <CardContent>
                <CsvImport onImported={async () => { await mutate(); }} onToast={showToast} />
              </CardContent>
            </Card>
          </LazyMount>
              </Grid>
              <Grid item xs={12}>
          <LazyMount>
            <Card>
              <CardHeader title={t('home.google_sheets_webhook', 'Google Sheets Webhook (toveis)')} />
              <CardContent>
                <WebhookSection onImported={async () => { await mutate(); }} onToast={showToast} settings={settings} updateSettings={updateSettings} />
              </CardContent>
            </Card>
          </LazyMount>
              </Grid>
              <Grid item xs={12}>
          <LazyMount>
            <Card>
              <CardHeader title={t('home.add_workdays_month', 'Legg inn hverdager for måned')} />
              <CardContent>
                <MonthBulk onDone={async () => { await mutate(); }} onToast={showToast} />
              </CardContent>
            </Card>
          </LazyMount>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion defaultExpanded={false} sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{t('home.reports_export', 'Rapporter & Eksport')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={{ xs: 3, sm: 2 }}>
              <Grid item xs={12}>
          <LazyMount>
            <Card>
              <CardHeader title={t('home.send_timesheet', 'Send inn timeliste')} />
              <CardContent>
                <SendTimesheet month={monthNav} onToast={showToast} settings={settings} updateSettings={updateSettings} />
              </CardContent>
            </Card>
          </LazyMount>
        </Grid>
        <Grid item xs={12}>
          <LazyMount>
            <Card>
              <CardHeader title={t('home.report_month', 'Skriv en rapport for måneden')} />
              <CardContent>
                <ReportGenerator month={monthNav} onToast={showToast} />
              </CardContent>
            </Card>
          </LazyMount>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Box>

      <LazyMount>
        <Box mt={3} ref={logsRef}>
          <Card>
          <CardHeader 
            title={`Logg for ${formatMonthLabel(monthNav)}`}
            action={
              <Stack direction="row" spacing={1}>
                {bulkMode && selectedIds.size > 0 && (
                  <Button 
                    variant="contained" 
                    color="error"
                    size="small" 
                    onClick={handleBulkDelete}
>
                    {t('common.delete', 'Slett')} {selectedIds.size}
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
                  {bulkMode ? t('home.cancel', 'Avbryt') : t('home.select_many', 'Velg flere')}
                </Button>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => exportToPDF(allLogs, monthNav, projectInfo, settings)}
                  disabled={allLogs.length === 0}
                  title={t('tooltips.export_pdf', 'Eksporter PDF')}
                  aria-label={t('tooltips.export_pdf', 'Eksporter PDF')}
                >
                  {t('home.export_pdf', 'Eksporter PDF')}
                </Button>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
                  <Typography variant="caption">{t('home.show_archived', 'Vis arkiverte')}</Typography>
                  <Switch
                    size="small"
                    checked={showArchivedLocal}
                    onChange={(e)=>{
                      const v = e.target.checked;
                      setShowArchivedLocal(v);
                      try { if (typeof window !== 'undefined') localStorage.setItem('show_archived', String(v)); } catch { void 0; }
updateSettings({ show_archived: v }).catch(() => void 0);
                      setSize(1);
                    }}
                  />
                </Stack>
              </Stack>
            }
          />
          <CardContent>
            <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'background.paper', pb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField 
                placeholder={t('home.search_placeholder', 'Søk i logger (tittel, prosjekt, sted, notater, aktivitet)...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                size="small"
              />
              {bulkMode && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={selectAll}>{t('common.select_all', 'Velg alle')}</Button>
                  <Button size="small" onClick={deselectAll}>{t('common.clear_all', 'Fjern alle')}</Button>
                </Stack>
              )}
            </Stack>
            </Box>
            {logs.length === 0 && !isLoading && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <TimerIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {t('logs.empty', 'Ingen loggføringer for denne måneden')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {t('logs.empty_hint', 'Kom i gang ved å stemple inn eller legge til en manuell loggføring')}
                </Typography>
                <Button 
                  variant="contained" 
                  onClick={() => manualRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  startIcon={<EditIcon />}
                >
                  {t('logs.add_first', 'Legg til første logg')}
                </Button>
              </Box>
            )}
            {logs.length > 0 && (
            <Box sx={{ height: 500, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <TableVirtuoso
                data={logs}
                style={{ height: '100%' }}
                components={{
                  Table: (props) => <Table {...props} size="small" sx={{ minWidth: 900 }} />,
                  TableHead: TableHead,
                  TableRow: TableRow,
                  TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
                }}
                fixedHeaderContent={() => (
                  <TableRow>
                    {bulkMode && (
                      <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper' }}>
                        <Checkbox
                          indeterminate={selectedIds.size > 0 && selectedIds.size < logs.length}
                          checked={logs.length > 0 && selectedIds.size === logs.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAll();
                            } else {
                              deselectAll();
                            }
                          }}
                          size="small"
                        />
                      </TableCell>
                    )}
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.date', 'Dato')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.in', 'Inn')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.out', 'Ut')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.break', 'Pause')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.activity', 'Aktivitet')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.title', 'Tittel')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.project', 'Prosjekt')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.place', 'Sted')}</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('table.notes', 'Notater')}</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('table.expenses', 'Utgifter')}</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('table.actions', 'Handlinger')}</TableCell>
                  </TableRow>
                )}
                itemContent={(index, r) => (
                  <>
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
                        <TableCell sx={{ minWidth: 140 }}>
                          <TextField
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 100 }}>
                          <TextField
                            type="time"
                            value={editForm.start}
                            onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 100 }}>
                          <TextField
                            type="time"
                            value={editForm.end}
                            onChange={(e) => setEditForm({ ...editForm, end: e.target.value })}
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 80 }}>
                          <TextField
                            type="number"
                            value={editForm.breakHours}
                            onChange={(e) => setEditForm({ ...editForm, breakHours: Number(e.target.value) })}
                            size="small"
                            fullWidth
                            inputProps={{ step: 0.25, min: 0 }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 120 }}>
                          <FormControl size="small" fullWidth>
                            <Select value={editForm.activity} onChange={(e) => setEditForm({ ...editForm, activity: e.target.value })}>
                              <MenuItem value="Work">{t('stats.work', 'Arbeid')}</MenuItem>
                              <MenuItem value="Meeting">{t('stats.meetings', 'Møte')}</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ minWidth: 150 }}>
                          <TextField
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            size="small"
                            fullWidth
                            placeholder={t('table.title', 'Tittel')}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 130 }}>
                          <TextField
                            value={editForm.project}
                            onChange={(e) => setEditForm({ ...editForm, project: e.target.value })}
                            size="small"
                            fullWidth
                            placeholder={t('table.project', 'Prosjekt')}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 120 }}>
                          <TextField
                            value={editForm.place}
                            onChange={(e) => setEditForm({ ...editForm, place: e.target.value })}
                            size="small"
                            fullWidth
                            placeholder={t('table.place', 'Sted')}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 150 }}>
                          <TextField
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            size="small"
                            fullWidth
                            placeholder={t('table.notes', 'Notater')}
                            multiline
                            maxRows={2}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 100 }}>
                          <TextField
                            type="number"
                            value={editForm.expenseCoverage}
                            onChange={(e) => setEditForm({ ...editForm, expenseCoverage: Number(e.target.value) || 0 })}
                            size="small"
                            fullWidth
                            InputProps={{ inputProps: { min: 0, step: 10 } }}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 100 }}>
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton
                              aria-label={t('aria.save_changes', 'Lagre endringer')}
                              size="small"
                              onClick={() => saveEdit(r.id, r)}
                              color="primary"
                            >
                              <SaveIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              aria-label={t('aria.cancel_edit', 'Avbryt redigering')}
                              size="small"
                              onClick={() => cancelEdit()}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.start_time?.slice(0, 5)}</TableCell>
                        <TableCell>{r.end_time?.slice(0, 5)}</TableCell>
                        <TableCell>{r.break_hours}</TableCell>
                        <TableCell>
                          <Chip 
                            label={r.activity} 
                            size="small"
                            sx={{
                              bgcolor: r.activity === 'Work' ? 'success.light' : 'info.light',
                              color: r.activity === 'Work' ? 'success.dark' : 'info.dark',
                              fontWeight: 'medium'
                            }}
                          />
                        </TableCell>
                        <TableCell>{r.title}</TableCell>
                        <TableCell>{r.project}</TableCell>
                        <TableCell>{r.place}</TableCell>
                        <TableCell>{r.notes}</TableCell>
                        <TableCell align="right">{Number.isFinite(Number(r.expense_coverage)) && Number(r.expense_coverage) > 0 ? `${Number(r.expense_coverage).toLocaleString('no-NO')} kr` : '—'}</TableCell>
                        <TableCell align="right">
                          <IconButton aria-label={t('aria.edit_row', 'Rediger rad')} size="small" onClick={() => startEdit(r)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          {!showArchived ? (
                            <IconButton
                              aria-label={t('aria.archive_row', 'Arkiver rad')}
                              size="small"
                              onClick={async () => {
                                await archiveLog(r.id);
                                showToast(t('home.row_archived', 'Rad arkivert'), 'success');
                                await mutate();
                              }}
                            >
                              {/* using Delete icon color warning to differentiate */}
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          ) : (
                            <IconButton
                              aria-label={t('aria.restore_row', 'Gjenopprett rad')}
                              size="small"
                              onClick={async () => {
                                await unarchiveLog(r.id);
                                showToast(t('home.row_restored', 'Rad gjenopprettet'), 'success');
                                await mutate();
                              }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </>
                    )}
                  </>
                )}
              />
            </Box>
            )}
          </CardContent>
          </Card>
        </Box>
      </LazyMount>

      {/* Mobile Bottom Navigation - Hidden on desktop */}
      <MobileBottomNav
        onNavigate={handleMobileNavigate}
        onQuickAction={handleMobileQuickAction}
        currentSection="home"
      />

      {/* Persistent Undo FAB */}
      {undo && (
        <Fab
          color="secondary"
          sx={{
            position: 'fixed',
            bottom: { xs: 90, md: 24 },
            right: 24,
            animation: `${successScale} 0.3s ease-out`,
          }}
          onClick={handleUndo}
          aria-label={t('common.undo', 'Angre')}
        >
          <RestoreIcon />
        </Fab>
      )}

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
