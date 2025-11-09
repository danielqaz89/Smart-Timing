'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert, AlertTitle, Stack, Badge, Fab, Checkbox, Card, CardContent, Grid } from '@mui/material';
import { Check, Close, Visibility, Assignment, CheckCircle, FilterList, Download, Comment, CheckCircleOutline, Cancel } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';
import EmptyState from '../../../components/portal/EmptyState';
import { TableSkeleton } from '../../../components/portal/SkeletonLoaders';
import UndoFab from '../../../components/portal/UndoFab';
import { usePortalUndo } from '../../../lib/hooks/usePortalUndo';
import { getStatusColor, successScale } from '../../../lib/portalStyles';
import FilterDrawer from '../../../components/portal/FilterDrawer';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function ReportsContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const { enqueueSnackbar } = useSnackbar();
  const { undoAction, setUndo, executeUndo } = usePortalUndo();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filters, setFilters] = useState({
    statuses: [] as string[],
    monthStart: '',
    monthEnd: '',
    userSearch: '',
    caseSearch: ''
  });
  const [comments, setComments] = useState<{[key: number]: any[]}>({});
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`${API_BASE}/api/company/case-reports`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
      enqueueSnackbar(t('portal.reports.load_failed', 'Kunne ikke laste rapporter'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm(t('portal.reports.approve_confirm', 'Godkjenn denne rapporten?'))) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/company/case-reports/${id}/approve`, { method: 'POST' });
      loadReports();
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleReject = async () => {
    if (!selectedReport) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/company/case-reports/${selectedReport.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      setShowRejectDialog(false);
      setRejectionReason('');
      setSelectedReport(null);
      loadReports();
      enqueueSnackbar('Rapport avslått', { variant: 'success' });
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Godkjenn ${selectedIds.length} rapporter?`)) return;
    try {
      await Promise.all(
        selectedIds.map(id => 
          fetchWithAuth(`${API_BASE}/api/company/case-reports/${id}/approve`, { method: 'POST' })
        )
      );
      enqueueSnackbar(
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircle sx={{ animation: `${successScale} 0.3s ease-out` }} />
          <span>{selectedIds.length} rapporter godkjent</span>
        </Stack> as any,
        { variant: 'success' }
      );
      setSelectedIds([]);
      loadReports();
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      enqueueSnackbar('Kunne ikke godkjenne rapporter', { variant: 'error' });
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = prompt(`Begrunnelse for avslag av ${selectedIds.length} rapporter:`);
    if (!reason) return;
    try {
      await Promise.all(
        selectedIds.map(id => 
          fetchWithAuth(`${API_BASE}/api/company/case-reports/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ rejection_reason: reason })
          })
        )
      );
      enqueueSnackbar(`${selectedIds.length} rapporter avslått`, { variant: 'success' });
      setSelectedIds([]);
      loadReports();
    } catch (error) {
      console.error('Failed to bulk reject:', error);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const reportsToExport = selectedIds.length > 0 
      ? filteredReports.filter(r => selectedIds.includes(r.id))
      : filteredReports;

    doc.text('Saksrapporter', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generert: ${new Date().toLocaleDateString('nb-NO')}`, 14, 22);

    const tableData = reportsToExport.map(r => [
      r.user_email || '',
      r.case_id || '',
      r.month || '',
      r.status || '',
      r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '-'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Bruker', 'Saksnr', 'Måned', 'Status', 'Innsendt']],
      body: tableData,
    });

    doc.save(`rapporter_${new Date().toISOString().split('T')[0]}.pdf`);
    enqueueSnackbar('PDF eksportert', { variant: 'success' });
  };

  const handleAddComment = async () => {
    if (!selectedReport || !newComment.trim()) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/company/case-reports/${selectedReport.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: newComment }),
      });
      setNewComment('');
      loadComments(selectedReport.id);
      enqueueSnackbar('Kommentar lagt til', { variant: 'success' });
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const loadComments = async (reportId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/case-reports/${reportId}/comments`);
      const data = await res.json();
      setComments(prev => ({ ...prev, [reportId]: data.comments || [] }));
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const filteredReports = reports.filter(report => {
    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(report.status)) {
      return false;
    }
    // Month range filter
    if (filters.monthStart && report.month < filters.monthStart) return false;
    if (filters.monthEnd && report.month > filters.monthEnd) return false;
    // User search
    if (filters.userSearch && !report.user_email?.toLowerCase().includes(filters.userSearch.toLowerCase())) {
      return false;
    }
    // Case search
    if (filters.caseSearch && !report.case_id?.toLowerCase().includes(filters.caseSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const activeFilterCount = 
    filters.statuses.length + 
    (filters.monthStart ? 1 : 0) + 
    (filters.monthEnd ? 1 : 0) +
    (filters.userSearch ? 1 : 0) +
    (filters.caseSearch ? 1 : 0);

  // Calculate analytics
  const totalReports = reports.length;
  const approvedReports = reports.filter(r => r.status === 'approved').length;
  const submittedReports = reports.filter(r => r.status === 'submitted').length;
  const rejectedReports = reports.filter(r => r.status === 'rejected').length;
  const approvalRate = totalReports > 0 ? ((approvedReports / totalReports) * 100).toFixed(1) : '0.0';

  const handleSelectAll = () => {
    if (selectedIds.length === filteredReports.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports.filter(r => r.status === 'submitted').map(r => r.id));
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>{t('portal.reports.title', 'Saksrapporter')}</Typography>
        <Paper elevation={3} sx={{ height: 600, overflow: 'hidden' }}>
          <TableSkeleton rows={8} />
        </Paper>
      </Box>
    );
  }

  if (!loading && reports.length === 0) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>{t('portal.reports.title', 'Saksrapporter')}</Typography>
        <Paper elevation={3}>
          <EmptyState
            icon={<Assignment />}
            title={t('portal.reports.empty', 'Ingen rapporter ennå')}
            description={t('portal.reports.empty_desc', 'Rapporter vil vises her når brukere sender inn saksrapporter.')}
          />
        </Paper>
        <UndoFab undoAction={undoAction} onUndo={executeUndo} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{t('portal.reports.title', 'Saksrapporter')}</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<Download />}
            variant="outlined"
            onClick={exportToPDF}
            disabled={filteredReports.length === 0}
          >
            Eksporter PDF
          </Button>
          <Badge badgeContent={activeFilterCount} color="primary">
            <Button
              startIcon={<FilterList />}
              variant="outlined"
              onClick={() => setFilterDrawerOpen(true)}
            >
              Filtre
            </Button>
          </Badge>
        </Stack>
      </Box>

      {/* Analytics Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Totalt</Typography>
              <Typography variant="h4">{totalReports}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Godkjenningsrate</Typography>
              <Typography variant="h4">{approvalRate}%</Typography>
              <Typography variant="caption" color="text.secondary">
                {approvedReports}/{totalReports}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Venter godkjenning</Typography>
              <Typography variant="h4">{submittedReports}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Avslått</Typography>
              <Typography variant="h4">{rejectedReports}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      <Paper elevation={3} sx={{ height: 600 }}>
        <TableVirtuoso
          data={filteredReports}
          components={{
            Table: (props) => <Table {...props} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
          }}
          fixedHeaderContent={() => (
            <TableRow>
              <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper' }}>
                <Checkbox
                  checked={selectedIds.length === filteredReports.filter(r => r.status === 'submitted').length && selectedIds.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < filteredReports.filter(r => r.status === 'submitted').length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.reports.user', 'Bruker')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.reports.case', 'Saksnr')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.reports.month', 'Måned')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.reports.status', 'Status')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('portal.reports.submitted', 'Innsendt')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.actions', 'Handlinger')}</TableCell>
            </TableRow>
          )}
          itemContent={(index, report) => (
            <>
              <TableCell padding="checkbox">
                {report.status === 'submitted' && (
                  <Checkbox
                    checked={selectedIds.includes(report.id)}
                    onChange={() => {
                      if (selectedIds.includes(report.id)) {
                        setSelectedIds(selectedIds.filter(id => id !== report.id));
                      } else {
                        setSelectedIds([...selectedIds, report.id]);
                      }
                    }}
                  />
                )}
              </TableCell>
              <TableCell>{report.user_email}</TableCell>
              <TableCell>{report.case_id}</TableCell>
              <TableCell>{report.month}</TableCell>
              <TableCell>
                <Chip label={report.status} color={getStatusColor(report.status)} size="small" />
              </TableCell>
              <TableCell>{report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : '-'}</TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => setSelectedReport(report)}>
                  <Visibility fontSize="small" />
                </IconButton>
                {report.status === 'submitted' && (
                  <>
                    <IconButton size="small" color="success" onClick={() => handleApprove(report.id)}>
                      <Check fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => { setSelectedReport(report); setShowRejectDialog(true); }}>
                      <Close fontSize="small" />
                    </IconButton>
                  </>
                )}
              </TableCell>
            </>
          )}
        />
      </Paper>

      {/* View Dialog */}
      <Dialog open={!!selectedReport && !showRejectDialog} onClose={() => setSelectedReport(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t('portal.reports.view_title', 'Rapport')} - {selectedReport?.case_id} ({selectedReport?.month})</DialogTitle>
        <DialogContent>
          {/* Rejection Feedback Banner */}
          {selectedReport?.status === 'rejected' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <AlertTitle>{t('portal.reports.rejected_title', 'Rapport avslått')}</AlertTitle>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>{t('portal.reports.reason', 'Begrunnelse')}:</strong> {selectedReport?.rejection_reason || t('portal.reports.no_reason', 'Ingen begrunnelse gitt')}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('portal.reports.rejected_by', 'Avslått')} {selectedReport?.rejected_at ? new Date(selectedReport.rejected_at).toLocaleString() : ''}
              </Typography>
            </Alert>
          )}
          
          <Box sx={{ '& > *': { mb: 2 } }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.background', 'Bakgrunn')}</Typography>
              <Typography>{selectedReport?.background || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.actions_done', 'Tiltak gjennomført')}</Typography>
              <Typography>{selectedReport?.actions || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.progress', 'Fremgang')}</Typography>
              <Typography>{selectedReport?.progress || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.challenges', 'Utfordringer')}</Typography>
              <Typography>{selectedReport?.challenges || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.assessment', 'Vurdering')}</Typography>
              <Typography>{selectedReport?.assessment || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">{t('portal.reports.recommendations', 'Anbefalinger')}</Typography>
              <Typography>{selectedReport?.recommendations || '-'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedReport(null)}>{t('common.close', 'Lukk')}</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onClose={() => { setShowRejectDialog(false); setRejectionReason(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.reports.reject_title', 'Avslå rapport')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            label={t('portal.reports.reason', 'Begrunnelse')}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowRejectDialog(false); setRejectionReason(''); }}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleReject} variant="contained" color="error">{t('portal.reports.reject', 'Avslå')}</Button>
        </DialogActions>
      </Dialog>

      {/* Filter Drawer */}
      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        onClear={() => setFilters({
          statuses: [],
          monthStart: '',
          monthEnd: '',
          userSearch: '',
          caseSearch: ''
        })}
      />

      {/* Batch Actions FAB */}
      {selectedIds.length > 0 && (
        <Box sx={{ position: 'fixed', bottom: 80, right: 16, display: 'flex', gap: 1 }}>
          <Fab
            variant="extended"
            color="error"
            onClick={handleBulkReject}
          >
            <Cancel sx={{ mr: 1 }} />
            Avslå ({selectedIds.length})
          </Fab>
          <Fab
            variant="extended"
            color="success"
            onClick={handleBulkApprove}
          >
            <CheckCircleOutline sx={{ mr: 1 }} />
            Godkjenn ({selectedIds.length})
          </Fab>
        </Box>
      )}

      <UndoFab undoAction={undoAction} onUndo={executeUndo} />
    </Box>
  );
}

export default function ReportsPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <ReportsContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
