'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert, AlertTitle, Stack } from '@mui/material';
import { Check, Close, Visibility, Assignment, CheckCircle } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';
import EmptyState from '../../../components/portal/EmptyState';
import { TableSkeleton } from '../../../components/portal/SkeletonLoaders';
import UndoFab from '../../../components/portal/UndoFab';
import { usePortalUndo } from '../../../lib/hooks/usePortalUndo';
import { getStatusColor, successScale } from '../../../lib/portalStyles';

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
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  // Using getStatusColor from portalStyles instead

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
      <Typography variant="h4" gutterBottom>{t('portal.reports.title', 'Saksrapporter')}</Typography>
      
      <Paper elevation={3} sx={{ height: 600 }}>
        <TableVirtuoso
          data={reports}
          components={{
            Table: (props) => <Table {...props} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
          }}
          fixedHeaderContent={() => (
            <TableRow>
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
