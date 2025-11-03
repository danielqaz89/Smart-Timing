"use client";
import { useState, useEffect } from "react";
import { Alert, AlertTitle, Button, Stack, LinearProgress, Box } from "@mui/material";
import { updateSettings, createProjectInfo, type UserSettings, type ProjectInfo } from "../lib/api";

export default function MigrationBanner({ onComplete }: { onComplete: () => void }) {
  const [show, setShow] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if there's localStorage data to migrate
    const hasLocalData = 
      localStorage.getItem("paid_break") ||
      localStorage.getItem("tax_pct") ||
      localStorage.getItem("timesheet_sender") ||
      localStorage.getItem("webhook_url") ||
      localStorage.getItem("project_info");
    
    setShow(!!hasLocalData);
  }, []);

  async function migrate() {
    setMigrating(true);
    setError(null);
    setProgress(0);

    try {
      // Migrate user settings
      const settingsData: Partial<UserSettings> = {};
      
      const paidBreak = localStorage.getItem("paid_break");
      if (paidBreak) settingsData.paid_break = JSON.parse(paidBreak);
      
      const taxPct = localStorage.getItem("tax_pct");
      if (taxPct) settingsData.tax_pct = JSON.parse(taxPct);
      
      const rate = localStorage.getItem("hourly_rate");
      if (rate) settingsData.hourly_rate = JSON.parse(rate);
      
      settingsData.timesheet_sender = localStorage.getItem("timesheet_sender") || undefined;
      settingsData.timesheet_recipient = localStorage.getItem("timesheet_recipient") || undefined;
      
      const format = localStorage.getItem("timesheet_format");
      if (format) settingsData.timesheet_format = JSON.parse(format);
      
      settingsData.smtp_app_password = localStorage.getItem("timesheet_smtp_pass") || undefined;
      
      const webhookActive = localStorage.getItem("webhook_active");
      if (webhookActive) settingsData.webhook_active = JSON.parse(webhookActive);
      
      settingsData.webhook_url = localStorage.getItem("webhook_url") || undefined;
      settingsData.sheet_url = localStorage.getItem("sheet_url") || undefined;
      
      const monthNav = localStorage.getItem("month_nav");
      if (monthNav) settingsData.month_nav = JSON.parse(monthNav);

      setProgress(30);

      // Save settings to database
      if (Object.keys(settingsData).length > 0) {
        await updateSettings(settingsData);
      }

      setProgress(60);

      // Migrate project info
      const projectInfoStr = localStorage.getItem("project_info");
      if (projectInfoStr) {
        const projectInfo = JSON.parse(projectInfoStr);
        await createProjectInfo({
          konsulent: projectInfo.konsulent || "",
          bedrift: projectInfo.bedrift || "",
          oppdragsgiver: projectInfo.oppdragsgiver || "",
          tiltak: projectInfo.tiltak || "",
          periode: projectInfo.periode || "",
          klient_id: projectInfo.klientId || projectInfo.klient_id || "",
        });
      }

      setProgress(90);

      // Clear localStorage after successful migration
      const keysToRemove = [
        "paid_break", "tax_pct", "hourly_rate",
        "timesheet_sender", "timesheet_recipient", "timesheet_format", "timesheet_smtp_pass",
        "webhook_active", "webhook_url", "sheet_url", "month_nav", "project_info"
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));

      setProgress(100);
      setTimeout(() => {
        setShow(false);
        onComplete();
      }, 500);

    } catch (e: any) {
      setError(e?.message || String(e));
      setMigrating(false);
    }
  }

  function dismiss() {
    setShow(false);
  }

  if (!show) return null;

  return (
    <Alert 
      severity="info" 
      sx={{ mb: 2 }}
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" onClick={dismiss} disabled={migrating}>
            Senere
          </Button>
          <Button 
            color="inherit" 
            size="small" 
            variant="outlined" 
            onClick={migrate}
            disabled={migrating}
          >
            Migrer nå
          </Button>
        </Stack>
      }
    >
      <AlertTitle>Flytt innstillinger til databasen</AlertTitle>
      Vi har funnet lokale innstillinger. Migrer dem til databasen for multi-enhet synkronisering og backup.
      {migrating && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}
      {error && (
        <Box sx={{ mt: 1, color: "error.main", fontSize: "0.875rem" }}>
          Feil: {error}
        </Box>
      )}
    </Alert>
  );
}
