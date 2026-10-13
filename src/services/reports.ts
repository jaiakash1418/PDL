import type {
  Conflict, Report, ReportClaim, ReportSection, ReportStatus, ReportTable, ReportType, SourceRef, User,
} from '../lib/types';
import { getAll, getOne, put, del } from '../lib/db';
import { sha256Hex } from '../lib/crypto';
import { now, uid, periodLabel, periodSortKey, stableStringify } from '../lib/util';
import { retrieveEvidence, toCitations, NO_EVIDENCE_MESSAGE, invalidateRetrievalIndex } from './retrieval';
import { getIssues } from './validation';
import { getConflicts } from './conflicts';
import { collectMetricRecords, groupKey } from './metrics';
import { listDocuments } from './documents';
import { appendAudit } from './audit';

export const REPORT_TYPES: ReportType[] = ['Production', 'Geology', 'Safety', 'Administrative'];

export interface ReportConfig {
  type: ReportType;
  reportingPeriod: string;
  scope: string;
  sourceDocIds: string[];
  sections: string[];
  includeHistoricalComparison: boolean;
  includeValidation: boolean;
  includeConflicts: boolean;
  title?: string;
}

export const SECTION_LIBRARY: Record<ReportType, { id: string; heading: string; query: string }[]> = {
  Production: [
    { id: 'overview', heading: 'Production Overview', query: 'monthly production output tonnes target achievement' },
    { id: 'dispatches', heading: 'Dispatch & Offtake', query: 'dispatch offtake despatch coal movement figures' },
    { id: 'performance', heading: 'Performance Against Target', query: 'production target achievement performance percentage' },
  ],
  Geology: [
    { id: 'reserves', heading: 'Reserves & Resources', query: 'reserve resource estimate geological' },
    { id: 'seam', heading: 'Seam Thickness & Quality', query: 'seam thickness grade ash moisture quality' },
    { id: 'inconsistencies', heading: 'Geological Inconsistencies', query: 'inconsistency anomaly seam thickness variation' },
  ],
  Safety: [
    { id: 'observations', heading: 'Safety Observations', query: 'safety observation incident hazard near miss' },
    { id: 'actions', heading: 'Corrective Actions', query: 'corrective action recommendation compliance safety' },
  ],
  Administrative: [
    { id: 'summary', heading: 'Administrative Summary', query: 'administrative summary employment statutory compliance' },
    { id: 'approvals', heading: 'Approvals & Notices', query: 'approval notice circular order administrative' },
  ],
};

