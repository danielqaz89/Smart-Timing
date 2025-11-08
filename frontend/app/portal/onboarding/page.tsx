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

        // Integrations (Google or Sheets/Webhook in settings)
        const [authStatus, settings] = await Promise.all([
          getGoogleAuthStatus().catch(()=>({ isConnected: false, needsReauth: false })),
          fetchSettings('default').catch(()=>({} as any)),
        ]);
        if (cancelled) return;
        const sheets = !!settings?.sheet_url;
        const webhook = !!settings?.webhook_active;
        setHasIntegrations(!!authStatus?.isConnected || sheets || webhook);

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

  return { loading, error, steps, completed, total };
}

function OnboardingContent() {
  const { t } = useTranslations();
  const { loading, error, steps, completed, total } = useOnboardingStatus();

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
