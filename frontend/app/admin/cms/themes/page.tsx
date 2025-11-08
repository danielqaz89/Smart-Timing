'use client';

import React, { useState } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import { useSnackbar } from 'notistack';
import { AdminProvider, useAdmin } from '../../../../contexts/AdminContext';
import AdminLayout from '../../../../components/AdminLayout';
import { useTranslations } from '../../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CmsThemesContent() {
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [themeId, setThemeId] = useState('global');
  const [theme, setTheme] = useState<any | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/themes/${encodeURIComponent(themeId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setTheme(data);
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to load', { variant: 'error' }); }
  };

  const save = async () => {
    if (!theme) return;
    try {
      const colors = typeof theme.colors === 'string' ? JSON.parse(theme.colors) : theme.colors;
      const typography = typeof theme.typography === 'string' ? JSON.parse(theme.typography) : theme.typography;
      const spacing = typeof theme.spacing === 'string' ? JSON.parse(theme.spacing) : theme.spacing;
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/themes/${encodeURIComponent(themeId)}`, {
        method: 'PUT',
        body: JSON.stringify({ theme_name: theme.theme_name, colors, typography, spacing }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      enqueueSnackbar('Theme saved', { variant: 'success' });
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to save', { variant: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.cms.themes.title', 'CMS Themes')}</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField label={t('fields.theme_id', 'Theme ID')} value={themeId} onChange={(e)=>setThemeId(e.target.value)} size="small" />
        <Button variant="outlined" onClick={load}>{t('common.load', 'Load')}</Button>
        <Button variant="contained" onClick={save} disabled={!theme}>{t('common.save', 'Save')}</Button>
      </Box>

      {theme && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField label={t('fields.theme_name', 'Theme Name')} size="small" value={theme.theme_name || ''} onChange={(e)=>setTheme({ ...theme, theme_name: e.target.value })} />
          <TextField label={t('fields.colors_json', 'Colors (JSON)')} value={typeof theme.colors === 'string' ? theme.colors : JSON.stringify(theme.colors || {}, null, 2)} onChange={(e)=>setTheme({ ...theme, colors: e.target.value })} multiline minRows={6} />
          <TextField label={t('fields.typography_json', 'Typography (JSON)')} value={typeof theme.typography === 'string' ? theme.typography : JSON.stringify(theme.typography || {}, null, 2)} onChange={(e)=>setTheme({ ...theme, typography: e.target.value })} multiline minRows={6} />
          <TextField label={t('fields.spacing_json', 'Spacing (JSON)')} value={typeof theme.spacing === 'string' ? theme.spacing : JSON.stringify(theme.spacing || {}, null, 2)} onChange={(e)=>setTheme({ ...theme, spacing: e.target.value })} multiline minRows={6} />
        </Box>
      )}
    </Box>
  );
}

export default function AdminCmsThemes() {
  return (
    <AdminProvider>
      <AdminLayout>
        <CmsThemesContent />
      </AdminLayout>
    </AdminProvider>
  );
}