export async function listReports(): Promise<Report[]> {
  const list = await getAll('reports');
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getReport(id: string): Promise<Report | undefined> {
  return getOne('reports', id);
}

export async function getReportsByStatus(status: ReportStatus): Promise<Report[]> {
  return (await listReports()).filter((r) => r.status === status);
}

export function computeCoverage(report: Pick<Report, 'claims'>): number | null {
  if (report.claims.length === 0) return null;
  const supported = report.claims.filter((c) => c.sourceRefs.length > 0).length;
  return Math.round((supported / report.claims.length) * 1000) / 10;
}

export interface CoverageBreakdown {
  totalClaims: number;
  supported: number;
  awaitingVerification: number;
  coverage: number | null;
}

export function coverageBreakdown(report: Pick<Report, 'claims'>): CoverageBreakdown {
  const totalClaims = report.claims.length;
  const supported = report.claims.filter((c) => c.sourceRefs.length > 0).length;
  return {
    totalClaims,
    supported,
    awaitingVerification: totalClaims - supported,
    coverage: totalClaims === 0 ? null : Math.round((supported / totalClaims) * 1000) / 10,
  };
}

async function buildClaim(text: string, refs: SourceRef[], kind: ReportClaim['kind']): Promise<ReportClaim> {
  return { id: uid('clm'), text, sourceRefs: refs, verified: refs.length > 0, kind };
}

export async function generateReport(config: ReportConfig, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<Report> {
  const docs = await listDocuments();
  const inScope = docs.filter((d) => config.sourceDocIds.includes(d.id));
  const filters = config.sourceDocIds.length ? { docIds: config.sourceDocIds } : undefined;

  const sections: ReportSection[] = [];
  const claims: ReportClaim[] = [];
  const usedDocIds = new Set<string>();

  const library = SECTION_LIBRARY[config.type];
  for (const def of library) {
    if (!config.sections.includes(def.id)) continue;
    const scopedQuery = `${def.query} ${periodLabel(config.reportingPeriod)}`;
    const evidence = await retrieveEvidence(scopedQuery, filters, 6);
    const sectionClaimIds: string[] = [];
    const bodyParts: string[] = [];

    if (evidence.length === 0) {
      const c = await buildClaim(NO_EVIDENCE_MESSAGE, [], 'missing');
      claims.push(c);
      sectionClaimIds.push(c.id);
      bodyParts.push(NO_EVIDENCE_MESSAGE);
      sections.push({ id: def.id, heading: def.heading, body: bodyParts.join('\n\n'), claimIds: sectionClaimIds, noContent: true });
      continue;
    }

    for (const e of evidence.slice(0, 4)) {
      const refs = toCitations([e]);
      usedDocIds.add(e.docId);
      const c = await buildClaim(e.snippet, refs, 'finding');
      claims.push(c);
      sectionClaimIds.push(c.id);
    }
    for (const e of evidence.slice(0, 4)) {
      bodyParts.push(`"${e.snippet}" — ${e.docName}${e.section ? ' → ' + e.section : ''} → Page ${e.pageNo}`);
    }
    sections.push({ id: def.id, heading: def.heading, body: bodyParts.join('\n\n'), claimIds: sectionClaimIds });
  }

  // Historical comparison table
  if (config.includeHistoricalComparison) {
    const built = await buildProductionTable(inScope.map((d) => d.id), config.scope);
    if (built) {
      const c = await buildClaim(
        `Historical comparison across ${built.table.rows.length} metric(s) and ${built.periods} reporting period(s); blank cells indicate missing data and are not treated as zero.`,
        built.refs,
        'comparison',
      );
      claims.push(c);
      sections.push({
        id: 'historical',
        heading: 'Historical Comparison',
        body: 'Values are shown by reporting period. Cells marked — indicate missing data, which is not treated as zero.',
        claimIds: [c.id],
        tables: [built.table],
      });
    }
  }

  // Validation section
  if (config.includeValidation) {
    const issues = await getIssues();
    const relevant = config.sourceDocIds.length ? issues.filter((i) => config.sourceDocIds.includes(i.docId)) : issues;
    const open = relevant.filter((i) => i.status === 'Open');
    const c = await buildClaim(
      open.length === 0
        ? 'No open data validation issues affect the selected source documents.'
        : `${open.length} open validation issue(s) affect the selected source documents and should be reviewed.`,
      [], 'validation',
    );
    claims.push(c);
    const rows = open.slice(0, 20).map((i) => [i.severity, i.ruleName, i.docName, i.currentValue, i.status]);
    const tables: ReportTable[] = open.length ? [{ title: 'Open Validation Issues', headers: ['Severity', 'Rule', 'Document', 'Value', 'Status'], rows }] : [];
    sections.push({ id: 'validation', heading: 'Data Validation Results', body: c.text, claimIds: [c.id], tables });
  }

  // Conflicts section
  const conflictIds: string[] = [];
  if (config.includeConflicts) {
    const conflicts = await getConflicts();
    const relevant = conflicts.filter(
      (x) => x.status === 'Unresolved' && (config.sourceDocIds.length === 0 || x.values.some((v) => config.sourceDocIds.includes(v.docId))),
    );
    conflictIds.push(...relevant.map((x) => x.id));
    const c = await buildClaim(
      relevant.length === 0
        ? 'No unresolved conflicts were identified for the selected scope.'
        : `${relevant.length} unresolved conflict(s) were identified. Both recorded values are preserved and no value has been silently preferred.`,
      relevant.flatMap((x) => x.values.map((v) => ({ docId: v.docId, docName: v.docName, pageNo: v.pageNo, section: v.section, snippet: v.snippet }))),
      'comparison',
    );
    claims.push(c);
    const rows = relevant.map((x) => [x.metric, periodLabel(x.reportingPeriod), x.values.map((v) => `${v.value} (${v.docName})`).join('  vs  ')]);
    const tables: ReportTable[] = relevant.length ? [{ title: 'Unresolved Conflicts', headers: ['Metric', 'Period', 'Conflicting Values'], rows }] : [];
    sections.push({ id: 'conflicts', heading: 'Unresolved Conflicts', body: c.text, claimIds: [c.id], tables });
  }

  const summary = await buildExecutiveSummary(config, claims, docs);

  const report: Report = {
    id: uid('rpt'),
    title: config.title?.trim() || `${config.type} Report — ${periodLabel(config.reportingPeriod)}`,
    type: config.type,
    reportingPeriod: config.reportingPeriod,
    scope: config.scope,
    status: 'Draft',
    createdAt: now(),
    createdBy: actor.id,
    createdByName: actor.name,
    updatedAt: now(),
    executiveSummary: summary,
    sections,
    claims,
    conflictIds,
    validationIssueIds: [],
    sourceDocIds: [...usedDocIds],
    versions: [],
  };
  report.versions.push(await makeVersion(report, actor, 'Initial draft generated', 'Draft'));
  await put('reports', report);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'report.generate', resourceType: 'report', resourceId: report.id, resourceName: report.title,
    meta: { type: report.type, period: report.reportingPeriod, claims: claims.length, coverage: computeCoverage(report) },
  });
  return report;
}

