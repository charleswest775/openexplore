/**
 * Design 2: Split-Pane Query Workbench
 *
 * Layout:
 *   ┌────────────┬─────────────────────────────────────────────────┐
 *   │            │  [Tab1] [Tab2] [Tab3] [+]                       │
 *   │  Quick     ├─────────────────────────────────────────────────┤
 *   │  Datasets  │  SQL editor (resizable)               [▶ Run]   │
 *   │            ├────────────────── drag ──────────────────────── ┤
 *   │  ─────     │  Results table                                  │
 *   │  File tree │  Rows: N  ·  Xms                                │
 *   └────────────┴─────────────────────────────────────────────────┘
 */
import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store';
import { DataGrid } from '../components/DataGrid';
import { QUERY_GROUPS } from '../data/predefinedQueries';
import type { TableData } from '../types';

interface Tab {
  id: string;
  label: string;
  sql: string;
  results: TableData | null;
  error: string | null;
  isRunning: boolean;
  durationMs: number | null;
  fileId: string | null;
}

let tabCounter = 1;
function newTab(label = 'Query', sql = ''): Tab {
  return {
    id: String(tabCounter++),
    label,
    sql,
    results: null,
    error: null,
    isRunning: false,
    durationMs: null,
    fileId: null,
  };
}

const SPLIT_MIN = 80;
const SPLIT_DEFAULT = 200;

