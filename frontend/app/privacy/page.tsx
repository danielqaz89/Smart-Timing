import { Container, Typography, Box, Paper } from "@mui/material";

export const metadata = {
  title: "Privacy Policy - Smart Stempling",
};

export const viewport = {
  themeColor: "#0b1220",
};

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4, bgcolor: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(8px)' }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Privacy Policy
        </Typography>
        
        <Typography variant="caption" color="text.secondary" paragraph>
          Last updated: November 3, 2025
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            1. Introduction
          </Typography>
          <Typography paragraph>
            Smart Stempling ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our time tracking application.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            2. Information We Collect
          </Typography>
          <Typography paragraph>
            <strong>Personal Information:</strong>
          </Typography>
          <Typography component="ul" paragraph>
            <li>Name and email address (when you authenticate with Google)</li>
            <li>Project information (consultant name, company, client details)</li>
            <li>Time tracking data (dates, times, activities, notes)</li>
          </Typography>
          
          <Typography paragraph>
            <strong>Google Account Information:</strong>
          </Typography>
          <Typography component="ul" paragraph>
            <li>OAuth tokens to access your Google Sheets (stored securely on our servers)</li>
            <li>Email address from your Google account</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            3. How We Use Your Information
          </Typography>
          <Typography component="ul" paragraph>
            <li>To provide time tracking and timesheet generation services</li>
            <li>To sync your time logs with Google Sheets (when you authorize this)</li>
            <li>To send timesheets via email (when requested)</li>
            <li>To maintain and improve our application</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            4. Data Storage and Security
          </Typography>
          <Typography paragraph>
            Your data is stored in a secure PostgreSQL database. We implement industry-standard security measures including:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Encrypted data transmission (HTTPS/TLS)</li>
            <li>Secure authentication via Google OAuth 2.0</li>
            <li>Regular security updates and monitoring</li>
            <li>Limited access to production data</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            5. Google Sheets Integration
          </Typography>
          <Typography paragraph>
            When you connect your Google account:
          </Typography>
          <Typography component="ul" paragraph>
            <li>We request permission to read and write to your Google Sheets</li>
            <li>We only access sheets you explicitly configure in the app</li>
            <li>You can revoke access at any time through the app or Google Account settings</li>
            <li>We use service account impersonation to maintain secure access</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            6. Data Sharing
          </Typography>
          <Typography paragraph>
            We do not sell, trade, or rent your personal information to third parties. Your data is only accessed by:
          </Typography>
          <Typography component="ul" paragraph>
            <li>You (the user)</li>
            <li>Our application servers (to provide services)</li>
            <li>Google (when you use Google Sheets integration)</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            7. Your Rights
          </Typography>
          <Typography paragraph>
            You have the right to:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your data (by disconnecting your Google account)</li>
            <li>Revoke Google Sheets access at any time</li>
            <li>Export your data</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            8. Cookies and Tracking
          </Typography>
          <Typography paragraph>
            We use minimal cookies and local storage for:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Maintaining your session</li>
            <li>Storing user preferences (theme, view mode)</li>
            <li>No third-party tracking or advertising cookies</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            9. Data Retention
          </Typography>
          <Typography paragraph>
            We retain your data for as long as your account is active. When you disconnect your Google account or stop using the service, your data remains in the database but can be deleted upon request.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            10. Children's Privacy
          </Typography>
          <Typography paragraph>
            Smart Stempling is not intended for users under 16 years of age. We do not knowingly collect information from children.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            11. Changes to This Policy
          </Typography>
          <Typography paragraph>
            We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date at the top of this policy.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            12. Contact Us
          </Typography>
          <Typography paragraph>
            If you have questions about this Privacy Policy or how we handle your data, please contact us through the application or at the support channels provided.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            13. GDPR Compliance (EU Users)
          </Typography>
          <Typography paragraph>
            If you are located in the European Union, you have additional rights under GDPR:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Right to data portability</li>
            <li>Right to object to processing</li>
            <li>Right to withdraw consent</li>
            <li>Right to lodge a complaint with a supervisory authority</li>
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            Smart Stempling is a time tracking tool designed for consultants and freelancers. We are committed to transparency and protecting your privacy.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
