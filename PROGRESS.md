# STRATAVEX — Build Progress

Status: **complete and building green.** `npm run build` (typecheck + Vite production
build) and `npm test` (33 tests) both pass.

## Architecture decisions

- **Browser-only demonstration SPA.** No backend. Everything persists in IndexedDB so
  the app is a single, self-contained artifact that runs from `npm run dev` or a static
  build. This keeps the demonstration reproducible and avoids fabricating a server.
- **Evidence-first by construction.** Retrieval, reports, validation and conflicts all
  carry `SourceRef` citations; the "no evidence" path returns a fixed sentence.
- **Honest failure modes.** OCR and extraction never invent text — unreadable scans are
  marked `Partially Processed` / `Failed` and preserved as-is.
- **Real cryptography where it matters.** SHA-256 file hashing, PBKDF2 password hashing
  and a genuine hash-chained audit log (not a stub).
- **Optional AI.** A generative model can be enabled via `VITE_AI_*` env vars; without
  them the workspace uses a real local TF-IDF retrieval engine.

## Completed

### Configuration
- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`,
  `.gitignore`, `.env.example`, `public/stratavex.svg`

### Core library (`src/lib`)
- `types.ts` — full domain model
- `db.ts` — IndexedDB schema (15 stores) + typed helpers
- `crypto.ts` — SHA-256, PBKDF2 hash/verify, short hash
- `text.ts` — tokenizer, stop-words, `TfIdfIndex`, similarity, measurement extraction,
  snippet selection
- `util.ts` — formatting, period helpers, tone mappings, stable stringify
- `colors.ts` — status/severity colour tokens

### Services (`src/services`)
- `auth.ts` — demo accounts, PBKDF2 auth, sessions, user CRUD
- `documents.ts` — ingest + processing pipeline, chunking, CRUD, text search
- `processing/ocr.ts`, `processing/extract.ts` — PDF/DOCX/XLSX/CSV/text/image + OCR
- `retrieval.ts` — `answerQuery`, citations, `NO_EVIDENCE_MESSAGE`, corpus summary
- `ai.ts` — optional model integration (env-gated)
- `metrics.ts`, `insights.ts` — metric collection and trend series (null gaps preserved)
- `conflicts.ts`, `duplicates.ts`, `validation.ts` — detection + review workflows
- `reports.ts` — generation, coverage breakdown, draft/submit/approve/reject/reopen
- `export.ts` — PDF, DOCX, CSV, Markdown, citation formatting
- `audit.ts` — append-only hash chain + `verifyChain`
- `notifications.ts`, `settings.ts`, `reset.ts`, `seed.ts` — supporting services

### State & components
- `state/store.ts` — zustand store (boot, auth, settings, toasts, notifications, reset)
- `components/ui.tsx`, `overlays.tsx`, `useAsync.ts`
- `components/layout/` — `nav.tsx`, `Sidebar`, `Topbar`, `AppLayout`

### Pages (`src/pages`)
- `Login`, `ForgotPassword`, `Overview`
- `Documents`, `DocumentDetail`, `Upload`
- `Query` (AI Query Workspace)
- `Reports`, `ReportDetail`
- `Validation`, `Duplicates`, `Conflicts`, `Insights`
- `Audit`, `Settings`, `Help`, `NotFound`

### Tests (`src/tests`)
- `text.test.ts` (12) — tokenisation, TF-IDF ranking, similarity, measurements, snippets
- `crypto.test.ts` (6) — SHA-256 vectors, PBKDF2 round-trip, deterministic short hash
- `reports.test.ts` (5) — Source Coverage and coverage breakdown
- `util.test.ts` (10) — period helpers, formatting, stable stringify, tone mappings

## Verification

```
npm run build   # tsc --noEmit && vite build  →  passes
npm test        # vitest run                    →  33 passed
```

## Known limitations (by design)

- Single-browser only: no server, no multi-user sync, no shared database.
- Not production authentication; demo accounts use documented passwords.
- Audit chain is integrity-evident, not tamper-proof against full-chain rewrites.
- OCR accuracy depends on scan quality; failures are reported, not hidden.
- Optional generative answers require an API key and network access.

## Possible future work

- Backend + real database and server-side RBAC.
- Vector embeddings for semantic retrieval.
- Real email / identity provider for resets and notifications.
- Scheduled re-validation and automated report distribution.
