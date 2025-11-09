"use client";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";
import dayjs from "dayjs";

interface HoursBarChartProps {
  logs: Array<{ date: string; start_time: string; end_time: string; break_hours: number }>;
  monthNav: string;
  paidBreak: boolean;
}

export default function HoursBarChart({ logs, monthNav, paidBreak }: HoursBarChartProps) {
  const chartData = useMemo(() => {
    const daysInMonth = dayjs(monthNav + "01").daysInMonth();
    const data: Array<{ day: number; hours: number; isWeekend: boolean }> = [];

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

      data.push({
        day: d,
        hours,
        isWeekend: date.day() === 0 || date.day() === 6,
      });
    }

    return data;
  }, [logs, monthNav, paidBreak]);

  const maxHours = Math.max(...chartData.map(d => d.hours), 8);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" gutterBottom>
        Timer per dag
      </Typography>
      <Box 
        sx={{ 
          display: 'flex', 
          gap: 0.25, 
          alignItems: 'flex-end', 
          height: 60,
          overflow: 'hidden'
        }}
      >
        {chartData.map((d) => (
          <Box
            key={d.day}
            sx={{
              flex: 1,
              minWidth: 2,
              height: `${(d.hours / maxHours) * 100}%`,
              bgcolor: d.isWeekend ? 'grey.400' : d.hours > 0 ? 'primary.dark' : 'grey.300',
              borderRadius: '2px 2px 0 0',
              transition: 'all 0.2s',
              '&:hover': {
                opacity: 0.7,
                transform: 'scaleY(1.05)',
              },
            }}
            title={`Dag ${d.day}: ${d.hours.toFixed(1)}t`}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">1</Typography>
        <Typography variant="caption" color="text.secondary">{chartData.length}</Typography>
      </Box>
    </Box>
  );
}
