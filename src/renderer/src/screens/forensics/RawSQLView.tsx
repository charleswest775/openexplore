import { useState, useCallback } from 'react';
import { useAppStore } from '../../store';
import { DataGrid } from '../../components/DataGrid';
import type { TableData } from '../../types';

export function RawSQLView() {
  const { databases } = useAppStore();
  const [sql, setSql] = useState('SELECT * FROM sqlite_master WHERE type = \'table\' ORDER BY name');
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [results, setResults] = useState<TableData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const effectiveFileId = selectedFileId || databases[0]?.fileId || '';

  const runSQL = useCallback(async () => {
    if (!sql.trim() || !effectiveFileId) return;
    setIsRunning(true);
    setError(null);
    const t0 = performance.now();
    try {
      const data = (await window.api.rpc('backup.executeSQL', {
        fileId: effectiveFileId,
        sql,
      })) as TableData;
      setResults(data);
      setDurationMs(Math.round(performance.now() - t0));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setIsRunning(false);
    }
  }, [sql, effectiveFileId]);

  const rowCount = results?.total ?? results?.rows?.length ?? 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* DB selector + editor */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="input"
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            style={{ fontSize: 12, padding: '3px 6px', flex: 1, maxWidth: 380 }}
          >
            {databases.map((db) => (
              <option key={db.fileId} value={db.fileId}>
                {db.label} ({db.filename})
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {databases.length} databases available
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                runSQL();
              }
            }}
            spellCheck={false}
            rows={4}
            style={{
              flex: 1,
              resize: 'vertical',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '6px 8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="btn"
              onClick={runSQL}
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
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
              Ctrl+Enter
            </span>
          </div>
        </div>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isRunning ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            <span>Running...</span>
          </div>
        ) : results ? (
          <>
            <DataGrid data={results} onSort={() => {}} onRowClick={() => {}} />
            <div
              style={{
                padding: '4px 12px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: 11,
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              {rowCount.toLocaleString()} rows{durationMs !== null ? ` · ${durationMs}ms` : ''}
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 28 }}>🗄️</span>
            <span>Write SQL above and press Run</span>
          </div>
        )}
      </div>
    </div>
  );
}
