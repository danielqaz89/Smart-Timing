'use client';

import { useEffect, useState } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Chip, Alert } from '@mui/material';
import { Add, Edit, Send } from '@mui/icons-material';
import { CompanyProvider, useCompany } from '../../contexts/CompanyContext';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CaseReportsContent() {
  const { fetchWithAuth, user } = useCompany();
  const [cases, setCases] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [formData, setFormData] = useState({
    user_cases_id: '',
    case_id: '',
    month: '',
    background: '',
    actions: '',
    progress: '',
    challenges: '',
    factors: '',
    assessment: '',
    recommendations: '',
    notes: '',
  });

  useEffect(() => {
    if (user) {
      loadCases();
      loadReports();
    }
  }, [user]);

  const loadCases = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/my-cases`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const loadReports = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/case-reports`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const handleSave = async () => {
    try {
      const method = editingReport ? 'PUT' : 'POST';
      const url = editingReport 
        ? `${API_BASE}/api/case-reports/${editingReport.id}` 
        : `${API_BASE}/api/case-reports`;
      
      await fetchWithAuth(url, {
        method,
        body: JSON.stringify(formData),
      });
      
      setEditingReport(null);
      setFormData({
        user_cases_id: '',
        case_id: '',
        month: '',
        background: '',
        actions: '',
        progress: '',
        challenges: '',
        factors: '',
        assessment: '',
        recommendations: '',
        notes: '',
      });
      loadReports();
    } catch (error) {
      console.error('Failed to save report:', error);
    }
  };

  const handleSubmit = async (reportId: number) => {
    if (!confirm('Send inn rapporten for godkjenning?')) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/case-reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'submitted' }),
      });
      loadReports();
    } catch (error) {
      console.error('Failed to submit report:', error);
    }
  };

  const startEdit = (report: any) => {
    setEditingReport(report);
    setFormData({
      user_cases_id: report.user_cases_id,
      case_id: report.case_id,
      month: report.month,
      background: report.background || '',
      actions: report.actions || '',
      progress: report.progress || '',
      challenges: report.challenges || '',
      factors: report.factors || '',
      assessment: report.assessment || '',
      recommendations: report.recommendations || '',
      notes: report.notes || '',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info">
          Du må være logget inn i bedriftsportalen for å skrive saksrapporter.
          <Link href="/portal/login"> Logg inn her</Link>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Mine saksrapporter</Typography>
        <Button variant="outlined" component={Link} href="/">Tilbake</Button>
      </Box>

      {/* Existing Reports */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {reports.map((report) => (
          <Grid item xs={12} md={6} key={report.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6">{report.case_id}</Typography>
                    <Typography color="text.secondary" variant="body2">{report.month}</Typography>
                  </Box>
                  <Chip label={report.status} color={getStatusColor(report.status)} size="small" />
                </Box>
                
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  {(report.status === 'draft' || report.status === 'rejected') && (
                    <>
                      <Button size="small" startIcon={<Edit />} onClick={() => startEdit(report)}>
                        Rediger
                      </Button>
                      <Button size="small" startIcon={<Send />} onClick={() => handleSubmit(report.id)}>
                        Send inn
                      </Button>
                    </>
                  )}
                </Box>
                
                {report.rejection_reason && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Avslått: {report.rejection_reason}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Report Form */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {editingReport ? 'Rediger rapport' : 'Ny saksrapport'}
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Sak</InputLabel>
                <Select
                  value={formData.user_cases_id}
                  label="Sak"
                  onChange={(e) => {
                    const selectedCase = cases.find(c => c.id === e.target.value);
                    setFormData({ 
                      ...formData, 
                      user_cases_id: e.target.value, 
                      case_id: selectedCase?.case_id || '' 
                    });
                  }}
                  disabled={!!editingReport}
                >
                  {cases.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.case_id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="month"
                label="Måned"
                InputLabelProps={{ shrink: true }}
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                disabled={!!editingReport}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Bakgrunn for tiltaket"
                value={formData.background}
                onChange={(e) => setFormData({ ...formData, background: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Arbeid og tiltak som er gjennomført"
                value={formData.actions}
                onChange={(e) => setFormData({ ...formData, actions: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Fremgang og utvikling"
                value={formData.progress}
                onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Utfordringer"
                value={formData.challenges}
                onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Faktorer som påvirker"
                value={formData.factors}
                onChange={(e) => setFormData({ ...formData, factors: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Vurdering"
                value={formData.assessment}
                onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Anbefalinger"
                value={formData.recommendations}
                onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notater (valgfritt)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleSave}>
              {editingReport ? 'Oppdater' : 'Lagre utkast'}
            </Button>
            {editingReport && (
              <Button onClick={() => {
                setEditingReport(null);
                setFormData({
                  user_cases_id: '',
                  case_id: '',
                  month: '',
                  background: '',
                  actions: '',
                  progress: '',
                  challenges: '',
                  factors: '',
                  assessment: '',
                  recommendations: '',
                  notes: '',
                });
              }}>
                Avbryt
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default function CaseReportsPage() {
  return (
    <CompanyProvider>
      <CaseReportsContent />
    </CompanyProvider>
  );
}
