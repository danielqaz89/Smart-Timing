'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip } from '@mui/material';
import { Add, Delete, Send } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function InvitesContent() {
  const { t } = useTranslations();
  const { enqueueSnackbar } = useSnackbar();
  const { fetchWithAuth } = useCompany();
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: '', role: 'member' });

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/invites`);
      const data = await res.json();
      setInvites(data.invites || []);
    } catch (error) {
      console.error('Failed to load invites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/invites`, {
        method: 'POST',
        body: JSON.stringify(newInvite),
      });
      setDialogOpen(false);
      setNewInvite({ email: '', role: 'member' });
      loadInvites();
      enqueueSnackbar(t('portal.invites.created_toast', 'Invitasjon opprettet'), { variant: 'success' });
    } catch (error: any) {
      console.error('Failed to create invite:', error);
      enqueueSnackbar(`${t('portal.invites.create_failed', 'Kunne ikke opprette invitasjon')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleResend = async (id: number) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/invites/${id}/resend`, { method: 'POST' });
      enqueueSnackbar(t('portal.invites.resent', 'Invitasjon sendt på nytt'), { variant: 'success' });
    } catch (error: any) {
      console.error('Failed to resend:', error);
      enqueueSnackbar(`${t('portal.invites.resend_failed', 'Kunne ikke sende på nytt')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('portal.invites.delete_confirm', 'Sikker på at du vil slette invitasjonen?'))) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/company/invites/${id}`, { method: 'DELETE' });
      loadInvites();
      enqueueSnackbar(t('portal.invites.deleted', 'Invitasjon slettet'), { variant: 'success' });
    } catch (error: any) {
      console.error('Failed to delete:', error);
      enqueueSnackbar(`${t('portal.invites.delete_failed', 'Kunne ikke slette invitasjon')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('portal.invites.title', 'Invitasjoner')}</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          {t('portal.invites.new', 'Ny invitasjon')}
        </Button>
      </Box>

      <Paper elevation={3} sx={{ height: 600 }}>
        <TableVirtuoso
          data={invites}
          components={{
            Table: (props) => <Table {...props} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
          }}
          fixedHeaderContent={() => (
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.email', 'E-post')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.role', 'Rolle')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.status', 'Status')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.invites.created', 'Opprettet')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.actions', 'Handlinger')}</TableCell>
            </TableRow>
          )}
          itemContent={(index, invite) => (
            <>
              <TableCell>{invite.invited_email}</TableCell>
              <TableCell><Chip label={invite.role} size="small" /></TableCell>
              <TableCell>
                <Chip 
                  label={invite.used_at ? t('portal.invites.accepted', 'Akseptert') : t('common.pending', 'Venter')} 
                  color={invite.used_at ? 'success' : 'warning'}
                  size="small"
                />
              </TableCell>
              <TableCell>{new Date(invite.created_at).toLocaleDateString()}</TableCell>
              <TableCell align="right">
                {!invite.used_at && (
                  <>
                    <IconButton size="small" title={t('portal.invites.resend', 'Send på nytt')} onClick={() => handleResend(invite.id)}><Send fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" title={t('common.delete', 'Slett')} onClick={() => handleDelete(invite.id)}><Delete fontSize="small" /></IconButton>
                  </>
                )}
              </TableCell>
            </>
          )}
        />
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.invites.create_title', 'Opprett invitasjon')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.email', 'E-post')}
            type="email"
            value={newInvite.email}
            onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>{t('fields.role', 'Rolle')}</InputLabel>
            <Select value={newInvite.role} label={t('fields.role', 'Rolle')} onChange={(e) => setNewInvite({ ...newInvite, role: e.target.value })}>
              <MenuItem value="member">{t('roles.member', 'Medlem')}</MenuItem>
              <MenuItem value="case_manager">{t('roles.case_manager', 'Saksbehandler')}</MenuItem>
              <MenuItem value="admin">{t('roles.admin', 'Administrator')}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleCreate} variant="contained">{t('common.create', 'Opprett')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function InvitesPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <InvitesContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
