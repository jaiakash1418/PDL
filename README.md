# STRATAVEX

An evidence-first reporting workspace for geological, mining, production, safety and
administrative documents. Every figure the application presents is traceable to a
source document, page and passage. Where a record does not exist, STRATAVEX says so
rather than estimating.

> **Demonstration prototype.** All seeded data is synthetic and represents no real
> mine, subsidiary, person or operational record. This is a single-browser academic
> demonstration, not a production system.

---

## What it does

| Area | Capability |
|------|------------|
| **Document repository** | Upload and store PDF, DOCX, XLSX/XLS, CSV, TXT/MD and images; per-page text extraction and indexing. |
| **Processing & OCR** | `pdf.js`, Mammoth, SheetJS extraction; best-effort OCR (Tesseract.js) for scans. Unreadable scans are flagged, never invented. |
| **AI Query Workspace** | Cited question answering over the corpus. Local extractive search by default; optional generative model when configured. |
| **Report Builder** | Fully-cited reports (Production, Geology, Safety, Administrative) with a Source Coverage panel, versioning, and an approval workflow. |
| **Data Validation** | A rule engine that flags missing fields, unit inconsistencies, unexpected changes, conflicts and duplicates. |
| **Duplicate Detection** | File-hash, metadata and text-similarity matching with side-by-side review. |
| **Conflict Review** | Side-by-side values for the same metric/scope/period; resolution records a chosen value with justification. |
| **Historical Insights** | Trend charts and tables; missing periods render as gaps, never zero. |
| **Audit Trail** | Append-only, SHA-256 hash-chained activity log with integrity verification. |
| **Exports** | Reports as PDF, DOCX, CSV and Markdown; the audit log as JSON. |

## Honesty constraints

These are design rules, not marketing claims:

- Answers, report findings and alerts **cite** Document → Section → Page.
- When nothing relevant is found the assistant replies exactly:
  `No verified record found in the available documents.`
- **Source Coverage** measures how many claims have sources. It is **not** an accuracy
  score; accuracy has not been independently evaluated.
- Missing fields, periods and unverified claims are **surfaced**, never filled silently.
- Conflicting values are shown **side by side**; the newest document is not assumed correct.
- The audit chain is tamper-**evident** within browser storage, but not tamper-**proof**
  against an attacker who rewrites the whole chain.

---

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **Zustand** for state, **React Router** for routing
- **IndexedDB** (`idb`) for local persistence — documents, blobs, reports, issues, audit
- **pdf.js**, **Mammoth**, **SheetJS** for extraction; **Tesseract.js** for OCR
- **Recharts** for charts; **jsPDF**/**docx**/**SheetJS** for exports
- **Vitest** + **jsdom** for tests

## Getting started

Requires Node 18+ (developed on Node 24).

```bash
npm install
npm run dev        # start the dev server
```

Then open the printed URL (default http://localhost:5173).

### Demonstration accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@stratavex.demo` | `Stratavex@123` |
| Analyst | `analyst@stratavex.demo` | `Stratavex@123` |
| Reviewer | `reviewer@stratavex.demo` | `Stratavex@123` |

The sign-in screen also offers one-click role access. Passwords are stored PBKDF2-hashed;
this is a demonstration auth flow, not a production identity system.

## Scripts

```bash
npm run dev        # development server
npm run build      # typecheck (tsc --noEmit) + production build
npm run preview    # preview the production build
npm run typecheck  # typecheck only
npm test           # run the test suite (Vitest)
npm run test:watch # watch mode
```

## Optional generative AI

The AI Query Workspace works entirely offline using local extractive retrieval. To let
it synthesise answers with a model, provide environment variables (see `.env.example`):

```
VITE_AI_BASE_URL=https://api.openai.com/v1
VITE_AI_API_KEY=...
VITE_AI_MODEL=gpt-4o-mini
```

When configured, the model is still constrained to the retrieved passages and the same
citation and refusal rules. Keys are read at build time and are never stored in the
workspace or included in exports.

## Project structure

```
src/
  components/     # UI primitives, overlays, layout
  lib/            # types, db (IndexedDB), crypto, text/TF-IDF, utils
  pages/          # route screens
  services/       # documents, retrieval, reports, validation, conflicts,
                  # duplicates, insights, audit, export, seed, reset, auth
  state/          # zustand store
  styles/         # design-system CSS
  tests/          # vitest suites
```

## Data & privacy

Everything lives in the browser's IndexedDB. No server, no transmission, no shared
database. Uploaded documents stay on the device. Settings → Data & Reset restores the
synthetic demonstration dataset at any time.

## License

Academic demonstration prototype. Provided as-is, without warranty.
