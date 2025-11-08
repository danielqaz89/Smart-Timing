'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CasesContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseNotes, setNewCaseNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/users`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleAddCase = async () => {
    if (!newCaseId.trim() || !selectedUser) return;
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${selectedUser.id}/cases`, {
        method: 'POST',
        body: JSON.stringify({ case_id: newCaseId.trim(), notes: newCaseNotes.trim() }),
      });
      await loadUsers();
      enqueueSnackbar('Sak lagt til', { variant: 'success' });
      setDialogOpen(false);
      setNewCaseId('');
      setNewCaseNotes('');
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke legge til sak: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCase = async (userId, caseRowId) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${userId}/cases/${caseRowId}`, {
        method: 'DELETE',
      });
      await loadUsers();
      enqueueSnackbar('Sak fjernet', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke fjerne sak: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const filteredUsers = users.filter(u =>
    (u.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.google_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.cases?.some(c => c.case_id?.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const VirtuosoTableComponents = {
    Scroller: React.forwardRef((props, ref) => (
      <div {...props} ref={ref} style={{ overflowX: 'auto' }} />
    )),
    Table: (props) => <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />,
    TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} />),
    TableRow: (props) => <tr {...props} style={{ borderBottom: '1px solid #e0e0e0' }} />,
    TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref} />),
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('portal.cases.title', 'Saksadministrasjon')}</Typography>
      </Box>

      <TextField
        fullWidth
        placeholder={t('portal.cases.search_placeholder', 'Søk etter bruker eller saks-ID...')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Box sx={{ height: 600, border: '1px solid #e0e0e0', borderRadius: 1 }}>
        <TableVirtuoso
          data={filteredUsers}
          components={VirtuosoTableComponents}
          fixedHeaderContent={() => (
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('portal.cases.user', 'Bruker')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.google_email', 'Google-epost')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.role', 'Rolle')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.status', 'Status')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('portal.cases.assigned_cases', 'Tildelte saker')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.actions', 'Handlinger')}</th>
            </tr>
          )}
          itemContent={(index, user) => (
            <>
              <td style={{ padding: '12px' }}>{user.user_email || '-'}</td>
              <td style={{ padding: '12px' }}>{user.google_email || '-'}</td>
              <td style={{ padding: '12px' }}>
                <Chip label={user.role} size="small" />
              </td>
              <td style={{ padding: '12px' }}>
                <Chip
                  label={user.approved ? t('common.approved', 'Godkjent') : t('common.pending', 'Venter')}
                  size="small"
                  color={user.approved ? 'success' : 'warning'}
                />
              </td>
              <td style={{ padding: '12px' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {user.cases?.length > 0 ? (
                    user.cases.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.case_id}
                        size="small"
                        onDelete={() => handleRemoveCase(user.id, c.id)}
                        deleteIcon={<Delete />}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">{t('portal.cases.no_cases', 'Ingen saker')}</Typography>
                  )}
                </Box>
              </td>
              <td style={{ padding: '12px' }}>
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={() => {
                    setSelectedUser(user);
                    setDialogOpen(true);
                  }}
>
                  {t('portal.cases.add_case', 'Legg til sak')}
                </Button>
              </td>
            </>
          )}
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.cases.add_case_for', 'Legg til sak for')} {selectedUser?.user_email}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.case_id', 'Saks-ID')}
            value={newCaseId}
            onChange={(e) => setNewCaseId(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label={t('fields.notes_optional', 'Notater (valgfritt)')}
            value={newCaseNotes}
            onChange={(e) => setNewCaseNotes(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleAddCase} variant="contained" disabled={loading || !newCaseId.trim()}>
            {t('common.add', 'Legg til')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function CasesPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <CasesContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
