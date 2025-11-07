'use client';

import { Box, Typography, Card, CardContent } from '@mui/material';
import { CompanyProvider } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

function ReportsContent() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Rapporter</Typography>
      <Card>
        <CardContent>
          <Typography color="text.secondary">
            Månedlige rapporter kommer snart...
          </Typography>
        </CardContent>
      </Card>
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
