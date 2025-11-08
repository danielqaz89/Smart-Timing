"use client";
import { useEffect, useState } from 'react';
import { fetchCmsPage, submitContactForm, API_BASE } from '../../lib/api';
import { Box, Button, Container, Grid, Link as MuiLink, Stack, TextField, Typography, Checkbox, FormControlLabel, Alert } from '@mui/material';
import { useTranslations } from '../../contexts/TranslationsContext';

export default function LandingPage() {
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslations();

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchCmsPage('landing');
        setPage(data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Container sx={{ py: 6 }}><Typography>{t('landing.loading', 'Laster...')}</Typography></Container>;
  if (error) return <Container sx={{ py: 6 }}><Typography color="error">{error || t('landing.error', 'Kunne ikke laste siden')}</Typography></Container>;

  const sections: any[] = Array.isArray(page?.sections) ? page.sections : [];

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {sections.sort((a,b)=> (a.order||0)-(b.order||0)).map((s) => (
        <Box key={s.id} sx={{ py: 6 }}>
          {renderSection(s)}
        </Box>
      ))}
    </Container>
  );
}

function renderSection(s: any) {
  const c = s?.content || {};
  switch (s?.type) {
    case 'hero':
      return (
        <Stack spacing={2} alignItems="center" textAlign="center">
          <Typography variant="h2" fontWeight={800}>{c.title}</Typography>
          {c.subtitle && <Typography variant="h6" color="text.secondary">{c.subtitle}</Typography>}
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            {c.cta_primary_text && <Button href={c.cta_primary_link || '#'} variant="contained" size="large">{c.cta_primary_text}</Button>}
            {c.cta_secondary_text && <Button href={c.cta_secondary_link || '#'} variant="outlined" size="large">{c.cta_secondary_text}</Button>}
          </Stack>
        </Stack>
      );
    case 'features':
      return (
        <Stack spacing={3}>
          <Typography variant="h4" fontWeight={700}>{c.title}</Typography>
          <Grid container spacing={2}>
            {(c.features || []).map((f: any, i: number) => (
              <Grid key={i} item xs={12} sm={6} md={4}>
                <Stack spacing={1} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="h3" component="div">{f.icon}</Typography>
                  <Typography variant="h6" fontWeight={700}>{f.title}</Typography>
                  <Typography color="text.secondary">{f.description}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Stack>
      );
    case 'cta':
      return (
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ p: 4, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={800}>{c.title}</Typography>
          <Stack direction="row" spacing={2}>
            {c.primary?.text && <Button href={c.primary?.href || '#'} variant="contained">{c.primary.text}</Button>}
            {c.secondary?.text && <Button href={c.secondary?.href || '#'} variant="outlined">{c.secondary.text}</Button>}
          </Stack>
        </Stack>
      );
    case 'testimonials':
      return (
        <Stack spacing={2}>
          <Typography variant="h4" fontWeight={700}>{c.title}</Typography>
          <Grid container spacing={2}>
            {(c.items || []).map((t: any, i: number) => (
              <Grid key={i} item xs={12} md={4}>
                <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                  <Typography variant="body1">“{t.quote}”</Typography>
                  <Typography variant="body2" color="text.secondary">— {t.name}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Stack>
      );
    case 'logos':
      return (
        <Stack spacing={2}>
          <Typography variant="h4" fontWeight={700}>{c.title}</Typography>
          <Grid container spacing={2}>
            {(c.items || []).map((src: string, i: number) => (
              <Grid key={i} item xs={6} sm={4} md={2}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="logo" src={src} style={{ width: '100%', height: 56, objectFit: 'contain' }} />
              </Grid>
            ))}
          </Grid>
        </Stack>
      );
    case 'partners':
      return (
        <Stack spacing={2}>
          <Typography variant="h4" fontWeight={700}>{c.title}</Typography>
          <Grid container spacing={2}>
            {(c.items || []).map((p: any, i: number) => (
              <Grid key={i} item xs={6} sm={4} md={2}>
                <a href={p.website_url || '#'} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={p.name || 'partner'} src={p.logo_url} style={{ width: '100%', height: 56, objectFit: 'contain' }} />
                </a>
              </Grid>
            ))}
          </Grid>
        </Stack>
      );
    case 'contact':
      return (
        <Stack spacing={1}>
          <Typography variant="h4" fontWeight={700}>{c.title || t('landing.contact_us', 'Kontakt oss')}</Typography>
          {c.subtitle && <Typography color="text.secondary">{c.subtitle}</Typography>}
          {c.email && <Typography>{t('landing.email', 'E-post')}: <MuiLink href={`mailto:${c.email}`}>{c.email}</MuiLink></Typography>}
          {c.phone && <Typography>{t('landing.phone', 'Telefon')}: {c.phone}</Typography>}
          {c.address && <Typography>{t('landing.address', 'Adresse')}: {c.address}</Typography>}
        </Stack>
      );
    case 'form':
      return <ContactForm section={s} />;
    case 'footer':
      return (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {(c.links || []).map((l: any, i: number) => (
            <MuiLink key={i} href={l.href} underline="hover">{l.label}</MuiLink>
          ))}
        </Stack>
      );
    default:
      return <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(s, null, 2)}</pre>;
  }
}

function ContactForm({ section }: { section: any }) {
  const c = section?.content || {};
  const fields: any[] = Array.isArray(c.fields) ? c.fields : [];
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(name: string, val: any) {
    setValues((v) => ({ ...v, [name]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await submitContactForm({ page_id: 'landing', form_id: section.id, values });
      setDone(true);
      } catch (e: any) {
        setError(e?.message || t('landing.form_failed', 'Kunne ikke sende'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <Alert severity="success">{c.success_message || t('landing.form_success', 'Takk! Vi har mottatt meldingen din.')}</Alert>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Stack spacing={2}>
        {c.title && <Typography variant="h4" fontWeight={700}>{c.title}</Typography>}
        {c.description && <Typography color="text.secondary">{c.description}</Typography>}
        {fields.map((f) => {
          const name = String(f.name || '').trim();
          const label = f.label || name;
          if (!name) return null;
          if (f.type === 'checkbox') {
            return (
              <FormControlLabel key={name} control={<Checkbox checked={!!values[name]} onChange={(e)=>handleChange(name, e.target.checked)} />} label={label} />
            );
          }
          return (
            <TextField
              key={name}
              type={f.type === 'email' ? 'email' : 'text'}
              label={label}
              placeholder={f.placeholder || ''}
              required={!!f.required}
              value={values[name] || ''}
              onChange={(e)=>handleChange(name, e.target.value)}
              multiline={f.type === 'textarea'}
              minRows={f.type === 'textarea' ? 4 : undefined}
              fullWidth
            />
          );
        })}
        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={busy}>{c.submit_text || t('common.send', 'Send')}</Button>
          {c.privacy_link && <MuiLink href={c.privacy_link} underline="hover">{t('landing.privacy', 'Personvern')}</MuiLink>}
        </Stack>
        {error && <Typography color="error">{error}</Typography>}
      </Stack>
    </Box>
  );
}