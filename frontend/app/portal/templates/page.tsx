'use client';

import { Box, Typography, Card, CardContent } from '@mui/material';
import { CompanyProvider } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

function TemplatesContent() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Maler</Typography>
      <Card>
        <CardContent>
          <Typography color="text.secondary">
            HTML/CSS mal-editor kommer snart...
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function TemplatesPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <TemplatesContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
