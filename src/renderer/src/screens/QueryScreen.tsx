/**
 * Design 1: Quick-Access Dashboard with Pinned Queries
 *
 * Layout:
 *   ┌─────────┬────────────────────────────────────────┐
 *   │ sidebar │  [QueryBar: SQL textarea + Run button]  │
 *   │ groups  ├────────────────────────────────────────┤
 *   │ & items │  Results table (full width)             │
 *   │         ├────────────────────────────────────────┤
 *   │         │  Status bar: rows · ms · backup path   │
 *   └─────────┴────────────────────────────────────────┘
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { DataGrid } from '../components/DataGrid';
import { QUERY_GROUPS } from '../data/predefinedQueries';
import type { TableData } from '../types';

const HISTORY_KEY = 'queryHistory';
const MAX_HISTORY = 30;

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function QueryScreen() {
  const { databases, backupInfo, setScreen } = useAppStore();

  const [sql, setSql] = useState('-- Select a dataset from the sidebar or write your own SQL');
  const [results, setResults] = useState<TableData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(QUERY_GROUPS.map((g) => g.id))
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  /** Find the database file that matches a filePattern */
  const findDb = useCallback(
    (filePattern: string) => {
      const pat = filePattern.toLowerCase();
      return databases.find((db) => db.filename.toLowerCase().includes(pat)) ?? null;
    },
    [databases]
  );

  const runSQL = useCallback(
    async (sqlToRun: string, fileId?: string) => {
      if (!sqlToRun.trim()) return;

      // Determine which DB to use
      let targetFileId = fileId;
      if (!targetFileId) {
        // Fallback: use largest database
        const sorted = [...databases].sort((a, b) => b.size - a.size);
        targetFileId = sorted[0]?.fileId;
      }
      if (!targetFileId) {
        setError('No database available. Open a backup first.');
        return;
      }

      setIsRunning(true);
      setError(null);
      const t0 = performance.now();
      try {
        const data = (await window.api.rpc('backup.executeSQL', {
          fileId: targetFileId,
          sql: sqlToRun,
        })) as TableData;
        setResults(data);
        setDurationMs(Math.round(performance.now() - t0));

        // Push to history
        setHistory((prev) => {
          const next = [sqlToRun, ...prev.filter((s) => s !== sqlToRun)];
          saveHistory(next);
          return next;
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setResults(null);
      } finally {
        setIsRunning(false);
      }
    },
    [databases]
  );

  const handleSelectQuery = useCallback(
    (queryId: string, querySql: string, filePattern: string) => {
      setActiveQueryId(queryId);
      setIsCustom(false);
      setSql(querySql);
      setError(null);
      const db = findDb(filePattern);
      runSQL(querySql, db?.fileId);
    },
    [findDb, runSQL]
  );

  const handleRunBar = useCallback(() => {
    setIsCustom(true);
    setActiveQueryId(null);
    runSQL(sql);
  }, [sql, runSQL]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunBar();
      }
    },
    [handleRunBar]
  );

  const handleSqlChange = useCallback((value: string) => {
    setSql(value);
    setIsCustom(true);
    setActiveQueryId(null);
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rowCount = results?.total ?? results?.rows?.length ?? 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
        }}
      >
        <button className="btn btn-sm" onClick={() => setScreen('dashboard')}>
          ← Back
        </button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Quick Access</span>
        <span style={{ color: 'var(--text-muted)', flex: 1 }}>
          {backupInfo?.device.name}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div
          style={{
            width: 200,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {QUERY_GROUPS.map((group) => (
            <div key={group.id}>
              {/* Group header */}
              <div
                onClick={() => toggleGroup(group.id)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  userSelect: 'none',
                  borderBottom: '1px solid var(--border-light)',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = '')}
              >
                <span>{group.icon}</span>
                <span style={{ flex: 1 }}>{group.label}</span>
                <span style={{ fontSize: 9 }}>{expandedGroups.has(group.id) ? '▼' : '▶'}</span>
              </div>

              {/* Query items */}
              {expandedGroups.has(group.id) &&
                group.queries.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => handleSelectQuery(q.id, q.sql, q.filePattern)}
                    title={q.description}
                    style={{
                      padding: '7px 12px 7px 28px',
                      cursor: 'pointer',
                      fontSize: 12,
                      background:
                        activeQueryId === q.id ? 'var(--bg-active)' : undefined,
                      borderLeft:
                        activeQueryId === q.id
                          ? '3px solid var(--accent)'
                          : '3px solid transparent',
                      color:
                        activeQueryId === q.id ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                    onMouseOver={(e) => {
                      if (activeQueryId !== q.id)
                        e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseOut={(e) => {
                      if (activeQueryId !== q.id) e.currentTarget.style.background = '';
                    }}
                  >
                    {q.label}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Query Bar */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={(e) => handleSqlChange(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                rows={3}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  padding: '6px 8px',
                  background: 'var(--bg-primary)',
                  border: `1px solid ${isCustom ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {isCustom && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    fontSize: 10,
                    background: 'var(--accent)',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: 3,
                  }}
                >
                  custom
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                className="btn"
                onClick={handleRunBar}
                disabled={isRunning}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 16px',
                  fontWeight: 600,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {isRunning ? '...' : '▶ Run'}
              </button>

              {/* History dropdown */}
              <div style={{ position: 'relative' }} ref={historyRef}>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowHistory((v) => !v)}
                  title="Query history"
                >
                  History {history.length > 0 ? `(${history.length})` : ''}
                </button>
                {showHistory && history.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      width: 480,
                      maxHeight: 320,
                      overflowY: 'auto',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      zIndex: 100,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    }}
                  >
                    {history.map((h, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setSql(h);
                          setIsCustom(true);
                          setActiveQueryId(null);
                          setShowHistory(false);
                          textareaRef.current?.focus();
                        }}
                        style={{
                          padding: '6px 10px',
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--text-secondary)',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseOut={(e) => (e.currentTarget.style.background = '')}
                        title={h}
                      >
                        {h.replace(/\s+/g, ' ').slice(0, 120)}
                      </div>
                    ))}
                    <div
                      onClick={() => {
                        setHistory([]);
                        saveHistory([]);
                        setShowHistory(false);
                      }}
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: 'var(--danger)',
                        textAlign: 'center',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = '')}
                    >
                      Clear history
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--danger-bg, #3a0000)',
                borderBottom: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {isRunning ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}
              >
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                <span style={{ fontSize: 13 }}>Running query...</span>
              </div>
            ) : results ? (
              <DataGrid
                data={results}
                onSort={() => {}}
                onRowClick={() => {}}
              />
            ) : !error ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 32 }}>⚡</span>
                <span>Select a dataset from the sidebar or write a query</span>
                <span style={{ fontSize: 11 }}>Ctrl+Enter to run</span>
              </div>
            ) : null}
          </div>

          {/* Status bar */}
          <div
            style={{
              padding: '4px 12px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            {results && (
              <>
                <span>{rowCount.toLocaleString()} rows</span>
                {durationMs !== null && <span>{durationMs}ms</span>}
              </>
            )}
            <span style={{ flex: 1 }} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 400,
                direction: 'rtl',
                textAlign: 'left',
              }}
            >
              {backupInfo?.path}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