export function WorkbenchScreen() {
  const { databases, backupInfo, setScreen } = useAppStore();

  const [tabs, setTabs] = useState<Tab[]>([newTab('Query 1')]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [editorHeight, setEditorHeight] = useState(SPLIT_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingEditor = useRef(false);
  const isDraggingSidebar = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const findDb = useCallback(
    (filePattern: string) => {
      const pat = filePattern.toLowerCase();
      return databases.find((db) => db.filename.toLowerCase().includes(pat)) ?? null;
    },
    [databases]
  );

  const runSQL = useCallback(
    async (tabId: string, sql: string, fileId?: string | null) => {
      if (!sql.trim()) return;

      let targetFileId = fileId;
      if (!targetFileId) {
        const sorted = [...databases].sort((a, b) => b.size - a.size);
        targetFileId = sorted[0]?.fileId ?? null;
      }
      if (!targetFileId) {
        updateTab(tabId, { error: 'No database available. Open a backup first.' });
        return;
      }

      updateTab(tabId, { isRunning: true, error: null, fileId: targetFileId });
      const t0 = performance.now();
      try {
        const data = (await window.api.rpc('backup.executeSQL', {
          fileId: targetFileId,
          sql,
        })) as TableData;
        updateTab(tabId, {
          results: data,
          isRunning: false,
          durationMs: Math.round(performance.now() - t0),
        });
      } catch (err: unknown) {
        updateTab(tabId, {
          error: err instanceof Error ? err.message : String(err),
          results: null,
          isRunning: false,
        });
      }
    },
    [databases, updateTab]
  );

  const handleAddTab = useCallback(() => {
    const t = newTab(`Query ${tabCounter}`);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fresh = newTab('Query 1');
          setActiveTabId(fresh.id);
          return [fresh];
        }
        if (activeTabId === id) setActiveTabId(next[next.length - 1].id);
        return next;
      });
    },
    [activeTabId]
  );

  const handleLoadDataset = useCallback(
    (querySql: string, queryLabel: string, filePattern: string) => {
      const db = findDb(filePattern);
      const t = newTab(queryLabel, querySql);
      t.fileId = db?.fileId ?? null;
      setTabs((prev) => [...prev, t]);
      setActiveTabId(t.id);
      runSQL(t.id, querySql, db?.fileId);
    },
    [findDb, runSQL]
  );

  // Drag handlers for vertical split
  const startEditorDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingEditor.current = true;
    const startY = e.clientY;
    const startH = editorHeight;

    const onMove = (me: MouseEvent) => {
      if (!isDraggingEditor.current) return;
      const delta = me.clientY - startY;
      setEditorHeight(Math.max(SPLIT_MIN, startH + delta));
    };
    const onUp = () => {
      isDraggingEditor.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  // Drag handler for sidebar width
  const startSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;

    const onMove = (me: MouseEvent) => {
      if (!isDraggingSidebar.current) return;
      setSidebarWidth(Math.max(120, Math.min(320, startW + me.clientX - startX)));
    };
    const onUp = () => {
      isDraggingSidebar.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const rowCount = activeTab?.results?.total ?? activeTab?.results?.rows?.length ?? 0;

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '5px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <button className="btn btn-sm" onClick={() => setScreen('dashboard')}>
          ← Back
        </button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Workbench</span>
        <span style={{ color: 'var(--text-muted)', flex: 1 }}>{backupInfo?.device.name}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div
              style={{
                width: sidebarWidth,
                borderRight: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                overflowY: 'auto',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Sidebar header */}
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Quick Datasets</span>
                <button
                  className="btn btn-sm"
                  onClick={() => setSidebarCollapsed(true)}
                  style={{ fontSize: 10, padding: '1px 4px' }}
                  title="Collapse sidebar"
                >
                  ‹
                </button>
              </div>

              {QUERY_GROUPS.map((group) => (
                <div key={group.id}>
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    {group.icon} {group.label}
                  </div>
                  {group.queries.map((q) => (
                    <div
                      key={q.id}
                      onClick={() => handleLoadDataset(q.sql, q.label, q.filePattern)}
                      title={q.description}
                      style={{
                        padding: '6px 10px 6px 22px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = '')}
                    >
                      {q.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Sidebar resize handle */}
            <div
              onMouseDown={startSidebarDrag}
              style={{
                width: 4,
                cursor: 'col-resize',
                background: 'transparent',
                flexShrink: 0,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            />
          </>
        )}

        {sidebarCollapsed && (
          <button
            className="btn btn-sm"
            onClick={() => setSidebarCollapsed(false)}
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              writingMode: 'vertical-rl',
              padding: '8px 3px',
            }}
          >
            ›
          </button>
        )}

        {/* Right: tabs + editor + results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              overflowX: 'auto',
              flexShrink: 0,
            }}
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRight: '1px solid var(--border)',
                  background:
                    tab.id === activeTabId ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom:
                    tab.id === activeTabId ? '2px solid var(--accent)' : '2px solid transparent',
                  color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {tab.isRunning && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} />}
                {tab.error && <span style={{ color: 'var(--danger)', fontSize: 10 }}>✗</span>}
                <span>{tab.label}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                  style={{
                    marginLeft: 2,
                    fontSize: 11,
                    opacity: 0.5,
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = '0.5')}
                >
                  ×
                </span>
              </div>
            ))}
            <button
              className="btn btn-sm"
              onClick={handleAddTab}
              style={{ margin: '0 4px', padding: '3px 8px', fontSize: 14, lineHeight: 1 }}
              title="New tab"
            >
              +
            </button>
          </div>

          {/* Editor pane */}
          <div
            style={{
              height: editorHeight,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
            }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                key={activeTab?.id}
                value={activeTab?.sql ?? ''}
                onChange={(e) => updateTab(activeTab.id, { sql: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    runSQL(activeTab.id, activeTab.sql, activeTab.fileId);
                  }
                }}
                spellCheck={false}
                placeholder="-- Write SQL here, Ctrl+Enter to run"
                style={{
                  width: '100%',
                  height: '100%',
                  resize: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  padding: '8px 10px',
                  background: 'var(--bg-primary)',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Editor toolbar */}
            <div
              style={{
                padding: '4px 8px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-secondary)',
                fontSize: 11,
              }}
            >
              <button
                className="btn"
                onClick={() => runSQL(activeTab.id, activeTab.sql, activeTab.fileId)}
                disabled={activeTab?.isRunning}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  padding: '3px 12px',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {activeTab?.isRunning ? '...' : '▶ Run'}
              </button>
              <span style={{ color: 'var(--text-muted)' }}>Ctrl+Enter</span>
              <span style={{ flex: 1 }} />
              {activeTab?.durationMs !== null && activeTab?.results && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {rowCount.toLocaleString()} rows · {activeTab.durationMs}ms
                </span>
              )}
            </div>
          </div>

          {/* Drag handle for vertical split */}
          <div
            onMouseDown={startEditorDrag}
            style={{
              height: 5,
              cursor: 'row-resize',
              background: 'transparent',
              flexShrink: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          />

          {/* Results pane */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab?.error && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--danger-bg, #3a0000)',
                  borderBottom: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {activeTab.error}
              </div>
            )}

            {activeTab?.isRunning ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
                <span style={{ fontSize: 13 }}>Running...</span>
              </div>
            ) : activeTab?.results ? (
              <DataGrid
                data={activeTab.results}
                onSort={() => {}}
                onRowClick={() => {}}
              />
            ) : !activeTab?.error ? (
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
                <span style={{ fontSize: 32 }}>🗃️</span>
                <span>Select a dataset from the sidebar or write SQL above</span>
                <span style={{ fontSize: 11 }}>Ctrl+Enter or click Run to execute</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
