import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LogRow } from './api';
import dayjs from 'dayjs';

export function exportToPDF(
  logs: LogRow[],
  month: string,
  projectInfo: any,
  settings: any
) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text('Timeliste', 14, 20);
  
  // Month
  const monthFormatted = dayjs(month + '01').format('MMMM YYYY');
  doc.setFontSize(12);
  doc.text(`Periode: ${monthFormatted}`, 14, 30);
  
  // Project info
  let yPos = 40;
  if (projectInfo) {
    doc.setFontSize(10);
    if (projectInfo.konsulent) doc.text(`Konsulent: ${projectInfo.konsulent}`, 14, yPos);
    yPos += 6;
    if (projectInfo.bedrift) doc.text(`Bedrift: ${projectInfo.bedrift}`, 14, yPos);
    yPos += 6;
    if (projectInfo.oppdragsgiver) doc.text(`Oppdragsgiver: ${projectInfo.oppdragsgiver}`, 14, yPos);
    yPos += 10;
  }
  
  // Table data
  const tableData = logs.map(log => [
    log.date,
    log.start_time?.slice(0, 5) || '',
    log.end_time?.slice(0, 5) || '',
    log.break_hours?.toString() || '0',
    log.activity === 'Work' ? 'Arbeid' : 'Møte',
    log.title || '',
    log.project || '',
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Dato', 'Inn', 'Ut', 'Pause', 'Aktivitet', 'Tittel', 'Prosjekt']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [25, 118, 210] },
    styles: { fontSize: 8 },
  });
  
  // Summary
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  
  const paidBreak = settings?.paid_break || false;
  const rate = settings?.hourly_rate || 0;
  
  // Calculate totals
  let totalHours = 0;
  let totalExpenses = 0;
  
  logs.forEach(log => {
    const d = dayjs(log.date);
    const dow = d.day();
    if (dow === 0 || dow === 6) return; // Mon–Fri only
    
    const start = dayjs(`${log.date} ${log.start_time}`);
    const end = dayjs(`${log.date} ${log.end_time}`);
    const breakUsed = paidBreak ? 0 : Number(log.break_hours || 0);
    const diff = end.diff(start, 'minute') / 60 - breakUsed;
    totalHours += Math.max(0, diff);
    totalExpenses += Number(log.expense_coverage || 0);
  });
  
  doc.text(`Totale timer (man–fre): ${totalHours.toFixed(2)}`, 14, finalY);
  doc.text(`Timesats: ${rate.toLocaleString('no-NO', { minimumFractionDigits: 2 })} kr/t`, 14, finalY + 6);
  doc.text(`Estimert lønn: ${(rate * totalHours).toLocaleString('no-NO', { maximumFractionDigits: 0 })} kr`, 14, finalY + 12);
  doc.text(`Utgiftsdekning: ${totalExpenses.toLocaleString('no-NO', { maximumFractionDigits: 0 })} kr`, 14, finalY + 18);
  doc.text(`Total utbetaling: ${(rate * totalHours + totalExpenses).toLocaleString('no-NO', { maximumFractionDigits: 0 })} kr`, 14, finalY + 24);
  
  // Save
  doc.save(`timeliste-${month}.pdf`);
}
