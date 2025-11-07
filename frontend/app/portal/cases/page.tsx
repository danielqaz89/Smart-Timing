'use client';

import { useState } from 'react';
import { Box, Typography, Card, CardContent, Button, TextField, Grid } from '@mui/material';
import { Add } from '@mui/icons-material';
import { CompanyProvider } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

function CasesContent() {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Saker</Typography>
        <Button variant="contained" startIcon={<Add />}>Ny sak</Button>
      </Box>
      <Card>
        <CardContent>
          <Typography color="text.secondary">
            Saksadministrasjon kommer snart...
          </Typography>
        </CardContent>
      </Card>
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