async function buildProductionTable(
  docIds: string[],
  scope: string,
): Promise<{ table: ReportTable; refs: SourceRef[]; periods: number } | null> {
  const docs = await listDocuments();
  const scoped = docs.filter((d) => (docIds.length ? docIds.includes(d.id) : true));
  const records = (await collectMetricRecords(scoped)).filter((r) => !scope || r.subsidiary === scope);
  if (records.length === 0) return null;
  const groups = new Map<string, Map<string, number>>();
  const periods = new Set<string>();
  for (const r of records) {
    const g = groups.get(r.label) ?? new Map();
    g.set(r.period, r.value);
    groups.set(r.label, g);
    periods.add(r.period);
  }
  const ordered = [...periods].sort((a, b) => periodSortKey(a) - periodSortKey(b));
  const headers = ['Metric', 'Unit', ...ordered.map(periodLabel)];
  const rows: string[][] = [];
  for (const [label, byPeriod] of groups) {
    const unit = records.find((r) => r.label === label)?.unit ?? '';
    rows.push([label, unit, ...ordered.map((p) => (byPeriod.has(p) ? String(byPeriod.get(p)) : '—'))]);
  }
  const refs: SourceRef[] = records.map((r) => ({ docId: r.docId, docName: r.docName, pageNo: r.pageNo, section: r.section, snippet: `${r.label}: ${r.raw}` }));
  return {
    table: { title: 'Historical Metric Comparison', headers, rows: rows.slice(0, 30), sourceDocIds: scoped.map((d) => d.id) },
    refs,
    periods: ordered.length,
  };
}

async function buildExecutiveSummary(config: ReportConfig, claims: ReportClaim[], docs: { id: string }[]): Promise<string> {
  const supported = claims.filter((c) => c.sourceRefs.length > 0).length;
  const missing = claims.filter((c) => c.kind === 'missing').length;
  const scoped = docs.filter((d) => config.sourceDocIds.length === 0 || config.sourceDocIds.includes(d.id)).length;
  const parts = [
    `This ${config.type.toLowerCase()} report covers the reporting period ${periodLabel(config.reportingPeriod)} for ${config.scope}, drawing on ${scoped} source document(s).`,
    supported > 0
      ? `${supported} finding(s) are supported by cited source content.`
      : 'No findings could be supported by the available documents.',
    missing > 0
      ? `${missing} section(s) returned no verified record and are reported as missing rather than estimated.`
      : 'Every requested section returned at least one cited source.',
    'All figures are drawn only from the records cited in this report; no values have been inferred or estimated.',
  ];
  return parts.join(' ');
}

