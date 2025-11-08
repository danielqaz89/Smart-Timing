'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, TextField, Switch, FormControlLabel, Button, MenuItem, Select, InputLabel, FormControl, Chip, Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Link as MuiLink } from '@mui/material';
import { Save } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function SettingsContent() {
  const { t } = useTranslations();
  const { fetchWithAuth, company } = useCompany();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    enforce_hourly_rate: false,
    enforced_hourly_rate: '',
    enforce_timesheet_recipient: false,
    enforced_timesheet_to: '',
    enforced_timesheet_cc: '',
    enforced_timesheet_bcc: '',
  });

  // Email settings
  const [emailMethod, setEmailMethod] = useState<'gmail' | 'smtp' | ''>('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number | ''>('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [gmailStatus, setGmailStatus] = useState<{ isConnected: boolean; needsReauth: boolean } | null>(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [smtpHelpOpen, setSmtpHelpOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/policy`);
      const data = await res.json();
      setSettings({
        enforce_hourly_rate: !!data.enforce_hourly_rate,
        enforced_hourly_rate: data.hourly_rate || '',
        enforce_timesheet_recipient: !!data.enforce_timesheet_recipient,
        enforced_timesheet_to: data.enforced_timesheet_to || '',
        enforced_timesheet_cc: data.enforced_timesheet_cc || '',
        enforced_timesheet_bcc: data.enforced_timesheet_bcc || '',
      });
      // Load email settings
      try {
        const [emailRes, gmailRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/api/company/email-settings`).then(r => r.json()),
          fetchWithAuth(`${API_BASE}/api/company/email/google/status`).then(r => r.json()).catch(() => ({ isConnected: false, needsReauth: false })),
        ]);
        setEmailMethod(emailRes?.email_method || '');
        setSmtpHost(emailRes?.smtp_host || '');
        setSmtpPort(emailRes?.smtp_port ?? '');
        setSmtpSecure(!!emailRes?.smtp_secure);
        setSmtpUser(emailRes?.smtp_user || '');
        setGmailStatus({ isConnected: !!gmailRes?.isConnected, needsReauth: !!gmailRes?.needsReauth });
      } catch (e) {
        // ignore
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/company/policy`, {
        method: 'PUT',
        body: JSON.stringify({
          enforce_hourly_rate: settings.enforce_hourly_rate,
          hourly_rate: settings.enforced_hourly_rate,
          enforce_timesheet_recipient: settings.enforce_timesheet_recipient,
          enforced_timesheet_to: settings.enforced_timesheet_to,
          enforced_timesheet_cc: settings.enforced_timesheet_cc,
          enforced_timesheet_bcc: settings.enforced_timesheet_bcc,
        }),
      });
      enqueueSnackbar('Innstillinger lagret', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke lagre innstillinger: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const saveEmailSettings = async () => {
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/company/email-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          email_method: emailMethod || null,
          smtp_host: smtpHost || null,
          smtp_port: smtpPort === '' ? null : Number(smtpPort),
          smtp_secure: smtpSecure,
          smtp_user: smtpUser || null,
          smtp_pass: smtpPass || undefined, // update only if provided
        }),
      });
      enqueueSnackbar('E-postinnstillinger lagret', { variant: 'success' });
    } catch (e: any) {
      enqueueSnackbar(`Kunne ikke lagre e-post: ${e?.message || e}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const connectGmail = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/email/google/auth`);
      const data = await res.json();
      if (data?.authUrl) window.location.href = data.authUrl;
    } catch (e) {
      enqueueSnackbar('Kunne ikke starte Google-tilkobling', { variant: 'error' });
    }
  };

  const disconnectGmail = async () => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/email/google/disconnect`, { method: 'DELETE' });
      setGmailStatus({ isConnected: false, needsReauth: false });
      enqueueSnackbar('Koblet fra Google', { variant: 'success' });
    } catch (e) {
      enqueueSnackbar('Kunne ikke koble fra', { variant: 'error' });
    }
  };

  const sendTestEmail = async () => {
    try {
      if (!testRecipient) { enqueueSnackbar('Skriv inn en mottaker', { variant: 'warning' }); return; }
      await fetchWithAuth(`${API_BASE}/api/company/email/test`, {
        method: 'POST',
        body: JSON.stringify({ to: testRecipient }),
      });
      enqueueSnackbar('Test-e-post sendt', { variant: 'success' });
    } catch (e: any) {
      enqueueSnackbar(`Kunne ikke sende test: ${e?.message || e}`, { variant: 'error' });
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('portal.settings.title', 'Innstillinger')}</Typography>

      <Grid container spacing={3}>
        {/* Hourly Rate Policy */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.settings.hourly_policy_title', 'Timesats-policy')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('portal.settings.hourly_policy_desc', 'Når aktivert, vil alle brukere måtte bruke den fastsatte timesatsen i sine rapporter.')}
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enforce_hourly_rate}
                    onChange={(e) => setSettings({ ...settings, enforce_hourly_rate: e.target.checked })}
                  />
                }
                label={t('portal.settings.enforce_hourly', 'Påtving fast timesats')}
              />
              
              {settings.enforce_hourly_rate && (
                <TextField
                  fullWidth
                  type="number"
                  label={t('fields.fixed_hourly_rate', 'Fast timesats (kr/t)')}
                  value={settings.enforced_hourly_rate}
                  onChange={(e) => setSettings({ ...settings, enforced_hourly_rate: e.target.value })}
                  sx={{ mt: 2 }}
                  inputProps={{ min: 0, step: 10 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Timesheet Recipient Policy */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.settings.timesheet_policy_title', 'Timeliste-mottaker policy')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('portal.settings.timesheet_policy_desc', 'Når aktivert, vil alle timelister sendes til de fastsatte mottakerne (brukerne kan ikke endre dette).')}
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enforce_timesheet_recipient}
                    onChange={(e) => setSettings({ ...settings, enforce_timesheet_recipient: e.target.checked })}
                  />
                }
                label={t('portal.settings.enforce_recipients', 'Påtving faste mottakere')}
              />
              
              {settings.enforce_timesheet_recipient && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label={t('fields.to_required', 'Til (påkrevd)')}
                      type="email"
                      value={settings.enforced_timesheet_to}
                      onChange={(e) => setSettings({ ...settings, enforced_timesheet_to: e.target.value })}
                      placeholder={t('placeholders.email_to', 'mottaker@firma.no')}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label={t('fields.cc_optional', 'CC (valgfritt)')}
                      type="email"
                      value={settings.enforced_timesheet_cc}
                      onChange={(e) => setSettings({ ...settings, enforced_timesheet_cc: e.target.value })}
                      placeholder={t('placeholders.email_cc', 'cc@firma.no')}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label={t('fields.bcc_optional', 'BCC (valgfritt)')}
                      type="email"
                      value={settings.enforced_timesheet_bcc}
                      onChange={(e) => setSettings({ ...settings, enforced_timesheet_bcc: e.target.value })}
                      placeholder={t('placeholders.email_bcc', 'bcc@firma.no')}
                    />
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Email Delivery */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.settings.email_delivery', 'E-postlevering')}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>{t('portal.settings.provider', 'Leverandør')}</InputLabel>
                    <Select label={t('portal.settings.provider', 'Leverandør')} value={emailMethod} onChange={(e) => setEmailMethod(e.target.value as any)}>
                      <MenuItem value="">(ingen valgt)</MenuItem>
                      <MenuItem value="gmail">Gmail</MenuItem>
                      <MenuItem value="smtp">SMTP</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Button variant="text" onClick={() => setSmtpHelpOpen(true)}>{t('portal.settings.smtp_help', 'Trenger hjelp med SMTP?')}</Button>
                </Grid>
                {emailMethod === 'gmail' && (
                  <Grid item xs={12}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Chip color={gmailStatus?.isConnected ? 'success' : 'default'} label={gmailStatus?.isConnected ? t('portal.settings.gmail_connected', 'Google tilkoblet') : t('portal.settings.not_connected', 'Ikke tilkoblet')} />
                      {!gmailStatus?.isConnected ? (
                        <Button variant="outlined" onClick={connectGmail}>{t('portal.settings.connect_google', 'Koble til Google')}</Button>
                      ) : (
                        <Button variant="text" color="inherit" onClick={disconnectGmail}>{t('portal.settings.disconnect_google', 'Koble fra')}</Button>
                      )}
                    </Stack>
                  </Grid>
                )}
                {emailMethod === 'smtp' && (
                  <>
                    <Grid item xs={12} md={6}><TextField fullWidth label={t('portal.settings.smtp_host', 'SMTP Host')} value={smtpHost} onChange={(e)=>setSmtpHost(e.target.value)} /></Grid>
                    <Grid item xs={6} md={3}><TextField fullWidth type="number" label={t('portal.settings.port', 'Port')} value={smtpPort} onChange={(e)=> setSmtpPort(e.target.value === '' ? '' : Number(e.target.value))} /></Grid>
                    <Grid item xs={6} md={3}><FormControlLabel control={<Switch checked={smtpSecure} onChange={(e)=> setSmtpSecure(e.target.checked)} />} label={t('portal.settings.secure_tls', 'Secure (TLS)')} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={t('portal.settings.user', 'Bruker')} value={smtpUser} onChange={(e)=>setSmtpUser(e.target.value)} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth type="password" label={t('portal.settings.password_app', 'Passord (app-passord)')} value={smtpPass} onChange={(e)=>setSmtpPass(e.target.value)} placeholder="(endrer ikke hvis tom)" /></Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" onClick={saveEmailSettings} disabled={loading}>{t('portal.settings.save_email', 'Lagre e-postinnstillinger')}</Button>
                    </Grid>
                  </>
                )}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <TextField fullWidth label={t('portal.settings.send_test_to', 'Send test til')} type="email" value={testRecipient} onChange={(e)=> setTestRecipient(e.target.value)} placeholder="test@firma.no" />
                    <Button variant="contained" onClick={sendTestEmail}>Send test</Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* SMTP help dialog */}
      <Dialog open={smtpHelpOpen} onClose={() => setSmtpHelpOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('smtp.help.title', 'Hvor finner vi SMTP-innstillinger?')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('smtp.help.ask_it', 'Hvis dere ikke har SMTP-verdiene, spør IT-avdelingen eller e-postleverandøren. Be om følgende:')}
          </Typography>
          <ul style={{ marginTop: 0 }}>
            <li>SMTP-server (vertsnavn), f.eks. smtp.office365.com eller smtp.gmail.com</li>
            <li>Port og sikkerhet: 587 (TLS) eller 465 (SSL)</li>
            <li>Brukernavn (ofte e-postadresse)</li>
            <li>App-passord eller tjenestekontopassord (IKKE vanlig passord)</li>
          </ul>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>{t('smtp.help.providers', 'Typiske leverandører')}</Typography>
          <ul style={{ marginTop: 0 }}>
            <li>Microsoft 365 / Outlook: smtp.office365.com • port 587 • TLS. SMTP AUTH kan være deaktivert – be IT aktivere for postkassen.</li>
            <li>Google Workspace / Gmail: smtp.gmail.com • 465/587 • app-passord med tofaktor. Alternativt velg “Gmail”-leverandør og koble til Google.</li>
            <li>iCloud: smtp.mail.me.com • 587 • app-passord</li>
            <li>Yahoo: smtp.mail.yahoo.com • 465 • app-passord</li>
            <li>Proton: smtp.protonmail.ch • 587 • Bridge/app-passord</li>
          </ul>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t('smtp.help.tip', 'Tips: Bruk alltid app-spesifikke passord. Del aldri hovedpassord. Dere kan også hoppe over nå og konfigurere senere.')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t('smtp.help.alt_gmail', 'Alternativ: Velg “Gmail” som leverandør og klikk “Koble til Google”.')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSmtpHelpOpen(false)}>Lukk</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={loading}
        >
          {t('portal.settings.save', 'Lagre innstillinger')}
        </Button>
      </Box>
    </Box>
  );
}

export default function SettingsPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <SettingsContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
