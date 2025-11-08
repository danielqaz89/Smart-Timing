'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, IconButton, Alert } from '@mui/material';
import { Save, Add, Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type Setting = { setting_key: string; setting_value: any; description?: string };

function SettingsContent() {
  const { fetchWithAuth, admin: currentAdmin } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/settings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSettings(data);
    } catch (e: any) { setError(e.message || 'Failed to load'); }
  };

  useEffect(() => { load(); }, []);

  const save = async (s: Setting) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/settings/${encodeURIComponent(s.setting_key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value: s.setting_value, description: s.description || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      enqueueSnackbar(`Lagret: ${s.setting_key}`, { variant: 'success' });
      await load();
    } catch (e: any) { 
      setError(e.message || 'Failed to save');
      enqueueSnackbar(`Kunne ikke lagre: ${e?.message || e}`, { variant: 'error' });
    }
  };

  const add = async () => {
    if (!newKey.trim()) return;
    let parsed: any;
    try { parsed = newValue ? JSON.parse(newValue) : null; } catch { parsed = newValue; }
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/settings/${encodeURIComponent(newKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ value: parsed, description: newDesc || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add');
      enqueueSnackbar(`Opprettet setting: ${newKey}`, { variant: 'success' });
      setNewKey(''); setNewValue(''); setNewDesc('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to add');
      enqueueSnackbar(`Kunne ikke opprette: ${e?.message || e}`, { variant: 'error' });
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.system_settings.title', 'System Settings')}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField label={t('fields.setting_key', 'Setting Key')} value={newKey} onChange={(e)=>setNewKey(e.target.value)} size="small" />
        <TextField label={t('fields.value_json_or_text', 'Value (JSON or text)')} value={newValue} onChange={(e)=>setNewValue(e.target.value)} size="small" fullWidth />
        <TextField label={t('fields.description', 'Description')} value={newDesc} onChange={(e)=>setNewDesc(e.target.value)} size="small" />
        <Button variant="contained" startIcon={<Add />} onClick={add} disabled={currentAdmin?.role !== 'super_admin'}>{t('common.add', 'Add')}</Button>
      </Box>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('table.key', 'Key')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('table.value', 'Value')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('table.description', 'Description')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('common.save', 'Save')}</th>
          </tr>
        </thead>
        <tbody>
          {settings.map((s) => (
            <tr key={s.setting_key} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: 8 }}>{s.setting_key}</td>
              <td style={{ padding: 8 }}>
                <TextField
                  size="small"
                  fullWidth
                  value={typeof s.setting_value === 'string' ? s.setting_value : JSON.stringify(s.setting_value ?? null)}
                  onChange={(e) => {
                    let v: any = e.target.value;
                    try { v = JSON.parse(v); } catch { void 0; }
                    setSettings(prev => prev.map(x => x.setting_key === s.setting_key ? { ...x, setting_value: v } : x));
                  }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <TextField size="small" fullWidth value={s.description || ''} onChange={(e) => setSettings(prev => prev.map(x => x.setting_key === s.setting_key ? { ...x, description: e.target.value } : x))} />
              </td>
              <td style={{ padding: 8 }}>
                <Button size="small" startIcon={<Save />} onClick={() => save(s)} disabled={currentAdmin?.role !== 'super_admin'}>{t('common.save', 'Save')}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <SettingsContent />
      </AdminLayout>
    </AdminProvider>
  );
}