async function makeVersion(report: Report, actor: Pick<User, 'name'>, note: string, status: ReportStatus): Promise<Report['versions'][number]> {
  const contentHash = await sha256Hex(stableStringify({ title: report.title, summary: report.executiveSummary, sections: report.sections, claims: report.claims }));
  const snapshot = stableStringify({ title: report.title, summary: report.executiveSummary, sections: report.sections, claims: report.claims });
  return { version: report.versions.length + 1, at: now(), by: actor.name, byName: actor.name, status, note, contentHash, snapshot };
}

export async function saveReportDraft(report: Report, actor: Pick<User, 'id' | 'name' | 'role'>, note = 'Draft saved'): Promise<Report> {
  report.updatedAt = now();
  report.versions.push(await makeVersion(report, actor, note, report.status));
  await put('reports', report);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'report.save', resourceType: 'report', resourceId: report.id, resourceName: report.title,
    meta: { status: report.status, version: report.versions.length },
  });
  return report;
}

export async function updateReportContent(
  id: string,
  patch: { title?: string; executiveSummary?: string; sections?: ReportSection[] },
  actor: Pick<User, 'id' | 'name' | 'role'>,
): Promise<Report> {
  const report = await getOne('reports', id);
  if (!report) throw new Error('Report not found.');
  if (patch.title !== undefined) report.title = patch.title;
  if (patch.executiveSummary !== undefined) report.executiveSummary = patch.executiveSummary;
  if (patch.sections !== undefined) report.sections = patch.sections;
  return saveReportDraft(report, actor, 'Content edited');
}

export async function submitForReview(id: string, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<Report> {
  const report = await getOne('reports', id);
  if (!report) throw new Error('Report not found.');
  report.status = 'Pending Review';
  report.updatedAt = now();
  report.versions.push(await makeVersion(report, actor, 'Submitted for review', 'Pending Review'));
  await put('reports', report);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'report.submit', resourceType: 'report', resourceId: id, resourceName: report.title,
  });
  return report;
}

export async function decideReport(
  id: string,
  decision: 'Approved' | 'Rejected',
  note: string,
  actor: Pick<User, 'id' | 'name' | 'role'>,
): Promise<Report> {
  const report = await getOne('reports', id);
  if (!report) throw new Error('Report not found.');
  report.status = decision;
  report.reviewNote = note;
  report.reviewedBy = actor.id;
  report.reviewedByName = actor.name;
  report.reviewedAt = now();
  report.updatedAt = now();
  report.versions.push(await makeVersion(report, actor, `${decision}: ${note || 'no note'}`, decision));
  await put('reports', report);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: decision === 'Approved' ? 'report.approve' : 'report.reject',
    resourceType: 'report', resourceId: id, resourceName: report.title, meta: { note },
  });
  return report;
}

export async function reopenReport(id: string, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<Report> {
  const report = await getOne('reports', id);
  if (!report) throw new Error('Report not found.');
  report.status = 'Draft';
  report.updatedAt = now();
  report.versions.push(await makeVersion(report, actor, 'Reopened as draft', 'Draft'));
  await put('reports', report);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'report.reopen', resourceType: 'report', resourceId: id, resourceName: report.title,
  });
  return report;
}

export async function deleteReport(id: string, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<void> {
  const report = await getOne('reports', id);
  if (!report) return;
  await del('reports', id);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'report.delete', resourceType: 'report', resourceId: id, resourceName: report.title,
  });
}

export async function reportStats(): Promise<{ total: number; byStatus: Record<string, number> }> {
  const list = await getAll('reports');
  const byStatus: Record<string, number> = {};
  for (const r of list) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { total: list.length, byStatus };
}

export { invalidateRetrievalIndex, groupKey };
