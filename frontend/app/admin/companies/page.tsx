'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip, IconButton, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Add, Delete, Edit, ExpandMore, Person } from '@mui/icons-material';
import { useSnackbar, type SnackbarKey } from 'notistack';
import { TableVirtuoso } from 'react-virtuoso';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface Company {
  id: number;
  name: string;
  logo_base64?: string;
  display_order: number;
  user_count?: number;
  created_at: string;
}

interface CompanyUser {
  id: number;
  user_email: string;
  google_email?: string;
  role: string;
  approved: boolean;
  cases: Array<{ id: number; case_id: string }>;
}

function CompaniesContent() {
  const { fetchWithAuth } = useAdmin();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { t } = useTranslations();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', logo_base64: '', display_order: 0 });
  const [userFormData, setUserFormData] = useState({ user_email: '', google_email: '', role: 'member', approved: false });
  const [loading, setLoading] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<number | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ companyId: number; user: CompanyUser } | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/companies`);
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch (error: any) {
      console.error('Failed to load companies:', error);
      enqueueSnackbar(`${t('admin.companies.load_failed', 'Failed to load companies')}: ${error?.message || error}`, { variant: 'error' });
    }
  }, [fetchWithAuth, enqueueSnackbar, t]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const loadCompanyUsers = async (companyId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/companies/${companyId}/users`);
      const data = await res.json();
      setCompanyUsers(data.users || []);
    } catch (error: any) {
      console.error('Failed to load company users:', error);
      enqueueSnackbar(`${t('admin.companies.load_users_failed', 'Failed to load company users')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleExpandCompany = (companyId: number) => {
    if (expandedCompany === companyId) {
      setExpandedCompany(null);
      setCompanyUsers([]);
    } else {
      setExpandedCompany(companyId);
      loadCompanyUsers(companyId);
    }
  };

  const handleCreateCompany = async () => {
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/companies`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      await loadCompanies();
      setDialogOpen(false);
      setFormData({ name: '', logo_base64: '', display_order: 0 });
      enqueueSnackbar(t('admin.companies.created', 'Company created'), { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`${t('admin.companies.create_failed', 'Failed to create company')}: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/companies/${selectedCompany.id}/users`, {
        method: 'POST',
        body: JSON.stringify(userFormData),
      });
      await loadCompanyUsers(selectedCompany.id);
      setUserDialogOpen(false);
      setUserFormData({ user_email: '', google_email: '', role: 'member', approved: false });
      enqueueSnackbar(t('admin.companies.user_added', 'User added to company'), { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`${t('admin.companies.user_add_failed', 'Failed to add user')}: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (companyId: number, userObj: CompanyUser) => {
    if (!confirm(t('admin.companies.remove_user_confirm', 'Are you sure you want to remove this user from the company?'))) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/companies/${companyId}/users/${userObj.id}`, {
        method: 'DELETE',
      });
      setLastRemoved({ companyId, user: userObj });
      await loadCompanyUsers(companyId);
      const key: SnackbarKey = enqueueSnackbar(t('admin.companies.user_removed_undo', 'Du slettet nettopp denne brukeren. Angre?'), {
        variant: 'info',
        action: () => (
          <Button color="secondary" size="small" onClick={async () => { await handleUndoRemoveUser(); closeSnackbar(key); }}>
            {t('common.undo', 'Angre')}
          </Button>
        ),
        autoHideDuration: 6000,
      } as any);
    } catch (error: any) {
      enqueueSnackbar(`${t('admin.companies.user_remove_failed', 'Failed to remove user')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleUndoRemoveUser = async () => {
    if (!lastRemoved) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/companies/${lastRemoved.companyId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          user_email: lastRemoved.user.user_email,
          google_email: lastRemoved.user.google_email || '',
          role: lastRemoved.user.role,
          approved: lastRemoved.user.approved,
        }),
      });
      await loadCompanyUsers(lastRemoved.companyId);
      enqueueSnackbar(t('admin.companies.user_restored', 'User restored'), { variant: 'success' });
      setLastRemoved(null);
    } catch (error: any) {
      enqueueSnackbar(`${t('admin.companies.user_add_failed', 'Failed to add user')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleApproveUser = async (companyId: number, userId: number) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/companies/${companyId}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: true }),
      });
      await loadCompanyUsers(companyId);
      enqueueSnackbar(t('admin.companies.user_approved', 'User approved'), { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`${t('admin.companies.user_approve_failed', 'Failed to approve user')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const VirtuosoTableComponents = {
    Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
      <div {...props} ref={ref} style={{ overflowX: 'auto' }} />
    )),
    Table: (props: any) => <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />,
    TableHead: React.forwardRef<HTMLTableSectionElement>((props, ref) => <thead {...props} ref={ref} />),
    TableRow: (props: any) => <tr {...props} style={{ borderBottom: '1px solid #e0e0e0' }} />,
    TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => <tbody {...props} ref={ref} />),
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('admin.companies.title', 'Companies')}</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          {t('admin.companies.new_company', 'New Company')}
        </Button>
      </Box>

      <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
        {companies.map((company) => (
          <Accordion key={company.id} expanded={expandedCompany === company.id} onChange={() => handleExpandCompany(company.id)}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {company.logo_base64 ? (
                    <img src={company.logo_base64} alt={company.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                  ) : (
                    <img src="/icons/company.svg" alt={company.name} style={{ width: 40, height: 40, objectFit: 'contain', opacity: 0.8 }} />
                  )}
                  <Typography variant="h6">{company.name}</Typography>
                </Box>
                <Chip label={`${company.user_count || 0} ${t('admin.companies.users_label', 'users')}`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">{t('admin.companies.company_users', 'Company Users')}</Typography>
                  <Button
                    size="small"
                    startIcon={<Add />}
                    onClick={() => {
                      setSelectedCompany(company);
                      setUserDialogOpen(true);
                    }}
                  >
                    {t('admin.companies.add_user', 'Add User')}
                  </Button>
                </Box>

                {companyUsers.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t('admin.companies.no_users', 'No users yet')}</Typography>
                ) : (
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.email', 'Email')}</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.google_email', 'Google Email')}</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.role', 'Role')}</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.status', 'Status')}</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.cases', 'Cases')}</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>{t('table.actions', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companyUsers.map((user) => (
                          <tr key={user.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '8px' }}>{user.user_email}</td>
                            <td style={{ padding: '8px' }}>{user.google_email || '-'}</td>
                            <td style={{ padding: '8px' }}>
                              <Chip label={user.role} size="small" />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <Chip
                                label={user.approved ? t('common.approved', 'Approved') : t('common.pending', 'Pending')}
                                size="small"
                                color={user.approved ? 'success' : 'warning'}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              {user.cases.length > 0 ? user.cases.map(c => c.case_id).join(', ') : '-'}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {!user.approved && (
                                <Button
                                  size="small"
                                  onClick={() => handleApproveUser(company.id, user.id)}
                                  title={t('admin.companies.approve_user', 'Approve user')}
                                >
                                  {t('common.approve', 'Approve')}
                                </Button>
                              )}
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteUser(company.id, user)}
                                title={t('admin.companies.remove_user', 'Remove user')}
                                aria-label={t('admin.companies.remove_user', 'Remove user')}
                              >
                                <Delete />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* Create Company Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.companies.create_title', 'Create New Company')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.company_name', 'Company Name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label={t('fields.display_order', 'Display Order')}
            type="number"
            value={formData.display_order}
            onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label={t('fields.logo_base64_optional', 'Logo Base64 (optional)')}
            value={formData.logo_base64}
            onChange={(e) => setFormData({ ...formData, logo_base64: e.target.value })}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleCreateCompany} variant="contained" disabled={loading || !formData.name}>
            {t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.companies.add_user_to', 'Add User to')} {selectedCompany?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.user_email', 'User Email')}
            type="email"
            value={userFormData.user_email}
            onChange={(e) => setUserFormData({ ...userFormData, user_email: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label={t('fields.google_email_optional', 'Google Email (optional)')}
            type="email"
            value={userFormData.google_email}
            onChange={(e) => setUserFormData({ ...userFormData, google_email: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            select
            label={t('fields.role', 'Role')}
            value={userFormData.role}
            onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
            SelectProps={{ native: true }}
            sx={{ mb: 2 }}
          >
            <option value="member">{t('roles.member', 'Member')}</option>
            <option value="case_manager">{t('roles.case_manager', 'Case Manager')}</option>
            <option value="admin">{t('roles.admin', 'Admin')}</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleAddUser} variant="contained" disabled={loading || !userFormData.user_email}>
            {t('admin.companies.add_user', 'Add User')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function AdminCompaniesPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <CompaniesContent />
      </AdminLayout>
    </AdminProvider>
  );
}
