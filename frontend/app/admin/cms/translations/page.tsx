'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import { useSnackbar } from 'notistack';
import { AdminProvider, useAdmin } from '../../../../contexts/AdminContext';
import AdminLayout from '../../../../components/AdminLayout';
import { useTranslations } from '../../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CmsTranslationsContent() {
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [translations, setTranslations] = useState<any>({});
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/translations`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setTranslations(data);
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to load', { variant: 'error' }); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/translations`, {
        method: 'PUT',
        body: JSON.stringify(translations),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      enqueueSnackbar('Translations saved', { variant: 'success' });
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to save', { variant: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.cms.translations.title', 'CMS Translations')}</Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={save}>{t('common.save_all', 'Save All')}</Button>
          <Button variant="outlined" onClick={load}>{t('common.reload', 'Reload')}</Button>
          <Button variant="outlined" onClick={async () => {
            try {
              const res = await fetch('/i18n/new_translations.json', { cache: 'no-store' });
              if (!res.ok) throw new Error('Failed to fetch new_translations.json');
              const extra = await res.json();
              setTranslations((prev: any) => ({ ...prev, ...extra }));
              enqueueSnackbar('Translations imported (not saved yet)', { variant: 'success' });
            } catch (e: any) {
              enqueueSnackbar(e?.message || 'Import failed', { variant: 'error' });
            }
          }}>Import new</Button>
        </Box>
      </Box>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('table.key', 'Key')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('table.category', 'Category')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>NO</th>
            <th style={{ textAlign: 'left', padding: 8 }}>EN</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(translations).map((t: any) => (
            <tr key={(t as any).key} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: 8 }}>{(t as any).key}</td>
              <td style={{ padding: 8 }}>{(t as any).category || '-'}</td>
              <td style={{ padding: 8 }}>
                <TextField size="small" fullWidth value={(t as any).no || ''} onChange={(e)=>{
                  setTranslations((prev: any) => ({
                    ...prev,
                    [(t as any).key]: { ...prev[(t as any).key], no: e.target.value }
                  }));
                }} />
              </td>
              <td style={{ padding: 8 }}>
                <TextField size="small" fullWidth value={(t as any).en || ''} onChange={(e)=>{
                  setTranslations((prev: any) => ({
                    ...prev,
                    [(t as any).key]: { ...prev[(t as any).key], en: e.target.value }
                  }));
                }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

export default function AdminCmsTranslations() {
  return (
    <AdminProvider>
      <AdminLayout>
        <CmsTranslationsContent />
      </AdminLayout>
    </AdminProvider>
  );
}