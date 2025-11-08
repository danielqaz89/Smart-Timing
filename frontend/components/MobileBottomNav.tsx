"use client";
import { useState } from "react";
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import WorkIcon from "@mui/icons-material/Work";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useTranslations } from "../contexts/TranslationsContext";

type MobileBottomNavProps = {
  onNavigate: (section: "home" | "logs" | "stats" | "settings") => void;
  onQuickAction: (action: "stamp-work" | "stamp-meeting" | "manual-entry" | "import") => void;
  currentSection?: string;
};

export default function MobileBottomNav({
  onNavigate,
  onQuickAction,
  currentSection = "home",
}: MobileBottomNavProps) {
  const { t } = useTranslations();
  const [value, setValue] = useState(currentSection);

  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
    onNavigate(newValue as any);
  };

  const actions = [
    { icon: <WorkIcon />, name: t('mobile.quick.stamp_work', 'Stemple arbeid'), action: "stamp-work" as const },
    { icon: <MeetingRoomIcon />, name: t('mobile.quick.stamp_meeting', 'Stemple møte'), action: "stamp-meeting" as const },
    { icon: <AddIcon />, name: t('mobile.quick.manual_entry', 'Manuell registrering'), action: "manual-entry" as const },
    { icon: <UploadFileIcon />, name: t('mobile.quick.import_csv', 'Importer CSV'), action: "import" as const },
  ];

  return (
    <>
      {/* Bottom Navigation Bar */}
      <Paper
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          display: { xs: "block", md: "none" },
        }}
        elevation={3}
      >
        <BottomNavigation value={value} onChange={handleChange}>
          <BottomNavigationAction
            label={t('nav.home', 'Hjem')}
            value="home"
            icon={<HomeIcon />}
            aria-label={t('aria.go_home', 'Gå til hjemside')}
          />
          <BottomNavigationAction
            label={t('nav.logs', 'Logger')}
            value="logs"
            icon={<AccessTimeIcon />}
            aria-label={t('aria.view_logs', 'Se alle logger')}
          />
          <BottomNavigationAction
            label={t('nav.stats', 'Statistikk')}
            value="stats"
            icon={<BarChartIcon />}
            aria-label={t('aria.view_stats', 'Se statistikk')}
          />
          <BottomNavigationAction
            label={t('nav.settings', 'Innstillinger')}
            value="settings"
            icon={<SettingsIcon />}
            aria-label={t('aria.open_settings', 'Åpne innstillinger')}
          />
        </BottomNavigation>
      </Paper>

      {/* Speed Dial for Quick Actions */}
      <SpeedDial
        ariaLabel={t('aria.quick_actions', 'Hurtighandlinger')}
        sx={{
          position: "fixed",
          bottom: 80,
          right: 16,
          display: { xs: "flex", md: "none" },
        }}
        icon={<SpeedDialIcon />}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.action}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={() => onQuickAction(action.action)}
            aria-label={action.name}
          />
        ))}
      </SpeedDial>
    </>
  );
}
