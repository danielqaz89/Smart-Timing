"use client";
import { useState, useEffect } from "react";
import {
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Box,
  Typography,
  Chip,
  Stack,
  Button,
  Zoom,
  useTheme,
  useMediaQuery,
  Tooltip,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import TimerIcon from "@mui/icons-material/Timer";
import WorkIcon from "@mui/icons-material/Work";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import dayjs from "dayjs";
import { useTranslations } from "../contexts/TranslationsContext";

interface QuickTemplate {
  id: number;
  label: string;
  activity: "Work" | "Meeting";
  title?: string;
  project?: string;
  place?: string;
}

interface ActiveStamp {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  title?: string;
  project?: string;
  place?: string;
}

interface QuickStampFABProps {
  templates: QuickTemplate[];
  activeStamp: ActiveStamp | undefined;
  onStampIn: (template: QuickTemplate) => Promise<void>;
  onStampOut: () => Promise<void>;
}

export default function QuickStampFAB({ 
  templates, 
  activeStamp, 
  onStampIn, 
  onStampOut 
}: QuickStampFABProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Timer for active stamp
  useEffect(() => {
    if (!activeStamp) {
      setElapsedTime("00:00:00");
      return;
    }
    const interval = setInterval(() => {
      const start = dayjs(`${activeStamp.date} ${activeStamp.start_time}`);
      const now = dayjs();
      const diff = now.diff(start, "second");
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setElapsedTime(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStamp]);

  const handleStampIn = async (template: QuickTemplate) => {
    await onStampIn(template);
    setOpen(false);
  };

  const handleStampOut = async () => {
    await onStampOut();
    setOpen(false);
  };

  // Don't show on desktop
  if (!isMobile) return null;

  return (
    <>
      {/* Floating Action Button */}
      <Zoom in={true}>
        <Tooltip title={activeStamp ? t('tooltips.stamp_out', 'Stemple ut') : t('tooltips.stamp_in', 'Stemple inn')} arrow>
          <Fab
            color={activeStamp ? "success" : "primary"}
            aria-label={activeStamp ? t('aria.stamp_out', 'Stemple ut') : t('aria.stamp_in', 'Stemple inn')}
            onClick={() => setOpen(true)}
            sx={{
              position: "fixed",
              bottom: 80, // Above mobile nav
              right: 16,
              zIndex: 1200,
              animation: activeStamp ? "pulse 2s infinite" : "none",
              "@keyframes pulse": {
                "0%, 100%": { boxShadow: "0 0 0 0 rgba(76, 175, 80, 0.7)" },
                "50%": { boxShadow: "0 0 0 10px rgba(76, 175, 80, 0)" },
              },
            }}
          >
            {activeStamp ? <TimerIcon /> : <PlayArrowIcon />}
          </Fab>
        </Tooltip>
      </Zoom>

      {/* Dialog for Stamp In (Choose Template) */}
      <Dialog
        open={open && !activeStamp}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PlayArrowIcon color="primary" />
            <Typography variant="h6">{t('home.stamp_in', 'Stemple INN')}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('home.choose_template', 'Velg mal eller aktivitet:')}
          </Typography>
          <List>
            {/* Quick Activity Buttons */}
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() =>
                  handleStampIn({
                    id: 0,
                    label: t('stats.work', 'Arbeid'),
                    activity: "Work",
                  })
                }
                sx={{ borderRadius: 1, border: "1px solid", borderColor: "divider" }}
              >
                <WorkIcon sx={{ mr: 1 }} />
                <ListItemText primary={`${t('stats.work', 'Arbeid')} (standard)`} />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding sx={{ mb: 2 }}>
              <ListItemButton
                onClick={() =>
                  handleStampIn({
                    id: 0,
                    label: t('stats.meetings', 'Møte'),
                    activity: "Meeting",
                  })
                }
                sx={{ borderRadius: 1, border: "1px solid", borderColor: "divider" }}
              >
                <MeetingRoomIcon sx={{ mr: 1 }} />
                <ListItemText primary={`${t('stats.meetings', 'Møte')} (standard)`} />
              </ListItemButton>
            </ListItem>

            {/* Templates */}
            {templates.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, mb: 1 }}>
                  {t('quick_templates.templates_header', 'MALER:')}
                </Typography>
                {templates.map((template) => (
                  <ListItem key={template.id} disablePadding sx={{ mb: 1 }}>
                    <ListItemButton
                      onClick={() => handleStampIn(template)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={template.label}
                        secondary={
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                            <Chip
                              label={template.activity === "Work" ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}
                              size="small"
                              color={template.activity === "Work" ? "primary" : "secondary"}
                            />
                            {template.title && (
                              <Chip label={template.title} size="small" variant="outlined" />
                            )}
                          </Stack>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </>
            )}
          </List>
        </DialogContent>
      </Dialog>

      {/* Dialog for Stamp Out (Confirm) */}
      <Dialog
        open={open && !!activeStamp}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <StopIcon color="error" />
            <Typography variant="h6">{t('home.stamp_out', 'Stemple UT')}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: "center", py: 2 }}>
            <Typography variant="h3" color="success.main" sx={{ mb: 1, fontWeight: "bold" }}>
              {elapsedTime}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('aria.time_since_stamp_in', 'Tid siden du stemplet inn')}
            </Typography>

            {activeStamp && (
              <Box sx={{ mb: 3, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {activeStamp.activity === "Work" ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}
                </Typography>
                {activeStamp.title && (
                  <Typography variant="body1" fontWeight="medium">
                    {activeStamp.title}
                  </Typography>
                )}
                {activeStamp.project && (
                  <Typography variant="caption" color="text.secondary">
                    {activeStamp.project}
                  </Typography>
                )}
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {t('fields.in', 'Inn')}: {activeStamp.start_time?.slice(0, 5)}
                </Typography>
              </Box>
            )}

            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={() => setOpen(false)} fullWidth>
                {t('common.cancel', 'Avbryt')}
              </Button>
              <Button variant="contained" color="error" onClick={handleStampOut} fullWidth aria-label={t('aria.stamp_out', 'Stemple ut')}>
                {t('home.stamp_out', 'Stemple UT')}
              </Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
