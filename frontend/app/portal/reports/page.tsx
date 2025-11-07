'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import { Check, Close, Visibility } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function ReportsContent() {
  const { fetchWithAuth } = useCompany();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/case-reports`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('Godkjenn denne rapporten?')) return;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Saksrapporter</Typography>
      
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
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Bruker</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Saksnr</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Måned</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Innsendt</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Handlinger</TableCell>
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
        <DialogTitle>Rapport - {selectedReport?.case_id} ({selectedReport?.month})</DialogTitle>
        <DialogContent>
          <Box sx={{ '& > *': { mb: 2 } }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Bakgrunn</Typography>
              <Typography>{selectedReport?.background || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Tiltak gjennomført</Typography>
              <Typography>{selectedReport?.actions || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Fremgang</Typography>
              <Typography>{selectedReport?.progress || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Utfordringer</Typography>
              <Typography>{selectedReport?.challenges || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Vurdering</Typography>
              <Typography>{selectedReport?.assessment || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Anbefalinger</Typography>
              <Typography>{selectedReport?.recommendations || '-'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedReport(null)}>Lukk</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onClose={() => { setShowRejectDialog(false); setRejectionReason(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>Avslå rapport</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Begrunnelse"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowRejectDialog(false); setRejectionReason(''); }}>Avbryt</Button>
          <Button onClick={handleReject} variant="contained" color="error">Avslå</Button>
        </DialogActions>
      </Dialog>
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
