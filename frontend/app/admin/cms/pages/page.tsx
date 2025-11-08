'use client';

import React, { useState } from 'react';
import { Box, Typography, TextField, Button, FormControlLabel, Switch } from '@mui/material';
import { useSnackbar } from 'notistack';
import { AdminProvider, useAdmin } from '../../../../contexts/AdminContext';
import AdminLayout from '../../../../components/AdminLayout';
import { useTranslations } from '../../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CmsPagesContent() {
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [pageId, setPageId] = useState('landing');
  const [page, setPage] = useState<any | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/pages/${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPage(data);
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to load', { variant: 'error' }); }
  };

  const save = async () => {
    if (!page) return;
    try {
      const sections = typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections;
      const meta = typeof page.meta === 'string' ? JSON.parse(page.meta) : page.meta;
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/pages/${encodeURIComponent(pageId)}`, {
        method: 'PUT',
        body: JSON.stringify({ page_name: page.page_name, sections, meta, is_published: page.is_published }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      enqueueSnackbar('Page saved', { variant: 'success' });
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to save', { variant: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.cms.pages.title', 'CMS Pages')}</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField label={t('fields.page_id', 'Page ID')} value={pageId} onChange={(e)=>setPageId(e.target.value)} size="small" />
        <Button variant="outlined" onClick={load}>{t('common.load', 'Load')}</Button>
        <Button variant="contained" onClick={save} disabled={!page}>{t('common.save', 'Save')}</Button>
      </Box>

      {page && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField label={t('fields.page_name', 'Page Name')} size="small" value={page.page_name || ''} onChange={(e)=>setPage({ ...page, page_name: e.target.value })} />
          <FormControlLabel control={<Switch checked={!!page.is_published} onChange={(e)=>setPage({ ...page, is_published: e.target.checked })} />} label={t('fields.published', 'Published')} />
          <TextField label={t('fields.sections_json', 'Sections (JSON)')} value={typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections || [], null, 2)} onChange={(e)=>setPage({ ...page, sections: e.target.value })} multiline minRows={8} />
          <TextField label={t('fields.meta_json', 'Meta (JSON)')} value={typeof page.meta === 'string' ? page.meta : JSON.stringify(page.meta || {}, null, 2)} onChange={(e)=>setPage({ ...page, meta: e.target.value })} multiline minRows={6} />
        </Box>
      )}
    </Box>
  );
}

export default function AdminCmsPages() {
  return (
    <AdminProvider>
      <AdminLayout>
        <CmsPagesContent />
      </AdminLayout>
    </AdminProvider>
  );
}