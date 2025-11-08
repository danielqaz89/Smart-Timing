'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, Chip } from '@mui/material';
import { useSnackbar } from 'notistack';
import { TableVirtuoso } from 'react-virtuoso';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function AuditContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar } = useSnackbar();
  const [logs, setLogs] = useState<any[]>([]);
  const [action, setAction] = useState('');
  const [adminId, setAdminId] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    try {
      setError('');
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (action.trim()) params.set('action', action.trim());
      if (adminId.trim()) params.set('admin_id', adminId.trim());
      const res = await fetchWithAuth(`${API_BASE}/api/admin/audit-log?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load logs');
      setLogs(data.logs || []);
    } catch (e: any) {
      enqueueSnackbar(e.message || 'Failed to load logs', { variant: 'error' });
    }
  };

  useEffect(() => { loadLogs(); }, [offset, limit]);

  const components = {
    Scroller: React.forwardRef<HTMLDivElement>((props, ref) => <div {...props} ref={ref} style={{ overflowX: 'auto' }} />),
    Table: (props: any) => <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />,
    TableHead: React.forwardRef<HTMLTableSectionElement>((props, ref) => <thead {...props} ref={ref} />),
    TableRow: (props: any) => <tr {...props} style={{ borderBottom: '1px solid #eee' }} />,
    TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => <tbody {...props} ref={ref} />),
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('admin.audit.title', 'Audit Log')}</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField label={t('admin.audit.filter_action', 'Action')} value={action} onChange={(e) => setAction(e.target.value)} size="small" />
        <TextField label={t('admin.audit.filter_admin_id', 'Admin ID')} value={adminId} onChange={(e) => setAdminId(e.target.value)} size="small" />
        <Button variant="contained" onClick={() => { setOffset(0); loadLogs(); }}>{t('common.search', 'Søk')}</Button>
        <Chip label={`${t('common.offset', 'Offset')}: ${offset}`} />
        <Chip label={`${t('common.limit', 'Limit')}: ${limit}`} />
        <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>{t('common.prev', 'Forrige')}</Button>
        <Button onClick={() => setOffset(offset + limit)}>{t('common.next', 'Neste')}</Button>
      </Box>

      <Box sx={{ height: 600, border: '1px solid #e0e0e0', borderRadius: 1 }}>
        <TableVirtuoso
          data={logs}
          components={components}
          fixedHeaderContent={() => (
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.time', 'Tid')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.admin', 'Admin')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.email', 'Epost')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.action', 'Action')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.target', 'Target')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.details', 'Detaljer')}</th>
              <th style={{ padding: 8, textAlign: 'left' }}>{t('audit.ip', 'IP')}</th>
            </tr>
          )}
          itemContent={(i, row) => (
            <>
              <td style={{ padding: 8 }}>{new Date(row.created_at).toLocaleString()}</td>
              <td style={{ padding: 8 }}>{row.admin_username || '-'}</td>
              <td style={{ padding: 8 }}>{row.admin_email || '-'}</td>
              <td style={{ padding: 8 }}>{row.action}</td>
              <td style={{ padding: 8 }}>{row.target_type}#{row.target_id}</td>
              <td style={{ padding: 8, maxWidth: 400, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{typeof row.details === 'object' ? JSON.stringify(row.details) : (row.details || '')}</td>
              <td style={{ padding: 8 }}>{row.ip_address || '-'}</td>
            </>
          )}
        />
      </Box>
    </Box>
  );
}

export default function AdminAuditPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <AuditContent />
      </AdminLayout>
    </AdminProvider>
  );
}