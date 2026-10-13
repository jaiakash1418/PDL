import type { Report, SourceRef } from '../lib/types';
import { fmtDateTime, periodLabel } from '../lib/util';
import { coverageBreakdown } from './reports';

export function reportAsMarkdown(report: Report): string {
  const cov = coverageBreakdown(report);
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`**Report type:** ${report.type}  `);
  lines.push(`**Reporting period:** ${periodLabel(report.reportingPeriod)}  `);
  lines.push(`**Organisational scope:** ${report.scope}  `);
  lines.push(`**Status:** ${report.status}  `);
  lines.push(`**Generated:** ${fmtDateTime(report.createdAt)}  `);
  lines.push(`**Source coverage:** ${cov.coverage === null ? 'Not applicable (no factual claims)' : cov.coverage + '%'}  `);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.executiveSummary);
  lines.push('');
  for (const section of report.sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');
    lines.push(section.body);
    lines.push('');
    for (const table of section.tables ?? []) {
      lines.push(`### ${table.title}`);
      lines.push('');
      lines.push(`| ${table.headers.join(' | ')} |`);
      lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) lines.push(`| ${row.join(' | ')} |`);
      lines.push('');
    }
  }
  lines.push('## Source References');
  lines.push('');
  const seen = new Set<string>();
  for (const claim of report.claims) {
    for (const ref of claim.sourceRefs) {
      const key = `${ref.docId}:${ref.pageNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- ${formatCitation(ref)}`);
    }
  }
  if (seen.size === 0) lines.push('- No cited sources (all sections reported as unverified).');
  lines.push('');
  lines.push('---');
  lines.push('_Synthetic demonstration report produced by the STRATAVEX prototype. Does not represent a real mine, subsidiary or operational record._');
  return lines.join('\n');
}

export function formatCitation(ref: SourceRef): string {
  return `${ref.docName} → ${ref.section ?? 'General'} → Page ${ref.pageNo}`;
}

export async function exportReportPdf(report: Report): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const cov = coverageBreakdown(report);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(report.title, margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const meta = `${report.type} · ${periodLabel(report.reportingPeriod)} · ${report.scope} · ${report.status} · Generated ${fmtDateTime(report.createdAt)}`;
  doc.text(meta, margin, y);
  y += 14;
  doc.text(
    `Source coverage: ${cov.coverage === null ? 'Not applicable (no factual claims)' : cov.coverage + '%'}  |  Claims with sources: ${cov.supported}/${cov.totalClaims}`,
    margin,
    y,
  );
  y += 8;
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(2);
  doc.line(margin, y, 595 - margin, y);
  y += 22;

  const para = (text: string, size = 10, color: [number, number, number] = [51, 65, 85]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const split = doc.splitTextToSize(text, 595 - margin * 2);
    for (const line of split) {
      if (y > 780) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += size + 3;
    }
  };
  const heading = (text: string) => {
    if (y > 740) { doc.addPage(); y = margin; }
    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y);
    y += 16;
  };

  heading('Executive Summary');
  para(report.executiveSummary);

  for (const section of report.sections) {
    heading(section.heading);
    para(section.body);
    for (const table of section.tables ?? []) {
      if (y > 700) { doc.addPage(); y = margin; }
      autoTable(doc, {
        startY: y + 6,
        head: [table.headers],
        body: table.rows,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [15, 26, 43], textColor: 255 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 16;
    }
  }

  heading('Source References');
  const seen = new Set<string>();
  for (const claim of report.claims) {
    for (const ref of claim.sourceRefs) {
      const key = `${ref.docId}:${ref.pageNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      para(`• ${formatCitation(ref)}`, 9);
    }
  }
  if (seen.size === 0) para('• No cited sources (all sections reported as unverified).', 9);

  para('Synthetic demonstration report produced by the STRATAVEX prototype. Does not represent a real mine, subsidiary or operational record.', 8, [100, 116, 139]);
  doc.save(`${safeName(report.title)}.pdf`);
}

export async function exportReportDocx(report: Report): Promise<void> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } = await import('docx');
  const { saveAs } = await import('file-saver');
  const cov = coverageBreakdown(report);

  const children: any[] = [];
  children.push(new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }));
  children.push(new Paragraph({ children: [new TextRun({ text: `${report.type} · ${periodLabel(report.reportingPeriod)} · ${report.scope} · ${report.status}`, italics: true, size: 20 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Generated ${fmtDateTime(report.createdAt)}`, size: 20, color: '64748b' })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Source coverage: ${cov.coverage === null ? 'Not applicable (no factual claims)' : cov.coverage + '%'} — Claims with sources ${cov.supported}/${cov.totalClaims}`, size: 20 })] }));

  children.push(new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ text: report.executiveSummary }));

  for (const section of report.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const line of section.body.split('\n')) children.push(new Paragraph({ text: line }));
    for (const table of section.tables ?? []) {
      children.push(new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_3 }));
      const rows = [
        new TableRow({ children: table.headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
        ...table.rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ text: c })] })) })),
      ];
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
  }

  children.push(new Paragraph({ text: 'Source References', heading: HeadingLevel.HEADING_1 }));
  const seen = new Set<string>();
  for (const claim of report.claims) {
    for (const ref of claim.sourceRefs) {
      const key = `${ref.docId}:${ref.pageNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      children.push(new Paragraph({ text: formatCitation(ref), bullet: { level: 0 } }));
    }
  }
  if (seen.size === 0) children.push(new Paragraph({ text: 'No cited sources (all sections reported as unverified).', bullet: { level: 0 } }));

  children.push(new Paragraph({ children: [new TextRun({ text: 'Synthetic demonstration report produced by the STRATAVEX prototype. Does not represent a real mine, subsidiary or operational record.', italics: true, size: 18, color: '64748b' })] }));

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeName(report.title)}.docx`);
}

export async function exportReportCsv(report: Report): Promise<void> {
  const { saveAs } = await import('file-saver');
  const rows: string[][] = [['Section', 'Finding', 'Source Document', 'Section', 'Page']];
  for (const claim of report.claims) {
    if (claim.sourceRefs.length === 0) rows.push([claim.kind, claim.text.replace(/\n/g, ' '), '', '', '']);
    for (const ref of claim.sourceRefs) rows.push([claim.kind, claim.text.replace(/\n/g, ' '), ref.docName, ref.section ?? 'General', String(ref.pageNo)]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeName(report.title)}-claims.csv`);
}

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
