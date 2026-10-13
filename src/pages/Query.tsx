import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Bookmark, FileText, Filter, MessageSquarePlus, Send, Sparkles, Trash2, ExternalLink, History, X, User as UserIcon, ShieldAlert, Table2 } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { answerQuery, NO_EVIDENCE_MESSAGE, type AnswerOptions } from '../services/retrieval';
import { isAiConfigured, aiConfigSummary } from '../services/ai';
import { listDocuments } from '../services/documents';
import { getAll, put, del } from '../lib/db';
import type { Conversation, QueryMessage, SavedQuery, SourceRef } from '../lib/types';
import { Badge, Button, Card, CopyButton, EmptyState, Spinner } from '../components/ui';
import { Modal } from '../components/overlays';
import { fmtDateTime, now, periodLabel, relativeTime, truncate, uid } from '../lib/util';
import { sourceLink } from '../lib/links';

const EXAMPLES = [
  'Summarize production trends in the available monthly reports.',
  'Find geological reports mentioning inconsistencies in seam thickness.',
  'Compare recorded production figures across the selected periods.',
  'List documented safety observations for the selected reporting period.',
  'Generate a summary of verified findings from the selected documents.',
];

export function Query() {
  const navigate = useNavigate();
  const dataVersion = useStore((s) => s.dataVersion);
  const pushToast = useStore((s) => s.pushToast);

  const [messages, setMessages] = useState<QueryMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => uid('conv'));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [evidence, setEvidence] = useState<SourceRef | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, reload } = useAsync(async () => {
    const [docs, convs, saved] = await Promise.all([listDocuments(), getAll('conversations'), getAll('savedQueries')]);
    return {
      docs,
      conversations: (convs as Conversation[]).sort((a, b) => b.at - a.at),
      saved: (saved as SavedQuery[]).sort((a, b) => b.at - a.at),
    };
  }, [dataVersion]);

  const periods = useMemo(() => [...new Set((data?.docs ?? []).map((d) => d.reportingPeriod).filter(Boolean))].sort(), [data]);
  const aiOn = isAiConfigured();
  const ai = aiConfigSummary();

  const filters = useMemo<AnswerOptions['filters']>(() => {
    const f: AnswerOptions['filters'] = {};
    if (selectedDocs.length) f.docIds = selectedDocs;
    if (period) f.periods = [period];
    return f;
  }, [selectedDocs, period]);

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    const userMsg: QueryMessage = { id: uid('msg'), role: 'user', content: q, at: now(), mode: 'local', citations: [], limitations: [], conflicts: [] };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);
    try {
      const answer = await answerQuery(q, { filters });
      setMessages((prev) => [...prev, answer]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'assistant', content: `Query failed: ${err instanceof Error ? err.message : String(err)}`, at: now(), mode: 'local', citations: [], limitations: [], conflicts: [] }]);
    } finally {
      setBusy(false);
    }
  };

  const clearConversation = () => { setMessages([]); setConversationId(uid('conv')); };

  const saveConversation = async () => {
    if (messages.length === 0) { pushToast('Nothing to save yet.', 'warning'); return; }
    const title = truncate(messages.find((m) => m.role === 'user')?.content ?? 'Conversation', 60);
    const existing = (data?.conversations ?? []).find((c) => c.id === conversationId);
    const conv: Conversation = { id: conversationId, title, at: existing?.at ?? now(), messages };
    await put('conversations', conv);
    pushToast('Conversation saved to history.', 'success');
    reload();
  };

  const loadConversation = (c: Conversation) => {
    setMessages(c.messages);
    setConversationId(c.id);
  };

  const deleteConversation = async (id: string) => {
    await del('conversations', id);
    if (id === conversationId) clearConversation();
    reload();
  };

  const saveQuery = async (text: string) => {
    const sq: SavedQuery = { id: uid('sq'), text, at: now() };
    await put('savedQueries', sq);
    pushToast('Query saved.', 'success');
    reload();
  };

  const removeSaved = async (id: string) => { await del('savedQueries', id); reload(); };

  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
  const sources = lastAnswer?.citations ?? [];

  return (
    <div className="query-grid">
      {/* LEFT */}
      <aside className={'query-panel' + (showFilters ? ' mobile-show' : '')}>
        <div className="query-panel__head">
          <div className="row-between">
            <span className="strong small row gap-6"><History size={14} /> History</span>
            <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={clearConversation} title="New conversation"><MessageSquarePlus size={15} /></button>
          </div>
        </div>
        <div className="query-panel__scroll stack-sm">
          {(data?.conversations ?? []).length === 0 && <p className="xsmall muted">No saved conversations yet.</p>}
          {(data?.conversations ?? []).map((c) => (
            <div key={c.id} className={c.id === conversationId ? 'chip active' : 'chip'} style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => loadConversation(c)}>
              <span className="truncate small" style={{ maxWidth: 150 }}>{c.title}</span>
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}><X size={12} /></button>
            </div>
          ))}

          <hr className="divider mt-8" />
          <div className="strong xsmall uppercase muted">Saved queries</div>
          {(data?.saved ?? []).map((s) => (
            <div key={s.id} className="chip" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => submit(s.text)}>
              <span className="truncate small" style={{ maxWidth: 150 }} title={s.text}>{s.text}</span>
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={(e) => { e.stopPropagation(); removeSaved(s.id); }}><Bookmark size={12} /></button>
            </div>
          ))}
          {(data?.saved ?? []).length === 0 && <p className="xsmall muted">Save a query to reuse it.</p>}

          <hr className="divider mt-8" />
          <div className="strong xsmall uppercase muted row gap-6"><Filter size={12} /> Filters</div>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">All reporting periods</option>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          <div className="col gap-4" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {(data?.docs ?? []).map((d) => (
              <label key={d.id} className="checkbox" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selectedDocs.includes(d.id)}
                  onChange={(e) => setSelectedDocs((prev) => e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id))}
                />
                <span className="xsmall" style={{ color: 'var(--ink-600)', lineHeight: 1.35 }}>{d.fileName}</span>
              </label>
            ))}
          </div>
          {(selectedDocs.length > 0 || period) && (
            <Button size="sm" variant="ghost" onClick={() => { setSelectedDocs([]); setPeriod(''); }}>Clear filters</Button>
          )}
        </div>
      </aside>

      {/* CENTER */}
      <section className="query-center">
        <div className="query-panel__head row-between">
          <div className="row gap-8">
            <Sparkles size={16} color="var(--teal-600)" />
            <span className="strong small">Evidence-first query</span>
            <Badge tone={aiOn ? 'teal' : 'neutral'}>{aiOn ? `AI RAG · ${ai.model}` : 'Local Document Search (Demo)'}</Badge>
          </div>
          <div className="row gap-8">
            <button className="icon-btn mobile-only" style={{ width: 30, height: 30 }} onClick={() => setShowFilters((v) => !v)} title="Filters"><Filter size={15} /></button>
            {messages.length > 0 && (
              <>
                {lastAnswer && <CopyButton text={lastAnswer.content} onCopied={() => pushToast('Answer copied.', 'success')} />}
                <Button size="sm" variant="ghost" icon={<Bookmark size={14} />} onClick={saveConversation}>Save</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={clearConversation}>Clear</Button>
              </>
            )}
          </div>
        </div>

        <div className="query-thread">
          {messages.length === 0 && (
            <div className="col gap-16" style={{ maxWidth: 680, margin: '20px auto' }}>
              <div className="center">
                <span className="arc" style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: 'var(--teal-50)', color: 'var(--teal-600)' }}><Bot size={26} /></span>
                <h2 className="mt-12">Ask about your records</h2>
                <p className="muted small mt-4">Answers are grounded in indexed documents and every factual statement carries a citation. If evidence is missing, STRATAVEX says so.</p>
              </div>
              <div className="stack-sm">
                <span className="xsmall uppercase muted strong">Example queries</span>
                {EXAMPLES.map((e) => (
                  <button key={e} className="chip" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => submit(e)}>
                    <Sparkles size={13} /> <span className="small">{e}</span>
                  </button>
                ))}
              </div>
              {!aiOn && (
                <div className="banner info"><span className="small">No generative AI provider configured. Responses are assembled extractively from retrieved passages ({NO_EVIDENCE_MESSAGE.replace(' in the available documents.', '')} when nothing matches). Add VITE_AI_* keys to enable RAG generation.</span></div>
              )}
            </div>
          )}

          <div className="stack">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'row' : ''}>
                {m.role === 'user' ? (
                  <div className="msg-user">{m.content}</div>
                ) : (
                  <div className="msg-ai card">
                    <div className="card__head" style={{ padding: '10px 14px' }}>
                      <div className="row gap-8"><Bot size={16} color="var(--teal-600)" /><span className="strong small">STRATAVEX</span>
                        <Badge tone={m.mode === 'ai' ? 'teal' : 'neutral'}>{m.mode === 'ai' ? 'AI RAG' : 'Local search'}</Badge>
                      </div>
                      <CopyButton text={m.content} />
                    </div>
                    <div className="card__body" style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.65, color: 'var(--ink-700)' }}>
                      {m.content}
                    </div>

                    {m.structured && (
                      <div className="card__body" style={{ paddingTop: 0 }}>
                        <div className="row gap-6 small strong mb-8"><Table2 size={14} /> Extracted values</div>
                        <div className="table-wrap card" style={{ overflow: 'hidden' }}>
                          <table className="data">
                            <thead><tr>{m.structured.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                            <tbody>{m.structured.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {m.conflicts.length > 0 && (
                      <div className="card__body" style={{ paddingTop: 0 }}>
                        <div className="banner warn">
                          <ShieldAlert size={15} />
                          <div className="small">
                            <strong>Conflicting evidence.</strong> {m.conflicts.length} related conflict(s): both values are shown and none is silently preferred. Open Conflict Review to resolve.
                            <div className="mt-4">
                              <Button size="sm" variant="ghost" onClick={() => navigate('/app/conflicts')}>Open Conflict Review</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {m.citations.length > 0 && (
                      <div className="card__footer card__body" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <span className="xsmall uppercase muted strong">Citations</span>
                        <div className="pill-list mt-8">
                          {m.citations.map((c, i) => (
                            <button key={i} className="citation" onClick={() => setEvidence(c)}>
                              <FileText size={12} /> {truncate(c.docName, 32)} → {c.section ?? 'General'} → p.{c.pageNo}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {m.limitations.length > 0 && (
                      <div className="card__body" style={{ paddingTop: 0 }}>
                        <details className="small muted">
                          <summary style={{ cursor: 'pointer' }}>Notes & limitations ({m.limitations.length})</summary>
                          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                            {m.limitations.map((l, i) => <li key={i}>{l}</li>)}
                          </ul>
                        </details>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="row gap-10 muted"><Spinner /> <span className="small">Retrieving evidence…</span></div>}
          </div>
        </div>

        <div className="query-composer">
          <form className="row gap-10" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
            <input
              className="input grow"
              placeholder="Ask a question about the indexed records…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" variant="primary" icon={<Send size={16} />} disabled={busy || !input.trim()}>Ask</Button>
          </form>
          <div className="row gap-8 mt-8 wrap">
            <span className="xsmall muted">Quick:</span>
            {EXAMPLES.slice(0, 3).map((e) => (
              <button key={e} className="chip" style={{ fontSize: 12.5 }} onClick={() => submit(e)}>{truncate(e, 40)}</button>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT */}
      <aside className="query-panel right">
        <div className="query-panel__head row-between">
          <span className="strong small">Sources & evidence</span>
          <Badge tone="neutral">{sources.length}</Badge>
        </div>
        <div className="query-panel__scroll stack-sm">
          {sources.length === 0 && (
            <EmptyState icon={<FileText size={24} />} title="No sources yet" description="Submit a query to retrieve supporting evidence with citations." />
          )}
          {sources.map((s, i) => (
            <div key={i} className="evidence">
              <div className="row-between">
                <span className="src">{truncate(s.docName, 30)}</span>
                <Badge tone="teal">p.{s.pageNo}</Badge>
              </div>
              <div className="xsmall muted mt-4">{s.section ?? 'General'}</div>
              {s.snippet && <blockquote>"{truncate(s.snippet, 200)}"</blockquote>}
              <div className="row gap-8 mt-8">
                <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => setEvidence(s)}>View</Button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <Modal
        open={!!evidence}
        onClose={() => setEvidence(null)}
        title="Supporting evidence"
        sub={evidence ? `${evidence.docName} → ${evidence.section ?? 'General'} → Page ${evidence.pageNo}` : ''}
        footer={evidence && (
          <>
            <Button variant="ghost" onClick={() => setEvidence(null)}>Close</Button>
            <Button variant="primary" icon={<FileText size={15} />} onClick={() => navigate(sourceLink(evidence))}>Open document</Button>
          </>
        )}
      >
        {evidence && (
          <div className="stack">
            <div className="evidence">
              <div className="src">{evidence.docName}</div>
              <blockquote style={{ fontSize: 14.5 }}>"{evidence.snippet ?? 'No snippet available.'}"</blockquote>
            </div>
            <div className="row gap-12 small muted">
              <span>Section: <strong>{evidence.section ?? 'General'}</strong></span>
              <span>Page: <strong>{evidence.pageNo}</strong></span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
