'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, TextField, Switch, FormControlLabel, Button } from '@mui/material';
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/me`);
      const data = await res.json();
      if (data.company) {
        setSettings({
          enforce_hourly_rate: data.company.enforce_hourly_rate || false,
          enforced_hourly_rate: data.company.enforced_hourly_rate || '',
          enforce_timesheet_recipient: data.company.enforce_timesheet_recipient || false,
          enforced_timesheet_to: data.company.enforced_timesheet_to || '',
          enforced_timesheet_cc: data.company.enforced_timesheet_cc || '',
          enforced_timesheet_bcc: data.company.enforced_timesheet_bcc || '',
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/company/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      enqueueSnackbar('Innstillinger lagret', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke lagre innstillinger: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
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
      </Grid>

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
