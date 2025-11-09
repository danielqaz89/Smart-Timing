export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export type LogRow = {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  break_hours: number;
  activity: "Work" | "Meeting" | null;
  title: string | null;
  project: string | null;
  place: string | null;
  notes: string | null;
  expense_coverage: number;
  is_archived?: boolean;
  archived_at?: string | null;
  created_at: string;
};

export async function fetchLogs(month?: string, archived?: boolean): Promise<LogRow[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (archived) params.set('archived', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/logs${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load logs");
  return res.json();
}

export async function archiveLog(id: string) {
  const res = await fetch(`${API_BASE}/api/logs/${id}/archive`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to archive log');
  return res.json();
}

export async function unarchiveLog(id: string) {
  const res = await fetch(`${API_BASE}/api/logs/${id}/unarchive`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to unarchive log');
  return res.json();
}

export async function archiveMonth(yyyymm: string) {
  const res = await fetch(`${API_BASE}/api/logs/archive-month`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: yyyymm }),
  });
  if (!res.ok) throw new Error('Failed to archive month');
  return res.json();
}

export async function createLog(payload: {
  date: string;
  start: string; // HH:MM
  end: string; // HH:MM
  breakHours: number;
  activity: "Work" | "Meeting";
  title?: string;
  project?: string;
  place?: string;
  notes?: string;
  expenseCoverage?: number;
}) {
  const res = await fetch(`${API_BASE}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create log");
  return res.json();
}

export async function deleteLog(id: string) {
  const res = await fetch(`${API_BASE}/api/logs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete log");
  return res.json();
}

export async function updateLog(id: string, payload: Partial<{
  date: string;
  start: string;
  end: string;
  breakHours: number;
  activity: "Work" | "Meeting" | null;
  title: string | null;
  project: string | null;
  place: string | null;
  notes: string | null;
  expenseCoverage: number | null;
}>) {
  const res = await fetch(`${API_BASE}/api/logs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update log");
  return res.json();
}

export async function createLogsBulk(rows: Array<{
  date: string;
  start: string;
  end: string;
  breakHours?: number;
  activity?: "Work" | "Meeting";
  title?: string;
  project?: string;
  place?: string;
  notes?: string;
}>) {
  const res = await fetch(`${API_BASE}/api/logs/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error("Failed to import logs");
  return res.json();
}

export async function webhookTestRelay(webhookUrl: string, sample?: any) {
  const res = await fetch(`${API_BASE}/api/webhook/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl, sample }),
  });
  if (!res.ok) throw new Error("Webhook test failed");
  return res.json();
}

export async function deleteLogsMonth(yyyymm: string) {
  const res = await fetch(`${API_BASE}/api/logs?month=${yyyymm}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete month");
  return res.json();
}

export async function deleteLogsAll() {
  const res = await fetch(`${API_BASE}/api/logs?all=1`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete all");
  return res.json();
}

export async function sendTimesheet(opts: { month: string; senderEmail: string; recipientEmail: string; format: 'xlsx' | 'pdf' }) {
  const res = await fetch(`${API_BASE}/api/timesheet/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error('Failed to send timesheet');
  return res.json();
}

export async function sendTimesheetViaGmail(opts: { month: string; recipientEmail: string; format: 'xlsx' | 'pdf'; user_id?: string }) {
  const res = await fetch(`${API_BASE}/api/timesheet/send-gmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to send timesheet via Gmail' }));
    throw new Error(errorData.error || 'Failed to send timesheet via Gmail');
  }
  return res.json();
}

export async function getGoogleAuthStatus(userId = 'default') {
  const res = await fetch(`${API_BASE}/api/auth/google/status?user_id=${userId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to check Google auth status');
  return res.json();
}

export async function initiateGoogleAuth(scopes: 'base' | 'gmail' = 'base', userId = 'default') {
  const res = await fetch(`${API_BASE}/api/auth/google?user_id=${userId}&scopes=${scopes}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to initiate Google auth');
  const data = await res.json();
  return data.authUrl;
}

export async function generateMonthlyReport(opts: { 
  month: string; 
  userId?: string; 
  template?: 'auto' | 'standard' | 'miljøarbeider';
  customIntro?: string;
  customNotes?: string;
}) {
  const { month, userId = 'default', template = 'auto', customIntro, customNotes } = opts;
  const res = await fetch(`${API_BASE}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, user_id: userId, template, customIntro, customNotes }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to generate report' }));
    throw new Error(errorData.error || errorData.message || 'Failed to generate report');
  }
  return res.json();
}

// ===== USER SETTINGS =====
// Updated: 2025-01-09T01:00:00Z
export type UserSettings = {
  id?: number;
  user_id?: string;
  paid_break: boolean;
  tax_pct: number;
  hourly_rate: number;
  timesheet_sender: string | null;
  timesheet_recipient: string | null;
  timesheet_format: 'xlsx' | 'pdf';
  smtp_app_password: string | null;
  webhook_active: boolean;
  webhook_url: string | null;
  sheet_url: string | null;
  month_nav: string | null;
  show_archived?: boolean | null;
  language?: 'no' | 'en';
  theme_mode?: 'light' | 'dark';
  invoice_reminder_active?: boolean;
  reminder_day?: number;
  reminder_hour?: number;
  reminder_timezone?: string;
  reminder_recipients?: string;
  reminder_attach_pdf?: boolean;
  reminder_subject?: string;
  reminder_message?: string;
  created_at?: string;
  updated_at?: string;
};

export async function fetchSettings(userId = 'default'): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/settings?user_id=${userId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function updateSettings(data: Partial<UserSettings>, userId = 'default') {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId }),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

// ===== PROJECT INFO =====
export type ProjectInfo = {
  id?: number;
  user_id?: string;
  konsulent: string;
  bedrift: string;
  oppdragsgiver: string;
  tiltak: string;
  periode: string;
  klient_id: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

// BRREG utilities moved to lib/brreg.ts
// Re-export for backwards compatibility
export type { BrregCompany } from './brreg';
export { searchBrregCompany, getBrregCompanyByOrgnr, KINOA_TILTAK_AS } from './brreg';

// ===== CMS PAGES/THEME =====
export async function fetchCmsPage(pageId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/cms/pages/${encodeURIComponent(pageId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load CMS page');
  return res.json();
}

export async function submitContactForm(opts: { page_id?: string; form_id?: string; values: Record<string, any> }) {
  const res = await fetch(`${API_BASE}/api/cms/contact/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to submit form' }));
    throw new Error(err.error || 'Failed to submit form');
  }
  return res.json();
}

export async function fetchProjectInfo(userId = 'default'): Promise<ProjectInfo | null> {
  const res = await fetch(`${API_BASE}/api/project-info?user_id=${userId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load project info');
  return res.json();
}

export async function createProjectInfo(data: Omit<ProjectInfo, 'id' | 'is_active' | 'created_at' | 'updated_at'>, userId = 'default') {
  const res = await fetch(`${API_BASE}/api/project-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId }),
  });
  if (!res.ok) throw new Error('Failed to create project info');
  return res.json();
}

export async function updateProjectInfo(id: number, data: Partial<ProjectInfo>) {
  const res = await fetch(`${API_BASE}/api/project-info/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update project info');
  return res.json();
}

// ===== QUICK TEMPLATES =====
export type QuickTemplate = {
  id: number;
  user_id: string;
  label: string;
  activity: 'Work' | 'Meeting';
  title: string | null;
  project: string | null;
  place: string | null;
  is_favorite: boolean;
  display_order: number;
  created_at: string;
};

export async function fetchQuickTemplates(userId = 'default'): Promise<QuickTemplate[]> {
  const res = await fetch(`${API_BASE}/api/quick-templates?user_id=${userId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load templates');
  return res.json();
}

export async function createQuickTemplate(data: Omit<QuickTemplate, 'id' | 'created_at' | 'user_id'>, userId = 'default') {
  const res = await fetch(`${API_BASE}/api/quick-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId }),
  });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}

export async function deleteQuickTemplate(id: number) {
  const res = await fetch(`${API_BASE}/api/quick-templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete template');
  return res.json();
}
