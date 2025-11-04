import { Container, Typography, Box, Paper } from "@mui/material";

export const metadata = {
  title: "Terms of Service - Smart Stempling",
};

export const viewport = {
  themeColor: "#0b1220",
};

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4, bgcolor: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(8px)' }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Terms of Service
        </Typography>
        
        <Typography variant="caption" color="text.secondary" paragraph>
          Last updated: November 3, 2025
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            1. Acceptance of Terms
          </Typography>
          <Typography paragraph>
            By accessing and using Smart Stempling ("the Service"), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            2. Description of Service
          </Typography>
          <Typography paragraph>
            Smart Stempling is a time tracking and timesheet management application that allows users to:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Track work hours and activities</li>
            <li>Generate timesheets in various formats (Excel, PDF)</li>
            <li>Sync time logs with Google Sheets</li>
            <li>Send timesheets via email</li>
            <li>Manage project and client information</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            3. User Accounts and Authentication
          </Typography>
          <Typography paragraph>
            <strong>Google Account:</strong> You must authenticate using a Google account to use certain features of the Service, including Google Sheets integration.
          </Typography>
          <Typography paragraph>
            <strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.
          </Typography>
          <Typography paragraph>
            <strong>Account Termination:</strong> We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            4. Acceptable Use
          </Typography>
          <Typography paragraph>
            You agree to use the Service only for lawful purposes. You must not:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Use the Service to store or transmit malicious code</li>
            <li>Attempt to gain unauthorized access to the Service or other users' data</li>
            <li>Use the Service in a way that could damage, disable, or impair the Service</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Abuse or overload our systems with automated requests</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            5. User Data and Privacy
          </Typography>
          <Typography paragraph>
            <strong>Data Ownership:</strong> You retain all rights to your data. We do not claim ownership of any content you submit to the Service.
          </Typography>
          <Typography paragraph>
            <strong>Data Usage:</strong> We use your data only to provide and improve the Service as described in our Privacy Policy.
          </Typography>
          <Typography paragraph>
            <strong>Data Backup:</strong> While we take measures to protect your data, you are responsible for maintaining your own backups.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            6. Google Sheets Integration
          </Typography>
          <Typography paragraph>
            When using Google Sheets integration:
          </Typography>
          <Typography component="ul" paragraph>
            <li>You grant us permission to access and modify specified Google Sheets on your behalf</li>
            <li>You are responsible for ensuring the Google Sheets you connect belong to you or that you have permission to modify them</li>
            <li>You can revoke this permission at any time through the app or Google Account settings</li>
            <li>We are not responsible for data loss or corruption in your Google Sheets</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            7. Intellectual Property
          </Typography>
          <Typography paragraph>
            <strong>Service IP:</strong> The Service, including its design, code, and features, is owned by Smart Stempling and protected by intellectual property laws.
          </Typography>
          <Typography paragraph>
            <strong>Trademarks:</strong> Smart Stempling and related logos are trademarks. You may not use them without permission.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            8. Service Availability
          </Typography>
          <Typography paragraph>
            <strong>Uptime:</strong> We strive to maintain high availability but do not guarantee uninterrupted access to the Service.
          </Typography>
          <Typography paragraph>
            <strong>Maintenance:</strong> We may perform scheduled or emergency maintenance that temporarily limits access.
          </Typography>
          <Typography paragraph>
            <strong>Changes:</strong> We reserve the right to modify, suspend, or discontinue any part of the Service at any time.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            9. Limitation of Liability
          </Typography>
          <Typography paragraph>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW:
          </Typography>
          <Typography component="ul" paragraph>
            <li>The Service is provided "AS IS" without warranties of any kind</li>
            <li>We are not liable for any indirect, incidental, or consequential damages</li>
            <li>We are not responsible for data loss, even if caused by our negligence</li>
            <li>Our total liability shall not exceed the amount you paid for the Service (if applicable)</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            10. Indemnification
          </Typography>
          <Typography paragraph>
            You agree to indemnify and hold harmless Smart Stempling from any claims, damages, or expenses arising from:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Your use of the Service</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any third-party rights</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            11. Payment and Fees (If Applicable)
          </Typography>
          <Typography paragraph>
            If the Service transitions to a paid model:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Fees will be clearly communicated before charging</li>
            <li>You agree to pay all applicable fees</li>
            <li>Refunds will be handled on a case-by-case basis</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            12. Third-Party Services
          </Typography>
          <Typography paragraph>
            The Service integrates with third-party services (Google, SMTP providers). We are not responsible for:
          </Typography>
          <Typography component="ul" paragraph>
            <li>Third-party service availability or performance</li>
            <li>Changes to third-party APIs or policies</li>
            <li>Data handling by third-party services</li>
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            13. Termination
          </Typography>
          <Typography paragraph>
            <strong>By You:</strong> You may stop using the Service at any time by disconnecting your Google account.
          </Typography>
          <Typography paragraph>
            <strong>By Us:</strong> We may terminate or suspend your access if you violate these Terms or for any other reason with notice.
          </Typography>
          <Typography paragraph>
            <strong>Effect:</strong> Upon termination, your right to use the Service ceases immediately. We may delete your data after a reasonable period.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            14. Governing Law
          </Typography>
          <Typography paragraph>
            These Terms are governed by the laws of Norway. Any disputes shall be resolved in Norwegian courts.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            15. Changes to Terms
          </Typography>
          <Typography paragraph>
            We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            16. Contact Information
          </Typography>
          <Typography paragraph>
            For questions about these Terms, please contact us through the application or at the support channels provided.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            17. Severability
          </Typography>
          <Typography paragraph>
            If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full effect.
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            18. Entire Agreement
          </Typography>
          <Typography paragraph>
            These Terms, together with our Privacy Policy, constitute the entire agreement between you and Smart Stempling regarding the Service.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            By using Smart Stempling, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
