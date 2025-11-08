"use client";

import { useEffect, useMemo, useState, forwardRef } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Grid,
  Link as MuiLink,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import LaunchIcon from '@mui/icons-material/Launch';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import Link from 'next/link';
import { fetchSettings, getGoogleAuthStatus, API_BASE } from '../../../lib/api';

function useOnboardingStatus() {
  const { fetchWithAuth } = useCompany();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasTemplates, setHasTemplates] = useState(false);
  const [hasInvitesOrUsers, setHasInvitesOrUsers] = useState(false);
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [emailMethod, setEmailMethod] = useState<'gmail' | 'smtp' | ''>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        // Templates
        const [t1, t2] = await Promise.all([
          fetchWithAuth(`${API_BASE}/api/company/templates/timesheet`).then(r=>r.json()).catch(()=>({})),
          fetchWithAuth(`${API_BASE}/api/company/templates/case_report`).then(r=>r.json()).catch(()=>({})),
        ]);
        if (cancelled) return;
        setHasTemplates(!!(t1?.template_html || t2?.template_html));

        // Users and invites
        const [usersRes, invitesRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/api/company/users`).then(r=>r.json()).catch(()=>({ users: [] })),
          fetchWithAuth(`${API_BASE}/api/company/invites`).then(r=>r.json()).catch(()=>({ invites: [] })),
        ]);
        if (cancelled) return;
        const usersCount = Array.isArray(usersRes?.users) ? usersRes.users.length : 0;
        const invitesCount = Array.isArray(invitesRes?.invites) ? invitesRes.invites.length : 0;
        setHasInvitesOrUsers((usersCount > 1) || invitesCount > 0);

        // Integrations (Google or Sheets/Webhook in settings) and company email
        const [authStatus, settings, emailSettings, gmailCompany] = await Promise.all([
          getGoogleAuthStatus().catch(()=>({ isConnected: false, needsReauth: false })),
          fetchSettings('default').catch(()=>({} as any)),
          fetchWithAuth(`${API_BASE}/api/company/email-settings`).then(r=>r.json()).catch(()=>({})),
          fetchWithAuth(`${API_BASE}/api/company/email/google/status`).then(r=>r.json()).catch(()=>({ isConnected: false })),
        ]);
        if (cancelled) return;
        const sheets = !!settings?.sheet_url;
        const webhook = !!settings?.webhook_active;
        const emailConfigured = (emailSettings?.email_method === 'gmail' && !!gmailCompany?.isConnected) ||
                                (emailSettings?.email_method === 'smtp' && !!emailSettings?.smtp_host);
        setEmailMethod(emailSettings?.email_method || '');
        setHasEmail(!!emailConfigured);
        setHasIntegrations(!!authStatus?.isConnected || sheets || webhook || emailConfigured);

      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to load onboarding status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchWithAuth]);

  const steps = useMemo(() => [
    {
      id: 'templates',
      title: 'Design dokumentmaler',
      description: 'Design timeliste- og saksrapportmaler som passer deres behov (ingen utfylling i portalen).',
      done: hasTemplates,
      href: '/portal/templates',
    },
    {
      id: 'team',
      title: 'Inviter teamet',
      description: 'Legg til kollegaer og gi dem tilgang til selskapet.',
      done: hasInvitesOrUsers,
      href: '/portal/users',
      secondaryHref: '/portal/invites',
    },
    {
      id: 'integrations',
      title: 'Koble til integrasjoner',
      description: 'Koble Google-konto eller Google Sheets / Webhook for synkronisering.',
      done: hasIntegrations,
      href: '/portal/settings',
    },
  ], [hasTemplates, hasInvitesOrUsers, hasIntegrations]);

  const completed = steps.filter(s => s.done).length;
  const total = steps.length;

  return { loading, error, steps, completed, total, hasEmail, emailMethod };
}

function OnboardingContent() {
  const { t } = useTranslations();
  const { loading, error, steps, completed, total, hasEmail, emailMethod } = useOnboardingStatus();
  const [smtpHelpOpen, setSmtpHelpOpen] = useState(false);

  // Allow dismiss in localStorage
  const [dismissed, setDismissed] = useState<boolean>(() => {
try { return window.localStorage.getItem('onboarding_dismissed') === 'true'; } catch { void 0; return false; }
  });

  const progressLabel = `${completed}/${total} ${t('portal.onboarding.completed', 'fullført')}`;

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardHeader title={t('portal.onboarding.title', 'Kom i gang med selskapet')} />
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              {error && <Typography color="error">{error}</Typography>}
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('portal.onboarding.progress', 'Fremdrift')}: {progressLabel}
                </Typography>
                {completed === total && (
                  <Chip color="success" size="small" icon={<CheckCircleIcon />} label={t('portal.onboarding.all_done', 'Alt klart!')} />
                )}
              </Stack>

              <Stepper orientation="vertical" activeStep={completed} sx={{ maxWidth: 720 }}>
                {steps.map((step) => (
                  <Step key={step.id} completed={step.done}>
                    <StepLabel icon={step.done ? <CheckCircleIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}>
                      <Typography variant="h6">{t(`portal.onboarding.${step.id}.title`, step.title)}</Typography>
                    </StepLabel>
                    <Box sx={{ pl: 4, pb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t(`portal.onboarding.${step.id}.desc`, step.description)}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Link href={step.href} passHref legacyBehavior>
                          <Button variant="contained" size="small" endIcon={<LaunchIcon />}>{t('common.open', 'Åpne')}</Button>
                        </Link>
                        {step.secondaryHref && (
                          <Link href={step.secondaryHref} passHref legacyBehavior>
                            <Button variant="outlined" size="small">{t('portal.onboarding.alternative', 'Alternativ')}</Button>
                          </Link>
                        )}
                      </Stack>
                    </Box>
                  </Step>
                ))}
              </Stepper>

              {/* Integration cards */}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6} lg={4}>
                  <Card>
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography variant="h6">{t('portal.onboarding.email_card_title', 'E-postlevering')}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip color={hasEmail ? 'success' : 'default'} size="small" label={hasEmail ? (emailMethod === 'gmail' ? 'Gmail tilkoblet' : 'SMTP konfigurert') : 'Ikke konfigurert'} />
                          <Link href="/portal/settings" passHref legacyBehavior>
                            <Button size="small" variant="outlined" endIcon={<LaunchIcon />}>{t('common.open', 'Åpne')}</Button>
                          </Link>
                          <Button size="small" onClick={() => setSmtpHelpOpen(true)}>{t('portal.onboarding.email_help_btn', 'Hjelp for SMTP')}</Button>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {t('portal.onboarding.email_card_desc', 'Velg Gmail eller SMTP som leverandør for utsending av timelister/rapporter og invitasjoner.')}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* SMTP help dialog (onboarding) */}
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
                    {t('smtp.help.alt_gmail', 'Alternativ: Velg “Gmail” som leverandør under Innstillinger og klikk “Koble til Google”.')}
                  </Typography>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setSmtpHelpOpen(false)}>Lukk</Button>
                  <Link href="/portal/settings" passHref legacyBehavior>
                    <Button autoFocus variant="contained">Åpne innstillinger</Button>
                  </Link>
                </DialogActions>
              </Dialog>

              <Stack direction="row" spacing={1}>
                {!dismissed ? (
<Button size="small" onClick={() => { try { localStorage.setItem('onboarding_dismissed', 'true'); } catch { void 0; }; setDismissed(true); }}>
                    {t('portal.onboarding.dismiss', 'Skjul onboarding')}
                  </Button>
                ) : (
<Button size="small" onClick={() => { try { localStorage.removeItem('onboarding_dismissed'); } catch { void 0; }; setDismissed(false); }}>
                    {t('portal.onboarding.show_again', 'Vis igjen')}
                  </Button>
                )}
                <Link href="/portal/dashboard" passHref legacyBehavior>
                  <Button size="small">{t('portal.back_to_dashboard', 'Tilbake til oversikt')}</Button>
                </Link>
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default function OnboardingPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <OnboardingContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
