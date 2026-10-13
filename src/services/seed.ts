import type { DocumentRecord, PageRecord } from '../lib/types';
import { put, putMany } from '../lib/db';
import { sha256Hex } from '../lib/crypto';
import { uid } from '../lib/util';
import { buildChunks } from './documents';
import { addNotification } from './notifications';
import { detectConflicts } from './conflicts';
import { detectDuplicates } from './duplicates';
import { runValidation } from './validation';
import { appendAudit } from './audit';

// ---------------------------------------------------------------------------
// Synthetic demonstration dataset.
// Everything below is FABRICATED sample content for a fictional "Demo Coalfield"
// organisation. It does not represent CMPDI, Coal India Limited, or any real
// mine, subsidiary, or operational record. It is clearly labelled as synthetic.
// ---------------------------------------------------------------------------

interface SeedPage {
  section?: string;
  text: string;
}

interface SeedDocSpec {
  fileName: string;
  category: string;
  department: string;
  subsidiary: string;
  period: string;
  pages: SeedPage[];
  verification?: DocumentRecord['verification'];
  notes?: string;
}

const SUBA = 'Demo Coalfield — Subsidiary A';
const SUBB = 'Demo Coalfield — Subsidiary B';

function productionPage(month: string, period: string, values: Record<string, string>, sub = SUBA): SeedPage[] {
  const lines = Object.entries(values).map(([k, v]) => `${k}: ${v}`).join('\n');
  return [
    {
      section: 'Section 1: Production Summary',
      text: `Synthetic Monthly Production Report — ${month}
Reporting Period: ${period}
Subsidiary: ${sub}
Department: Production

This is a synthetic demonstration document generated for the STRATAVEX prototype. It does not represent a real mine, subsidiary or operational record.

${lines}

The figures above are the recorded values for the reporting period and form the basis for the monthly production report submitted to management.`,
    },
    {
      section: 'Section 2: Operational Notes',
      text: `Operational Notes — ${month}
Coal evacuation continued through the existing dispatch route. Overburden removal remained within the planned schedule. No major equipment outage was reported during the period. Safety observations recorded during the period were reviewed at the monthly safety committee meeting.`,
    },
  ];
}

