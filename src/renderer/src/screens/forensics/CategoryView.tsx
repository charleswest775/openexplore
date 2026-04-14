/**
 * Generic category view used by Messages, Contacts, Calls, Notes, Safari.
 * Shows a DataGrid powered by a predefined SQL query, with a collapsible
 * QueryPanel at the bottom for debugging/modification.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store';
import { DataGrid } from '../../components/DataGrid';
import { QueryPanel } from '../../components/QueryPanel';
import type { TableData } from '../../types';
import type { PredefinedQuery } from '../../data/predefinedQueries';

interface CategoryViewProps {
  queries: PredefinedQuery[];
}

export function CategoryView({ queries }: CategoryViewProps) {
  const { databases } = useAppStore();

  const [activeQueryIdx, setActiveQueryIdx] = useState(0);
  const [sql, setSql] = useState(queries[0]?.sql ?? '');
  const [results, setResults] = useState<TableData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const activeQuery = queries[activeQueryIdx];

  /** Resolve fileId by matching filePattern against discovered databases */
  const fileId = useMemo(() => {
    if (!activeQuery) return null;
    const pat = activeQuery.filePattern.toLowerCase();
    const db = databases.find((d) => d.filename.toLowerCase().includes(pat));
    return db?.fileId ?? databases[0]?.fileId ?? null;
  }, [activeQuery, databases]);

  const runQuery = useCallback(
    async (sqlToRun: string, fid: string | null) => {
      if (!sqlToRun.trim() || !fid) {
        if (!fid) setError(`Database not found (looking for "${activeQuery?.filePattern}"). Is this backup open?`);
        return;
      }
      setIsRunning(true);
      setError(null);
      setColFilters({});
      const t0 = performance.now();
      try {
        const data = (await window.api.rpc('backup.executeSQL', {
          fileId: fid,
          sql: sqlToRun,
        })) as TableData;
        setResults(data);
        setDurationMs(Math.round(performance.now() - t0));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setResults(null);
      } finally {
        setIsRunning(false);
      }
    },
    [activeQuery]
  );

  // Auto-run when query tab changes
  useEffect(() => {
    if (activeQuery) {
      setSql(activeQuery.sql);
      runQuery(activeQuery.sql, fileId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueryIdx]);

  const handleRun = useCallback(() => {
    runQuery(sql, fileId);
  }, [sql, fileId, runQuery]);

  /** Client-side column filtering */
  const filteredResults = useMemo((): TableData | null => {
    if (!results) return null;
    const activeFilters = Object.entries(colFilters).filter(([, v]) => v.trim());
    if (activeFilters.length === 0) return results;

    const cols = results.columns.map((c) => c.name);
    const filtered = results.rows.filter((row) =>
      activeFilters.every(([colName, filterVal]) => {
        const ci = cols.indexOf(colName);
        if (ci < 0) return true;
        const cell = row[ci];
        if (cell === null || cell === undefined) return false;
        return String(cell).toLowerCase().includes(filterVal.toLowerCase());
      })
    );

    return {
      ...results,
      rows: filtered,
      total: filtered.length,
    };
  }, [results, colFilters]);

  const rowCount = filteredResults?.rows?.length ?? 0;

  if (queries.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No queries configured for this category.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-query tabs (if multiple queries in this category) */}
      {queries.length > 1 && (
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            flexShrink: 0,
          }}
        >
          {queries.map((q, i) => (
            <div
              key={q.id}
              onClick={() => setActiveQueryIdx(i)}
              title={q.description}
              style={{
                padding: '5px 14px',
                cursor: 'pointer',
                fontSize: 12,
                borderBottom: i === activeQueryIdx ? '2px solid var(--accent)' : '2px solid transparent',
                color: i === activeQueryIdx ? 'var(--accent)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={(e) => {
                if (i !== activeQueryIdx) e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseOut={(e) => {
                if (i !== activeQueryIdx) e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              {q.icon} {q.label}
            </div>
          ))}
        </div>
      )}

      {/* Column filter row */}
      {results && results.columns.length > 0 && (
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {results.columns.map((col) => (
            <input
              key={col.name}
              className="input"
              placeholder={col.name}
              value={colFilters[col.name] ?? ''}
              onChange={(e) =>
                setColFilters((prev) => ({ ...prev, [col.name]: e.target.value }))
              }
              style={{
                minWidth: 100,
                width: 140,
                fontSize: 11,
                padding: '3px 6px',
                border: 'none',
                borderRight: '1px solid var(--border-light)',
                borderRadius: 0,
                background: colFilters[col.name] ? 'var(--accent-bg, #1a2a3a)' : 'transparent',
              }}
            />
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isRunning ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            <span style={{ fontSize: 13 }}>Loading...</span>
          </div>
        ) : filteredResults ? (
          <DataGrid data={filteredResults} onSort={() => {}} onRowClick={() => {}} />
        ) : !error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading data...
          </div>
        ) : null}
      </div>

      {/* Query panel */}
      <QueryPanel
        sql={sql}
        onSqlChange={setSql}
        onRun={handleRun}
        isRunning={isRunning}
        error={error}
        durationMs={durationMs}
        rowCount={rowCount}
      />
    </div>
  );
}
