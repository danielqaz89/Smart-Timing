'use client';

import { Box, Typography, Card, CardContent } from '@mui/material';
import { CompanyProvider } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

function SettingsContent() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Innstillinger</Typography>
      <Card>
        <CardContent>
          <Typography color="text.secondary">
            Innstillinger for policy-håndhevelse kommer snart...
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function SettingsPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <SettingsContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