export function seedDocSpecs(): SeedDocSpec[] {
  const specs: SeedDocSpec[] = [];

  // Monthly production reports, Subsidiary A, Jan–Jun 2025
  const monthly: [string, string, Record<string, string>][] = [
    ['January', '2025-01', { 'Raw Coal Production': '11.80 Million Tonnes', 'Coal Dispatch': '11.20 Million Tonnes', 'Overburden Removal': '42.50 Million Cubic Metres', 'Production Target Achievement': '98.30 %', 'Coal Stock at Pit Head': '0.85 Million Tonnes' }],
    ['February', '2025-02', { 'Raw Coal Production': '12.05 Million Tonnes', 'Coal Dispatch': '11.90 Million Tonnes', 'Overburden Removal': '43.80 Million Cubic Metres', 'Production Target Achievement': '100.40 %', 'Coal Stock at Pit Head': '0.90 Million Tonnes' }],
    ['March', '2025-03', { 'Raw Coal Production': '12.45 Million Tonnes', 'Coal Dispatch': '12.30 Million Tonnes', 'Overburden Removal': '44.10 Million Cubic Metres', 'Production Target Achievement': '101.20 %', 'Coal Stock at Pit Head': '1.62 Million Tonnes' }],
    ['April', '2025-04', { 'Raw Coal Production': '12.90 Million Tonnes', 'Coal Dispatch': '12.75 Million Tonnes', 'Overburden Removal': '45.60 Million Cubic Metres', 'Production Target Achievement': '103.10 %', 'Coal Stock at Pit Head': '1.55 Million Tonnes' }],
    ['May', '2025-05', { 'Raw Coal Production': '13.40 Million Tonnes', 'Coal Dispatch': '13.10 Million Tonnes', 'Overburden Removal': '46.20 Million Cubic Metres', 'Production Target Achievement': '104.50 %', 'Coal Stock at Pit Head': '1.30 Million Tonnes' }],
    ['June', '2025-06', { 'Raw Coal Production': '13.10 Million Tonnes', 'Coal Dispatch': '13.05 Million Tonnes', 'Overburden Removal': '47.00 Million Cubic Metres', 'Production Target Achievement': '102.00 %', 'Coal Stock at Pit Head': '1.20 Million Tonnes' }],
  ];
  for (const [month, period, values] of monthly) {
    specs.push({
      fileName: `Monthly Production Report — ${month} 2025.pdf`,
      category: 'Production Report',
      department: 'Production',
      subsidiary: SUBA,
      period,
      pages: productionPage(month, period, values),
      verification: 'Verified',
    });
  }

  // Exact duplicate of the April report (identical content → identical hash)
  specs.push({
    fileName: 'Monthly Production Report — April 2025 (copy).pdf',
    category: 'Production Report',
    department: 'Production',
    subsidiary: SUBA,
    period: '2025-04',
    pages: productionPage('April', '2025-04', monthly[3][2]),
    verification: 'Unverified',
    notes: 'Apparent duplicate uploaded by a different team; retained for review.',
  });

  // Revised March production summary — conflicts with the March report value
  specs.push({
    fileName: 'Production Summary (Revised) — March 2025.docx',
    category: 'Production Report',
    department: 'Production',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Revised Production Figures',
        text: `Synthetic Revised Production Summary — March 2025
Reporting Period: 2025-03
Subsidiary: ${SUBA}

This revised summary was prepared after a reconciliation exercise. Values that differ from the original monthly report are highlighted for review.

Raw Coal Production: 12.10 Million Tonnes
Coal Dispatch: 12.30 Million Tonnes
Overburden Removal: 44.10 Million Cubic Metres
Production Target Achievement: 101.20 %

The revised raw coal production figure reflects tonnage re-weighed during reconciliation. The reason for the difference from the original monthly report has not been independently confirmed in the available documents.`,
      },
    ],
    verification: 'Needs Review',
    notes: 'Conflicting raw coal production total for March 2025.',
  });

  // Subsidiary B production report (scope demonstration)
  specs.push({
    fileName: 'Monthly Production Report — June 2025 (Subsidiary B).pdf',
    category: 'Production Report',
    department: 'Production',
    subsidiary: SUBB,
    period: '2025-06',
    pages: productionPage('June', '2025-06', {
      'Raw Coal Production': '8.20 Million Tonnes',
      'Coal Dispatch': '8.05 Million Tonnes',
      'Overburden Removal': '31.40 Million Cubic Metres',
      'Production Target Achievement': '99.10 %',
    }, SUBB),
    verification: 'Verified',
  });

  // Geological assessment
  specs.push({
    fileName: 'Geological Assessment — Block A.pdf',
    category: 'Geological Report',
    department: 'Geology',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Section 1: Seam Characteristics',
        text: `Synthetic Geological Assessment — Block A
Reporting Period: 2025-03
Subsidiary: ${SUBA}
Department: Geology

This synthetic assessment describes the interpreted seam geometry for the demonstration block.

Seam Thickness: 4.20 Metres
Coal Grade (Ash Content): 22.50 %
Moisture Content: 8.10 %
Reserve Estimate: 145.00 Million Tonnes`,
      },
      {
        section: 'Section 2: Inconsistencies and Uncertainties',
        text: `Geological Inconsistencies
Variation in seam thickness was observed across the studied block. Two boreholes indicated a local thinning of the seam. The interpretation carries uncertainty where borehole density is low, and the reserve estimate should be treated as an indicated figure rather than a proven reserve.`,
      },
    ],
    verification: 'Verified',
  });

  // Survey sheet — seam thickness conflicts with the geological assessment
  specs.push({
    fileName: 'Seam Thickness Survey — Q1 2025.xlsx',
    category: 'Survey & Measurement',
    department: 'Survey',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Seam Thickness Survey',
        text: `Seam Thickness Survey — Q1 2025
Reporting Period: 2025-03
Subsidiary: ${SUBA}

Seam Thickness: 4.85 Metres
Moisture Content: 8.10 %
Borehole Spacing: 250 Metres

Measurements were taken using the standard survey method across the drilled grid.`,
      },
    ],
    verification: 'Needs Review',
    notes: 'Seam thickness differs from the geological assessment for the same period.',
  });

  // Safety register
  specs.push({
    fileName: 'Safety Observation Register — Q1 2025.csv',
    category: 'Safety Observation',
    department: 'Safety',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Safety Observations',
        text: `Safety Observation Register — Q1 2025
Reporting Period: 2025-03
Subsidiary: ${SUBA}
Department: Safety

Reportable Incidents: 2 Number
Safety Observations Recorded: 14 Number
Safety Observations Closed: 11 Number

Documented safety observations included inadequate barricading near an active face, an unguarded conveyor nip point, and delayed statutory testing of lifting equipment. Corrective actions were assigned to section heads.`,
      },
    ],
    verification: 'Verified',
  });

  specs.push({
    fileName: 'Safety Audit Findings — April 2025.docx',
    category: 'Safety Observation',
    department: 'Safety',
    subsidiary: SUBA,
    period: '2025-04',
    pages: [
      {
        section: 'Audit Findings',
        text: `Synthetic Safety Audit Findings — April 2025
Reporting Period: 2025-04
Subsidiary: ${SUBA}

The internal safety audit identified observations relating to housekeeping, ventilation monitoring and emergency egress routes. Recommended corrective actions carry target dates in the following quarter. No reportable incident occurred during the audit window.`,
      },
    ],
    verification: 'Verified',
  });

  // Administrative documents
  specs.push({
    fileName: 'Administrative Circular — March 2025.docx',
    category: 'Administrative',
    department: 'Administration',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Circular',
        text: `Synthetic Administrative Circular — March 2025
Reporting Period: 2025-03
Subsidiary: ${SUBA}

Sanctioned Manpower: 1250 Number
Manpower on Roll: 1187 Number

This circular records an administrative decision relating to staffing and departmental responsibilities. It is a synthetic demonstration document.`,
      },
    ],
    verification: 'Unverified',
  });

  specs.push({
    fileName: 'Statutory Compliance Returns — Q1 2025.pdf',
    category: 'Compliance',
    department: 'Administration',
    subsidiary: SUBA,
    period: '2025-03',
    pages: [
      {
        section: 'Compliance Returns',
        text: `Synthetic Statutory Compliance Returns — Q1 2025
Reporting Period: 2025-03
Subsidiary: ${SUBA}

Returns were filed within the statutory timelines for the quarter. Two returns required a correction and were re-filed. Supporting documentation is retained in the compliance register.`,
      },
    ],
    verification: 'Verified',
  });

  return specs;
}

