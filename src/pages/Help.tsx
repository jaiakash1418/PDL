import { Link } from 'react-router-dom';
import { BookOpen, Compass, FileCheck2, HelpCircle, Layers, ShieldQuestion, Workflow } from 'lucide-react';
import { DEMO_ACCOUNTS } from '../services/auth';
import { ROLE_LABELS, type Role } from '../lib/types';
import { Badge, Card, CardHead } from '../components/ui';
import { NO_EVIDENCE_MESSAGE } from '../services/retrieval';

export function Help() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Help & Guide</h2>
          <p className="sub">How STRATAVEX works, what it can and cannot do, and the honesty constraints built into every feature.</p>
        </div>
      </div>

      <Card>
        <CardHead title="What this prototype is" right={<Compass size={15} className="muted" />} />
        <div className="card__body stack-sm">
          <p>STRATAVEX is an evidence-first reporting workspace for geological, mining, production, safety and administrative documents. Every figure it presents is traceable to a source document, page and passage. Where a record does not exist, it says so rather than estimating.</p>
          <div className="grid-cards">
            <Mini icon={<FileCheck2 size={16} />} title="Cited, not invented" body="Answers, report findings and alerts cite Document → Section → Page." />
            <Mini icon={<ShieldQuestion size={16} />} title="Gaps reported as gaps" body="Missing periods, fields and unverified claims are surfaced, never filled silently." />
            <Mini icon={<Layers size={16} />} title="Conflicts preserved" body="Disagreeing values are shown side by side with their sources." />
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Getting started" right={<Workflow size={15} className="muted" />} />
        <div className="card__body">
          <ol className="steps">
            <li><strong>Sign in</strong> with a demonstration account (below) or use a quick-access role on the sign-in screen.</li>
            <li><strong>Review the repository.</strong> The workspace is pre-loaded with a synthetic multi-period dataset.</li>
            <li><strong>Upload documents</strong> (administrator/analyst) — PDF, DOCX, XLSX/CSV, TXT/MD and images/PDF scans via best-effort OCR.</li>
            <li><strong>Ask questions</strong> in the AI Query Workspace. In local mode answers are extractive and fully cited.</li>
            <li><strong>Build a report</strong> from cited findings, then submit it for review.</li>
            <li><strong>Review</strong> validation issues, duplicates and conflicts in the Evidence pages.</li>
            <li><strong>Approve or reject</strong> reports (reviewer/administrator). Every action is written to the audit trail.</li>
          </ol>
        </div>
      </Card>

      <Card>
        <CardHead title="Roles & permissions" right={<Badge tone="info">{Object.keys(ROLE_LABELS).length} roles</Badge>} />
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Capability</th><th>Administrator</th><th>Analyst</th><th>Reviewer</th></tr></thead>
            <tbody>
              {[
                ['View repository & query', 'Yes', 'Yes', 'Yes'],
                ['Upload & process documents', 'Yes', 'Yes', '—'],
                ['Generate & edit reports', 'Yes', 'Yes', '—'],
                ['Submit reports for review', 'Yes', 'Yes', '—'],
                ['Approve / reject reports', 'Yes', '—', 'Yes'],
                ['Resolve conflicts & issues', 'Yes', 'Yes', 'Yes'],
                ['Manage users, settings & reset', 'Yes', '—', '—'],
                ['View audit trail', 'Yes', '—', 'Yes'],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="small strong">{row[0]}</td>
                  {row.slice(1).map((c, i) => <td key={i} className="small">{c === 'Yes' ? <Badge tone="success">Yes</Badge> : <span className="muted">{c}</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card__body xsmall muted">Permissions are enforced in the route guards and service layer, not only by hiding navigation.</div>
      </Card>

      <Card>
        <CardHead title="Processing & OCR" right={<Layers size={15} className="muted" />} />
        <div className="card__body stack-sm">
          <p className="small">On upload, text and tables are extracted per page and indexed. PDFs are parsed with pdf.js, Word and Excel with dedicated readers. Image files and image-only PDFs use OCR (Tesseract.js, loaded on demand).</p>
          <div className="banner warn"><span className="small">If OCR cannot read a scan, the original file is preserved and the document is marked <strong>Partially Processed</strong> or <strong>Failed</strong> so you know it was not fully read. No text is invented to fill the gap.</span></div>
        </div>
      </Card>

      <Card>
        <CardHead title="How the assistant answers" right={<ShieldQuestion size={15} className="muted" />} />
        <div className="card__body stack-sm">
          <p className="small">Local mode ranks passages by term relevance and assembles a cited answer. If nothing relevant is found, it replies exactly:</p>
          <div className="banner info"><span className="small mono">"{NO_EVIDENCE_MESSAGE}"</span></div>
          <p className="small muted">An optional generative model can be enabled through environment variables; when enabled it is still constrained to the retrieved passages and the same citation and refusal rules.</p>
        </div>
      </Card>

      <Card>
        <CardHead title="Honest limitations" right={<ShieldQuestion size={15} className="muted" />} />
        <div className="card__body">
          <ul className="bullets">
            <li>All seeded data is <strong>synthetic</strong> and represents no real mine, subsidiary or person.</li>
            <li><strong>Source Coverage</strong> measures how many claims have sources. It is not an accuracy score; accuracy has not been independently evaluated.</li>
            <li>The audit trail is hash-chained and tamper-evident within browser storage, but is not tamper-proof against someone who rewrites the whole chain.</li>
            <li>This is a single-browser demonstration: there is no server, no shared database and no multi-user sync.</li>
            <li>Conflict resolution records a reviewer's chosen value with justification; it does not alter the original documents.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHead title="Demonstration accounts" right={<HelpCircle size={15} className="muted" />} />
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Role</th><th>Email</th><th>Password</th><th>Title</th></tr></thead>
            <tbody>
              {DEMO_ACCOUNTS.map((a) => (
                <tr key={a.email}>
                  <td><Badge tone={a.role === 'administrator' ? 'warning' : a.role === 'reviewer' ? 'info' : 'neutral'}>{ROLE_LABELS[a.role as Role]}</Badge></td>
                  <td className="small mono">{a.email}</td>
                  <td className="small mono">{a.password}</td>
                  <td className="small">{a.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card__body"><Link to="/app/overview" className="link">← Return to the overview</Link></div>
      </Card>
    </div>
  );
}

function Mini({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mini-card">
      <span className="mini-card__icon">{icon}</span>
      <div><div className="strong small">{title}</div><div className="xsmall muted">{body}</div></div>
    </div>
  );
}

export { Help as HelpPage, BookOpen };
