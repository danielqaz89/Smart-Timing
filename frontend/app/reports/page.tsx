"use client";
import { useMemo } from "react";
import { Container, Typography, Card, CardHeader, CardContent, Grid, Box, Button } from "@mui/material";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useUserSettings } from "../../lib/hooks";
import { fetchLogs, type LogRow } from "../../lib/api";
import useSWR from "swr";
import dayjs from "dayjs";
import Link from "next/link";
import { useTranslations } from "../../contexts/TranslationsContext";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function ReportsPage() {
  const { t } = useTranslations();
  const { settings } = useUserSettings();
  const monthNav = settings?.month_nav || dayjs().format("YYYYMM");
  
  const { data: logs = [] } = useSWR<LogRow[]>(
    ["logs", monthNav],
    () => fetchLogs(monthNav),
    { revalidateOnFocus: false }
  );

  // Hours by project
  const projectData = useMemo(() => {
    const byProject = logs.reduce((acc, log) => {
      const d = dayjs(log.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return acc;
      
      const project = log.project || t('common.unspecified', 'Uspesifisert');
      const start = dayjs(`${log.date} ${log.start_time}`);
      const end = dayjs(`${log.date} ${log.end_time}`);
      const hours = end.diff(start, "minute") / 60 - Number(log.break_hours || 0);
      
      acc[project] = (acc[project] || 0) + Math.max(0, hours);
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(byProject)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value);
  }, [logs]);

  // Hours by activity type
  const activityData = useMemo(() => {
    const byActivity = logs.reduce((acc, log) => {
      const d = dayjs(log.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return acc;
      
      const activity = log.activity === "Work" ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte');
      const start = dayjs(`${log.date} ${log.start_time}`);
      const end = dayjs(`${log.date} ${log.end_time}`);
      const hours = end.diff(start, "minute") / 60 - Number(log.break_hours || 0);
      
      acc[activity] = (acc[activity] || 0) + Math.max(0, hours);
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(byActivity).map(([name, value]) => ({ 
      name, 
      value: Math.round(value * 10) / 10 
    }));
  }, [logs]);

  // Daily hours
  const dailyData = useMemo(() => {
    const byDate = logs.reduce((acc, log) => {
      const d = dayjs(log.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return acc;
      
      const date = log.date;
      const start = dayjs(`${log.date} ${log.start_time}`);
      const end = dayjs(`${log.date} ${log.end_time}`);
      const hours = end.diff(start, "minute") / 60 - Number(log.break_hours || 0);
      
      acc[date] = (acc[date] || 0) + Math.max(0, hours);
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(byDate)
      .map(([date, hours]) => ({ 
        date: dayjs(date).format("DD/MM"), 
        timer: Math.round(hours * 10) / 10 
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  const totalHours = useMemo(() => {
    return logs.reduce((sum, log) => {
      const d = dayjs(log.date);
      const dow = d.day();
      if (dow === 0 || dow === 6) return sum;
      
      const start = dayjs(`${log.date} ${log.start_time}`);
      const end = dayjs(`${log.date} ${log.end_time}`);
      const hours = end.diff(start, "minute") / 60 - Number(log.break_hours || 0);
      return sum + Math.max(0, hours);
    }, 0);
  }, [logs]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4">{t('nav.reports', 'Rapporter')}</Typography>
        <Link href="/" passHref legacyBehavior>
          <Button variant="outlined">{t('common.back', 'Tilbake')}</Button>
        </Link>
      </Box>

      <Grid container spacing={3}>
        {/* Summary Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">{t('stats.total_hours', 'Total timer')}</Typography>
                  <Typography variant="h4">{totalHours.toFixed(1)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">{t('stats.work_days', 'Arbeidsdager')}</Typography>
                  <Typography variant="h4">{logs.filter(l => l.activity === "Work").length}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">{t('stats.meetings_total', 'Møter')}</Typography>
                  <Typography variant="h4">{logs.filter(l => l.activity === "Meeting").length}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">{t('stats.projects', 'Prosjekter')}</Typography>
                  <Typography variant="h4">{new Set(logs.map(l => l.project).filter(Boolean)).size}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Daily hours chart */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader title={t('reports.hours_per_day', 'Timer per dag')} />
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="timer" fill="#1976d2" name={t('stats.hours', 'Timer')} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Activity breakdown */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader title={t('reports.activity_breakdown', 'Aktivitetsfordeling')} />
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={activityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}${t('stats.hours_abbr', 't')}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {activityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Hours by project */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title={t('reports.hours_per_project', 'Timer per prosjekt')} />
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={projectData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#00C49F" name={t('stats.hours', 'Timer')} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
