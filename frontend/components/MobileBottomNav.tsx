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
  const [value, setValue] = useState(currentSection);

  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
    onNavigate(newValue as any);
  };

  const actions = [
    { icon: <WorkIcon />, name: "Stemple arbeid", action: "stamp-work" as const },
    { icon: <MeetingRoomIcon />, name: "Stemple møte", action: "stamp-meeting" as const },
    { icon: <AddIcon />, name: "Manuell registrering", action: "manual-entry" as const },
    { icon: <UploadFileIcon />, name: "Importer CSV", action: "import" as const },
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
            label="Hjem"
            value="home"
            icon={<HomeIcon />}
            aria-label="Gå til hjemside"
          />
          <BottomNavigationAction
            label="Logger"
            value="logs"
            icon={<AccessTimeIcon />}
            aria-label="Se alle logger"
          />
          <BottomNavigationAction
            label="Statistikk"
            value="stats"
            icon={<BarChartIcon />}
            aria-label="Se statistikk"
          />
          <BottomNavigationAction
            label="Innstillinger"
            value="settings"
            icon={<SettingsIcon />}
            aria-label="Åpne innstillinger"
          />
        </BottomNavigation>
      </Paper>

      {/* Speed Dial for Quick Actions */}
      <SpeedDial
        ariaLabel="Hurtighandlinger"
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
