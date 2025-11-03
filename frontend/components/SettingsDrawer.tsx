"use client";
import { useState, useEffect } from "react";
import {
  Drawer,
  Box,
  IconButton,
  Stack,
  TextField,
  Typography,
  Divider,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import { useUserSettings } from "../lib/hooks";
import { useSnackbar } from "notistack";

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

export default function SettingsDrawer() {
  const [open, setOpen] = useState(false);
  const { settings, updateSettings: updateSettingsDb, isLoading } = useUserSettings();
  const { enqueueSnackbar } = useSnackbar();
  
  // Form state
  const [paidBreak, setPaidBreak] = useState(false);
  const [taxPct, setTaxPct] = useState(35);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [hourlyRateInput, setHourlyRateInput] = useState("");
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [smtpPass, setSmtpPass] = useState("");
  const [webhookActive, setWebhookActive] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [invoiceReminderActive, setInvoiceReminderActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load from database when drawer opens or settings change
  useEffect(() => {
    if (settings) {
      setPaidBreak(settings.paid_break || false);
      setTaxPct(settings.tax_pct || 35);
      const hr = settings.hourly_rate || 0;
      setHourlyRate(hr);
      setHourlyRateInput(formatRate(hr));
      setSender(settings.timesheet_sender || "");
      setRecipient(settings.timesheet_recipient || "");
      setFormat(settings.timesheet_format || "xlsx");
      setSmtpPass(settings.smtp_app_password || "");
      setWebhookActive(settings.webhook_active || false);
      setWebhookUrl(settings.webhook_url || "");
      setSheetUrl(settings.sheet_url || "");
      setInvoiceReminderActive(settings.invoice_reminder_active || false);
    }
  }, [settings, open]);

  async function save() {
    setSaving(true);
    try {
      await updateSettingsDb({
        paid_break: paidBreak,
        tax_pct: taxPct,
        hourly_rate: hourlyRate,
        timesheet_sender: sender,
        timesheet_recipient: recipient,
        timesheet_format: format,
        smtp_app_password: smtpPass,
        webhook_active: webhookActive,
        webhook_url: webhookUrl,
        sheet_url: sheetUrl,
        invoice_reminder_active: invoiceReminderActive,
      });
      enqueueSnackbar("Alle innstillinger lagret", { variant: "success" });
      setOpen(false);
    } catch (e: any) {
      enqueueSnackbar(`Feil ved lagring: ${e?.message || e}`, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <IconButton aria-label="Innstillinger" onClick={() => setOpen(true)} size="small">
        <SettingsIcon />
      </IconButton>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 400, p: 2, maxHeight: '100vh', overflow: 'auto' }} role="presentation">
          <Typography variant="h5" gutterBottom>Innstillinger</Typography>
          <Divider sx={{ mb: 2 }} />
          
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              {/* Lønn og Skatt */}
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">💰 Lønn og Skatt</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField
                      label="Timesats (kr/t)"
                      value={hourlyRateInput}
                      inputMode="decimal"
                      onChange={(e) => {
                        const v = sanitizeRateInput(e.target.value);
                        setHourlyRateInput(v);
                        const n = parseRate(v);
                        if (!isNaN(n)) setHourlyRate(n);
                      }}
                      onBlur={() => setHourlyRateInput(formatRate(hourlyRate))}
                      fullWidth
                      disabled={saving}
                    />
                    <FormControl fullWidth disabled={saving}>
                      <InputLabel>Skatteprosent</InputLabel>
                      <Select
                        label="Skatteprosent"
                        value={String(taxPct)}
                        onChange={(e) => setTaxPct(Number(e.target.value))}
                      >
                        {[20, 25, 30, 35, 40, 45, 50].map((p) => (
                          <MenuItem key={p} value={String(p)}>
                            {p}%
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={paidBreak}
                          onChange={(e) => setPaidBreak(e.target.checked)}
                          disabled={saving}
                        />
                      }
                      label="Betalt pause"
                    />
                    <Typography variant="caption" color="text.secondary">
                      Ved betalt pause trekkes ikke pausetid fra lønnsberegningen.
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* E-post og Timeliste */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">📧 E-post og Timeliste</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField
                      label="Avsender e-post"
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                      fullWidth
                      disabled={saving}
                      type="email"
                      placeholder="din@epost.no"
                    />
                    <TextField
                      label="Mottaker e-post"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      fullWidth
                      disabled={saving}
                      type="email"
                      placeholder="kunde@bedrift.no"
                    />
                    <FormControl fullWidth disabled={saving}>
                      <InputLabel>Timeliste format</InputLabel>
                      <Select
                        label="Timeliste format"
                        value={format}
                        onChange={(e) => setFormat(e.target.value as "xlsx" | "pdf")}
                      >
                        <MenuItem value="xlsx">Excel (XLSX)</MenuItem>
                        <MenuItem value="pdf">PDF</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      type="password"
                      label="SMTP App-passord"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      fullWidth
                      disabled={saving}
                      placeholder="(valgfritt)"
                    />
                    <Typography variant="caption" color="text.secondary">
                      For Gmail/Outlook: Bruk app-spesifikt passord. Vi gjetter SMTP-server fra e-post.
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={invoiceReminderActive}
                          onChange={(e) => setInvoiceReminderActive(e.target.checked)}
                          disabled={saving}
                        />
                      }
                      label="Aktiver påminnelse om fakturering"
                    />
                    <Typography variant="caption" color="text.secondary">
                      Motta automatisk påminnelse om å sende faktura ved månedsslutt.
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Webhook og Integrasjoner */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">🔗 Webhook og Integrasjoner</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={webhookActive}
                          onChange={(e) => setWebhookActive(e.target.checked)}
                          disabled={saving}
                        />
                      }
                      label="Aktiver webhook"
                    />
                    <TextField
                      label="Webhook URL"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      fullWidth
                      disabled={saving || !webhookActive}
                      placeholder="https://hooks.zapier.com/..."
                      type="url"
                    />
                    <TextField
                      label="Google Sheets URL"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      fullWidth
                      disabled={saving}
                      placeholder="https://docs.google.com/spreadsheets/..."
                      type="url"
                    />
                    <Typography variant="caption" color="text.secondary">
                      Webhook sender data til eksterne systemer. Sheets-URL for toveis synk.
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Save Button */}
              <Divider />
              <Button
                variant="contained"
                size="large"
                onClick={save}
                disabled={saving}
                fullWidth
              >
                {saving ? <CircularProgress size={24} /> : "Lagre alle innstillinger"}
              </Button>
              
              <Button
                variant="text"
                size="small"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Avbryt
              </Button>
            </Stack>
          )}
        </Box>
      </Drawer>
    </>
  );
}