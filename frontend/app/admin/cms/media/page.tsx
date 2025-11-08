'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Grid, Card, CardContent, CardMedia, IconButton } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { AdminProvider, useAdmin } from '../../../../contexts/AdminContext';
import AdminLayout from '../../../../components/AdminLayout';
import { useTranslations } from '../../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CmsMediaContent() {
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [files, setFiles] = useState<any[]>([]);

  const load = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/media`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setFiles(data);
    } catch (e: any) { enqueueSnackbar(e.message || 'Failed to load', { variant: 'error' }); }
  };

  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/media`, { method: 'POST', body: fd });
    if (!res.ok) {
      const d = await res.json().catch(()=>({error:'Failed'}));
      enqueueSnackbar(d.error || 'Failed to upload', { variant: 'error' });
    } else {
      enqueueSnackbar(t('admin.cms.media.file_uploaded', 'File uploaded'), { variant: 'success' });
    }
    await load();
  };

  const remove = async (id: number) => {
    const res = await fetchWithAuth(`${API_BASE}/api/admin/cms/media/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(()=>({error:'Failed'}));
      enqueueSnackbar(d.error || 'Failed to delete', { variant: 'error' });
    } else {
      enqueueSnackbar(t('admin.cms.media.file_deleted', 'File deleted'), { variant: 'success' });
    }
    await load();
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.cms.media.title', 'CMS Media')}</Typography>

      <Button variant="outlined" component="label" sx={{ mb: 2 }}>
        {t('admin.cms.media.upload', 'Upload File')}
        <input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </Button>

      <Grid container spacing={2}>
        {files.map((f) => (
          <Grid item xs={12} sm={6} md={4} key={f.id}>
            <Card>
              {String(f.type || '').startsWith('image/') ? (
                <CardMedia component="img" height="160" image={f.url} alt={f.original_filename} />
              ) : null}
              <CardContent>
                <Typography variant="subtitle2">{f.original_filename}</Typography>
                <Typography variant="caption" color="text.secondary">{f.type} • {Math.round((f.size || 0)/1024)} KB</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton color="error" onClick={() => remove(f.id)}>
                    <Delete />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default function AdminCmsMedia() {
  return (
    <AdminProvider>
      <AdminLayout>
        <CmsMediaContent />
      </AdminLayout>
    </AdminProvider>
  );
}