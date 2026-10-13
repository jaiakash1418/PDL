// Core domain models for STRATAVEX.
// All data is synthetic demonstration data unless uploaded by the user.

export type Role = 'administrator' | 'analyst' | 'reviewer';

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  analyst: 'Analyst',
  reviewer: 'Reviewer',
};

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  title?: string;
  passwordHash?: string;
  salt?: string;
  active: boolean;
  isDemo?: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export type DocCategory =
  | 'Production Report'
  | 'Geological Report'
  | 'Safety Observation'
  | 'Administrative'
  | 'Survey & Measurement'
  | 'Compliance';

export type ProcessingStatus =
  | 'Uploaded'
  | 'Processing'
  | 'Indexed'
  | 'Partially Processed'
  | 'Failed';

export type VerificationStatus = 'Unverified' | 'Verified' | 'Needs Review';

export interface ProcessingLogEntry {
  at: number;
  stage: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface DocumentRecord {
  id: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  byteSize: number;
  category: DocCategory | string;
  department: string;
  subsidiary: string;
  reportingPeriod: string;
  uploadedAt: number;
  uploadedBy: string;
  uploadedByName: string;
  status: ProcessingStatus;
  pageCount: number;
  sheetCount?: number;
  verification: VerificationStatus;
  fileHash: string;
  isSeed?: boolean;
  isScan?: boolean;
  ocrUsed?: boolean;
  hasBlob: boolean;
  processingLog: ProcessingLogEntry[];
  notes?: string;
}

export interface PageRecord {
  id: string;
  docId: string;
  pageNo: number;
  section?: string;
  text: string;
}

export interface TableRecord {
  id: string;
  docId: string;
  pageNo: number;
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface Chunk {
  id: string;
  docId: string;
  pageNo: number;
  section?: string;
  text: string;
  tokens: string[];
}

export interface SourceRef {
  docId: string;
  docName: string;
  section?: string;
  pageNo: number;
  snippet?: string;
}

// ---- Reports ----

export type ReportType = 'Production' | 'Geology' | 'Safety' | 'Administrative';
export type ReportStatus = 'Draft' | 'Pending Review' | 'Approved' | 'Rejected';

export type ClaimKind = 'finding' | 'comparison' | 'validation' | 'missing';

export interface ReportClaim {
  id: string;
  text: string;
  sourceRefs: SourceRef[];
  verified: boolean;
  kind: ClaimKind;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
  sourceDocIds?: string[];
}

export interface ReportSection {
  id: string;
  heading: string;
  body: string;
  claimIds: string[];
  noContent?: boolean;
  tables?: ReportTable[];
}

export interface ReportVersion {
  version: number;
  at: number;
  by: string;
  byName: string;
  status: ReportStatus;
  note?: string;
  contentHash: string;
  /** Serialised copy of the report content captured at save time. Enables review
   *  diffs between versions without re-deriving content. Absent on versions that
   *  predate snapshot capture. */
  snapshot?: string;
}

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  reportingPeriod: string;
  scope: string;
  status: ReportStatus;
  createdAt: number;
  createdBy: string;
  createdByName: string;
  updatedAt: number;
  executiveSummary: string;
  sections: ReportSection[];
  claims: ReportClaim[];
  conflictIds: string[];
  validationIssueIds: string[];
  sourceDocIds: string[];
  versions: ReportVersion[];
  reviewNote?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
}

// ---- Validation ----

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'Open' | 'Reviewed' | 'Resolved' | 'Dismissed';

export interface ValidationIssue {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: IssueSeverity;
  status: IssueStatus;
  docId: string;
  docName: string;
  field: string;
  currentValue: string;
  expected?: string;
  reason: string;
  sourceRef: SourceRef;
  suggestion: string;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  resolution?: string;
  createdAt: number;
}

// ---- Duplicates ----

export type DuplicateStatus = 'Pending' | 'Confirmed Duplicate' | 'Not Duplicate' | 'Dismissed';

export interface DuplicatePair {
  id: string;
  docAId: string;
  docBId: string;
  reason: string;
  similarity?: number;
  exact: boolean;
  status: DuplicateStatus;
  note?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  createdAt: number;
}

// ---- Conflicts ----

export type ConflictStatus = 'Unresolved' | 'Resolved';

export interface ConflictValue {
  value: string;
  docId: string;
  docName: string;
  pageNo: number;
  section?: string;
  snippet: string;
}

export interface Conflict {
  id: string;
  entity: string;
  metric: string;
  scope: string;
  reportingPeriod: string;
  values: ConflictValue[];
  status: ConflictStatus;
  selectedDocId?: string;
  justification?: string;
  reviewNote?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: number;
  createdAt: number;
}

// ---- Audit ----

export interface AuditEvent {
  id: string;
  seq: number;
  at: number;
  actorId: string;
  actorName: string;
  actorRole: Role | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  meta?: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

// ---- Notifications & settings ----

export interface AppNotification {
  id: string;
  at: number;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
}

export interface WorkspaceSettings {
  id: 'workspace';
  orgName: string;
  subsidiary: string;
  subsidiaries: string[];
  categories: string[];
  theme: 'light' | 'dark';
  notifications: {
    reportReview: boolean;
    validation: boolean;
    toasts: boolean;
  };
  updatedAt: number;
}

// ---- Query workspace ----

export type QueryMode = 'local' | 'ai';

export interface QueryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
  mode: QueryMode;
  citations: SourceRef[];
  coverage?: number;
  noEvidence?: boolean;
  limitations: string[];
  conflicts: Conflict[];
  structured?: { columns: string[]; rows: string[][] };
}

export interface Conversation {
  id: string;
  title: string;
  at: number;
  messages: QueryMessage[];
}

export interface SavedQuery {
  id: string;
  text: string;
  at: number;
}
