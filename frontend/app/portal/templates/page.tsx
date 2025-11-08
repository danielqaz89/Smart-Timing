'use client';
/* eslint-disable no-useless-escape */

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Tabs, Tab, TextField, Button, Grid, Card, CardContent, Alert, Stack, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Save, Visibility } from '@mui/icons-material';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

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
  const { t } = useTranslations();
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
      setMessage(t('portal.templates.saved', 'Mal lagret!'));
    } catch (error) {
      setMessage(t('portal.templates.save_failed', 'Kunne ikke lagre mal'));
    } finally {
      setLoading(false);
    }
  };

  // Quick insert helpers
  const insertTimesheetSection = () => {
    const snippet = `\n<section>\n  <h2>${t('portal.templates.ts_hours_per_case', 'Timer per sak')}</h2>\n  <table style="width:100%; border-collapse: collapse;">\n    <tr style="background:#f0f0f0">\n      <th style=\"border:1px solid #ddd; padding:8px;\">${t('portal.templates.case_id', 'Saksnummer')}</th>\n      <th style=\"border:1px solid #ddd; padding:8px;\">${t('portal.templates.hours', 'Timer')}</th>\n    </tr>\n    {{#each per_case}}\n    <tr>\n      <td style=\"border:1px solid #ddd; padding:8px;\">{{case_id}}</td>\n      <td style=\"border:1px solid #ddd; padding:8px;\">{{hours}}</td>\n    </tr>\n    {{/each}}\n  </table>\n</section>\n`;
    setHtml((h) => h + snippet);
  };

  const insertReportSkeleton = () => {
    const snippet = `\n<section>\n  <h2>${t('portal.templates.report_sections', 'Rapportseksjoner')}</h2>\n  <h3>${t('portal.templates.background', 'Bakgrunn')}</h3>\n  <p>{{report.background}}</p>\n  <h3>${t('portal.templates.actions_done', 'Tiltak gjennomført')}</h3>\n  <p>{{report.actions}}</p>\n  <h3>${t('portal.templates.progress', 'Fremgang')}</h3>\n  <p>{{report.progress}}</p>\n  <h3>${t('portal.templates.challenges', 'Utfordringer')}</h3>\n  <p>{{report.challenges}}</p>\n  <h3>${t('portal.templates.factors', 'Faktorer som påvirker')}</h3>\n  <p>{{report.factors}}</p>\n  <h3>${t('portal.templates.assessment', 'Vurdering')}</h3>\n  <p>{{report.assessment}}</p>\n  <h3>${t('portal.templates.recommendations', 'Anbefalinger')}</h3>\n  <p>{{report.recommendations}}</p>\n</section>\n`;
    setHtml((h) => h + snippet);
  };

  const insertHeader = () => {
    const snippet = `\n<header style=\"display:flex; justify-content:space-between; align-items:center;\">\n  <div>\n    <h1>{{company.name}}</h1>\n    <div>${t('portal.templates.period', 'Periode')}: {{period.month_label}}</div>\n  </div>\n  <div>\n    <!-- ${t('portal.templates.logo_hint', 'Bytt ut med logo-URL')} -->\n    <img src=\"{{company.logo_url}}\" alt=\"logo\" style=\"height:48px; object-fit:contain;\"/>\n  </div>\n</header>\n`;
    setHtml((h) => h + snippet);
  };

  const insertBaseStyles = () => {
    const snippet = `\n/* ${t('portal.templates.base_styles', 'Grunnleggende typografi og bord')}: */\nbody { font-family: Arial, sans-serif; }\nh1,h2,h3 { margin: 0 0 8px; }\nsection { margin: 16px 0; }\ntable { width: 100%; border-collapse: collapse; }\nth, td { border: 1px solid #ddd; padding: 8px; }\ntr:nth-child(even) { background: #fafafa; }\n`;
    setCss((c) => c + snippet);
  };

  // ===== Simple client-side preview rendering (very limited Handlebars) =====
  const getPath = (obj: any, path: string) => path.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
  const replaceVars = (str: string, dataObj: any) =>
    str.replace(/{{\s*([\w\.]+)\s*}}/g, (_, p: string) => {
      const v = getPath(dataObj, p);
      return v == null ? '' : String(v);
    });
  const renderEachBlocks = (tpl: string, dataObj: any) =>
    tpl.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (_m, arrKey: string, inner: string) => {
      const arr = dataObj?.[arrKey];
      if (!Array.isArray(arr)) return '';
      return arr
        .map((item) => replaceVars(inner, { ...dataObj, ...item }))
        .join('');
    });
  const simpleRender = (tpl: string, dataObj: any) => replaceVars(renderEachBlocks(tpl, dataObj), dataObj);

  const previewData = useMemo(() => {
    const monthLabel = new Date().toLocaleString('no-NO', { month: 'long', year: 'numeric' });
    return {
      company: { name: 'Eksempelselskap AS', logo_url: '/icons/company.svg' },
      period: { month_label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) },
      totals: { total_hours: 123.5, total_amount: 45678 },
      per_case: [
        { case_id: '2025-001', hours: 12.5 },
        { case_id: '2025-002', hours: 8 },
        { case_id: '2025-003', hours: 15.75 },
      ],
      report: {
        case_id: '2025-001',
        month: monthLabel,
        status: 'draft',
        background: 'Kort bakgrunn for tiltaket...',
        actions: 'Tiltak gjennomført denne måneden...',
        progress: 'Fremgang og utvikling...',
        challenges: 'Eventuelle utfordringer...',
        factors: 'Faktorer som påvirker...',
        assessment: 'Vurdering...',
        recommendations: 'Anbefalinger...'
      },
    };
  }, [activeTab]);

  const [previewPageMode, setPreviewPageMode] = useState<'web' | 'a4'>('web');
  const [previewOrientation, setPreviewOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [previewDir, setPreviewDir] = useState<'ltr' | 'rtl'>('ltr');
  const [previewDoc, setPreviewDoc] = useState('');
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const rendered = simpleRender(html || '', previewData);
        const printCSS = previewPageMode === 'a4'
          ? `@page { size: A4 ${previewOrientation}; margin: 16mm; } body { margin: 0; }`
          : '';
        const dirCSS = `html{direction:${previewDir};}`;
        const doc = `<!doctype html><html><head><meta charset=\"UTF-8\"/><style>${dirCSS}${printCSS}${css || ''}</style></head><body>${rendered}</body></html>`;
        setPreviewDoc(doc);
      } catch {
        const doc = `<!doctype html><html><head><meta charset=\"UTF-8\"/><style>${css || ''}</style></head><body><pre style=\"color:#b00020\">${t('portal.templates.preview_error', 'Forhåndsvisning feilet')}</pre></body></html>`;
        setPreviewDoc(doc);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [html, css, previewData, t, previewPageMode, previewOrientation, previewDir]);

  const downloadPreview = () => {
    try {
      const blob = new Blob([previewDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}-preview.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { void 0; }
  };

  const downloadPDF = async () => {
    try {
      const iframe = document.querySelector('iframe[title="template-preview"]') as HTMLIFrameElement | null;
      const doc = iframe?.contentDocument;
      if (!doc) return;
      const { jsPDF } = await import('jspdf');
      await import('html2canvas');
      const pdf = new jsPDF(previewOrientation === 'landscape' ? 'l' : 'p', 'pt', 'a4');
      await pdf.html(doc.body as HTMLElement, {
        margin: [20, 20, 20, 20],
        autoPaging: 'text',
        html2canvas: { scale: 0.8, useCORS: true },
      });
      pdf.save(`${activeTab}-preview.pdf`);
    } catch (e) {
      // Fallback: open print dialog
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(previewDoc);
        win.document.close();
        win.focus();
        win.print();
      }
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('portal.templates.title', 'Dokumentmaler')}</Typography>
      
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('portal.templates.tab_timesheet', 'Timeliste')} value="timesheet" />
        <Tab label={t('portal.templates.tab_case_report', 'Saksrapport')} value="case_report" />
      </Tabs>

      {message && (
        <Alert severity={message.includes('feilet') ? 'error' : 'success'} sx={{ mb: 2 }}>{message}</Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.templates.editor_html', 'HTML')}</Typography>
              <TextField
                fullWidth
                multiline
                rows={20}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={t('portal.templates.placeholder_html', 'Skriv HTML med Handlebars-variabler...')}
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t('portal.templates.variables_hint', 'Tilgjengelige variabler: {{company.name}}, {{period.month_label}}, {{totals.total_hours}}, {{per_case}}, {{report.*}}')}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={insertHeader}>{t('portal.templates.insert_header', 'Sett inn topptekst')}</Button>
                <Button size="small" variant="outlined" onClick={insertTimesheetSection}>{t('portal.templates.insert_timesheet_table', 'Sett inn timeliste-tabell')}</Button>
                <Button size="small" variant="outlined" onClick={insertReportSkeleton}>{t('portal.templates.insert_report_skeleton', 'Sett inn saksrapport-skjelett')}</Button>
                <Button size="small" component={"a" as any} href="https://handlebarsjs.com/guide/" target="_blank" rel="noreferrer">
                  {t('portal.templates.handlebars_docs', 'Handlebars-dokumentasjon')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.templates.editor_css', 'CSS')}</Typography>
              <TextField
                fullWidth
                multiline
                rows={12}
                value={css}
                onChange={(e) => setCss(e.target.value)}
                placeholder={t('portal.templates.placeholder_css', 'Skriv CSS...')}
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={insertBaseStyles}>{t('portal.templates.insert_base_styles', 'Sett inn grunnstiler')}</Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('portal.templates.preview', 'Forhåndsvisning')}</Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>{t('portal.templates.page_mode', 'Side')}</InputLabel>
                  <Select label={t('portal.templates.page_mode', 'Side')} value={previewPageMode} onChange={(e)=>setPreviewPageMode(e.target.value as any)}>
                    <MenuItem value="web">{t('portal.templates.web_fluid', 'Web (flytende)')}</MenuItem>
                    <MenuItem value="a4">{t('portal.templates.a4_print', 'A4 (utskrift)')}</MenuItem>
                  </Select>
                </FormControl>
                {previewPageMode === 'a4' && (
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>{t('portal.templates.orientation', 'Retning')}</InputLabel>
                    <Select label={t('portal.templates.orientation', 'Retning')} value={previewOrientation} onChange={(e)=>setPreviewOrientation(e.target.value as any)}>
                      <MenuItem value="portrait">{t('portal.templates.portrait', 'Stående')}</MenuItem>
                      <MenuItem value="landscape">{t('portal.templates.landscape', 'Liggende')}</MenuItem>
                    </Select>
                  </FormControl>
                )}
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>{t('portal.templates.direction', 'Skriveretning')}</InputLabel>
                  <Select label={t('portal.templates.direction', 'Skriveretning')} value={previewDir} onChange={(e)=>setPreviewDir(e.target.value as any)}>
                    <MenuItem value="ltr">LTR</MenuItem>
                    <MenuItem value="rtl">RTL</MenuItem>
                  </Select>
                </FormControl>
                <Button size="small" variant="outlined" onClick={downloadPreview}>{t('portal.templates.download_html', 'Last ned HTML')}</Button>
                <Button size="small" variant="contained" onClick={downloadPDF}>{t('portal.templates.download_pdf', 'Last ned PDF')}</Button>
              </Stack>

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                <iframe title="template-preview" style={{ width: '100%', height: 480, border: '0' }} srcDoc={previewDoc} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t('portal.templates.preview_hint', 'Forhåndsvisningen er veiledende og støtter enkle variabler og each-løkker.')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={loading}>
          {t('portal.templates.save', 'Lagre mal')}
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
