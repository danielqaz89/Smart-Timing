"use client";
import { Box, Typography, Tooltip as MuiTooltip } from "@mui/material";
import { useMemo } from "react";
import dayjs from "dayjs";

interface CalendarHeatmapProps {
  logs: Array<{ date: string; start_time: string; end_time: string; break_hours: number }>;
  monthNav: string;
  paidBreak: boolean;
}

export default function CalendarHeatmap({ logs, monthNav, paidBreak }: CalendarHeatmapProps) {
  const heatmapData = useMemo(() => {
    const daysInMonth = dayjs(monthNav + "01").daysInMonth();
    const data: Array<{ date: string; hours: number; dayOfWeek: number; weekOfMonth: number }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = dayjs(monthNav + "01").date(d);
      const dateStr = date.format("YYYY-MM-DD");
      const dayLogs = logs.filter(l => l.date === dateStr);
      
      const hours = dayLogs.reduce((sum, log) => {
        const start = dayjs(`${log.date} ${log.start_time}`);
        const end = dayjs(`${log.date} ${log.end_time}`);
        let diff = end.diff(start, "hour", true);
        if (!paidBreak) diff -= Number(log.break_hours || 0);
        return sum + Math.max(0, diff);
      }, 0);

      const dayOfWeek = date.day();
      const weekOfMonth = Math.floor((d - 1 + dayjs(monthNav + "01").day()) / 7);

      data.push({
        date: dateStr,
        hours,
        dayOfWeek,
        weekOfMonth,
      });
    }

    return data;
  }, [logs, monthNav, paidBreak]);

  const maxHours = Math.max(...heatmapData.map(d => d.hours), 8);
  
  const getIntensity = (hours: number) => {
    if (hours === 0) return 0;
    if (hours < maxHours * 0.25) return 1;
    if (hours < maxHours * 0.5) return 2;
    if (hours < maxHours * 0.75) return 3;
    return 4;
  };

  const getColor = (intensity: number, theme: 'light' | 'dark' = 'light') => {
    const colors = {
      // Updated for WCAG AA compliance - better contrast
      light: ['#d8d8d8', '#95d48a', '#5fb96e', '#239a3b', '#196127'],
      dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    };
    return colors[theme][intensity];
  };

  const weeks = Math.ceil((heatmapData.length + dayjs(monthNav + "01").day()) / 7);

  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        Aktivitetsoversikt
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mr: 0.5 }}>
          {['S', 'M', 'T', 'O', 'T', 'F', 'L'].map((day, i) => (
            <Typography key={i} variant="caption" sx={{ height: 12, lineHeight: '12px', fontSize: 9, color: 'text.secondary' }}>
              {day}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {Array.from({ length: weeks }).map((_, week) => (
            <Box key={week} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {Array.from({ length: 7 }).map((_, day) => {
                const dataPoint = heatmapData.find(
                  d => d.weekOfMonth === week && d.dayOfWeek === day
                );
                const intensity = dataPoint ? getIntensity(dataPoint.hours) : 0;
                const displayDate = dataPoint ? dayjs(dataPoint.date).format('D. MMM') : '';

                return (
                  <MuiTooltip
                    key={day}
                    title={dataPoint ? `${displayDate}: ${dataPoint.hours.toFixed(1)}t` : ''}
                    arrow
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        bgcolor: dataPoint ? getColor(intensity) : 'transparent',
                        borderRadius: 0.5,
                        cursor: dataPoint ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                        border: '1px solid',
                        borderColor: dataPoint ? 'divider' : 'transparent',
                        '&:hover': dataPoint ? {
                          transform: 'scale(1.3)',
                          boxShadow: 1,
                        } : {},
                      }}
                    />
                  </MuiTooltip>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Typography variant="caption" color="text.secondary">Mindre</Typography>
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          {[0, 1, 2, 3, 4].map((intensity) => (
            <Box
              key={intensity}
              sx={{
                width: 10,
                height: 10,
                bgcolor: getColor(intensity),
                borderRadius: 0.5,
              }}
            />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">Mer</Typography>
      </Box>
    </Box>
  );
}
