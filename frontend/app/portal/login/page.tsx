'use client';

import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Container } from '@mui/material';
import { useCompany, CompanyProvider } from '../../../contexts/CompanyContext';
import { useTranslations } from '../../../contexts/TranslationsContext';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useCompany();
  const { t } = useTranslations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Innlogging feilet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <img src="/icons/logo.svg" alt="Smart Timing" style={{ height: 36 }} />
            </Box>
            <Typography variant="h4" gutterBottom align="center">
              {t('portal.login.title', 'Bedriftsportal')}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
              {t('portal.login.subtitle', 'Logg inn med bedriftskonto')}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label={t('fields.email', 'E-post')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                autoFocus
              />
              <TextField
                fullWidth
                label={t('portal.login.password', 'Passord')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
              />
              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={loading}
                sx={{ mt: 3 }}
                size="large"
              >
                {loading ? t('portal.login.loading', 'Logger inn...') : t('portal.login.submit', 'Logg inn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}

export default function PortalLoginPage() {
  return (
    <CompanyProvider>
      <LoginContent />
    </CompanyProvider>
  );
}