async function createSeedDocument(spec: SeedDocSpec): Promise<DocumentRecord> {
  const content = spec.pages.map((p) => p.text).join('\n\n');
  const fileHash = await sha256Hex(content);
  const id = uid('seed');
  const pages: PageRecord[] = spec.pages.map((p, i) => ({
    id: `${id}:${i + 1}`,
    docId: id,
    pageNo: i + 1,
    section: p.section,
    text: p.text,
  }));
  const chunks = buildChunks(id, pages);
  const doc: DocumentRecord = {
    id,
    fileName: spec.fileName,
    fileExtension: spec.fileName.split('.').pop()!.toLowerCase(),
    mimeType: 'application/x-stratavex-synthetic',
    byteSize: content.length,
    category: spec.category,
    department: spec.department,
    subsidiary: spec.subsidiary,
    reportingPeriod: spec.period,
    uploadedAt: Date.parse(`${spec.period}-05T09:15:00Z`) || Date.now(),
    uploadedBy: 'system',
    uploadedByName: 'Synthetic Seed',
    status: 'Indexed',
    pageCount: pages.length,
    verification: spec.verification ?? 'Unverified',
    fileHash,
    isSeed: true,
    hasBlob: false,
    processingLog: [
      { at: Date.now(), stage: 'Seed', message: 'Synthetic demonstration document generated (no original file).', level: 'info' },
      { at: Date.now(), stage: 'Extract', message: `Extracted ${pages.length} page(s) of synthetic text.`, level: 'info' },
      { at: Date.now(), stage: 'Index', message: `Indexed ${chunks.length} content chunk(s).`, level: 'info' },
    ],
    notes: spec.notes,
  };
  await put('documents', doc);
  await putMany('pages', pages);
  if (chunks.length) await putMany('chunks', chunks);
  return doc;
}

export async function seedDemoData(): Promise<{ documents: number }> {
  const specs = seedDocSpecs();
  for (const spec of specs) await createSeedDocument(spec);

  await appendAudit({
    actorId: 'system', actorName: 'Synthetic Seed', actorRole: 'system',
    action: 'demo.data.seed', resourceType: 'workspace',
    meta: { documents: specs.length, synthetic: true },
  });

  await detectConflicts();
  await detectDuplicates();
  await runValidation();

  await addNotification({ title: 'Demo workspace ready', body: `${specs.length} synthetic documents loaded. Conflicts, duplicates and validation issues have been generated.`, level: 'success', link: '/app/overview' });
  await addNotification({ title: 'Reviewer task pending', body: 'Unresolved conflicts and duplicate matches are waiting for review.', level: 'info', link: '/app/conflicts' });

  return { documents: specs.length };
}
