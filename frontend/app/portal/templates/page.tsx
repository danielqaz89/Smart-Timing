'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, TextField, Button, Grid, Card, CardContent, Alert } from '@mui/material';
import { Save, Visibility } from '@mui/icons-material';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const exampleTemplates = {
  timesheet: `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h1>Timeliste - {{period.month_label}}</h1>
  <p><strong>Bedrift:</strong> {{company.name}}</p>
  
  <h2>Sammendrag</h2>
  <p>Totalt timer: {{totals.total_hours}}</p>
  {{#if totals.total_amount}}
  <p>Totalt beløp: {{totals.total_amount}} kr</p>
  {{/if}}
  
  <h2>Timer per sak</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr style="background: #f0f0f0;">
      <th style="border: 1px solid #ddd; padding: 8px;">Saksnummer</th>
      <th style="border: 1px solid #ddd; padding: 8px;">Timer</th>
    </tr>
    {{#each per_case}}
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">{{case_id}}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">{{hours}}</td>
    </tr>
    {{/each}}
  </table>
</div>`,
  case_report: `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h1>Saksrapport - {{report.case_id}}</h1>
  <p><strong>Periode:</strong> {{report.month}}</p>
  <p><strong>Status:</strong> {{report.status}}</p>
  
  <h2>Bakgrunn for tiltaket</h2>
  <p>{{report.background}}</p>
  
  <h2>Arbeid og tiltak som er gjennomført</h2>
  <p>{{report.actions}}</p>
  
  <h2>Fremgang og utvikling</h2>
  <p>{{report.progress}}</p>
  
  <h2>Utfordringer</h2>
  <p>{{report.challenges}}</p>
  
  <h2>Faktorer som påvirker</h2>
  <p>{{report.factors}}</p>
  
  <h2>Vurdering</h2>
  <p>{{report.assessment}}</p>
  
  <h2>Anbefalinger</h2>
  <p>{{report.recommendations}}</p>
</div>`
};

function TemplatesContent() {
  const { fetchWithAuth } = useCompany();
  const [activeTab, setActiveTab] = useState<'timesheet' | 'case_report'>('timesheet');
  const [html, setHtml] = useState('');
  const [css, setCss] = useState('body { font-family: Arial, sans-serif; }');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadTemplate(activeTab);
  }, [activeTab]);

  const loadTemplate = async (type: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/templates/${type}`);
      const data = await res.json();
      setHtml(data.template_html || exampleTemplates[type as keyof typeof exampleTemplates]);
      setCss(data.template_css || 'body { font-family: Arial, sans-serif; }');
    } catch (error) {
      console.error('Failed to load template:', error);
      setHtml(exampleTemplates[type as keyof typeof exampleTemplates]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      await fetchWithAuth(`${API_BASE}/api/company/templates/${activeTab}`, {
        method: 'PUT',
        body: JSON.stringify({ template_html: html, template_css: css }),
      });
      setMessage('Mal lagret!');
    } catch (error) {
      setMessage('Kunne ikke lagre mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dokumentmaler</Typography>
      
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab label="Timeliste" value="timesheet" />
        <Tab label="Saksrapport" value="case_report" />
      </Tabs>

      {message && <Alert severity={message.includes('feilet') ? 'error' : 'success'} sx={{ mb: 2 }}>{message}</Alert>}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>HTML</Typography>
              <TextField
                fullWidth
                multiline
                rows={20}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="Skriv HTML med Handlebars-variabler..."
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Tilgjengelige variabler: {{company.name}}, {{period.month_label}}, {{totals.total_hours}}, {{per_case}}, {{report.*}}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>CSS</Typography>
              <TextField
                fullWidth
                multiline
                rows={20}
                value={css}
                onChange={(e) => setCss(e.target.value)}
                placeholder="Skriv CSS..."
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={loading}>
          Lagre mal
        </Button>
      </Box>
    </Box>
  );
}

export default function TemplatesPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <TemplatesContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
