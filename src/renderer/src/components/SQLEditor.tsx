import { useState, useCallback } from 'react';
import { useRPC } from '../hooks/useRPC';
import { useAppStore } from '../store';
import type { TableData } from '../types';

interface SQLEditorProps {
  fileId: string;
}

export function SQLEditor({ fileId }: SQLEditorProps) {
  const [sql, setSQL] = useState('');
  const [result, setResult] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { executeSQL } = useRPC();
  const { isLoading } = useAppStore();

  const handleExecute = useCallback(async () => {
    if (!sql.trim()) return;
    setError(null);
    setResult(null);
    try {
      const data = await executeSQL(fileId, sql.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sql, fileId, executeSQL]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        <textarea
          value={sql}
          onChange={(e) => setSQL(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM table_name LIMIT 100  (Ctrl+Enter to run)"
          style={{
            flex: 1,
            minHeight: 60,
            maxHeight: 200,
            padding: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExecute}
            disabled={isLoading || !sql.trim()}
          >
            {isLoading ? <span className="spinner" /> : 'Run'}
          </button>
          <button className="btn btn-sm" onClick={() => { setSQL(''); setResult(null); setError(null); }}>
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '4px 12px 8px', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ maxHeight: 200, overflow: 'auto', borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr>
                {result.columns.map((col) => (
                  <th
                    key={col.name}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                      position: 'sticky',
                      top: 0,
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: '3px 8px',
                        borderBottom: '1px solid var(--border-light)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cell === null ? (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              padding: '4px 8px',
              fontSize: 10,
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {result.total} rows returned in {result.duration_ms}ms
          </div>
        </div>
      )}
    </div>
  );
}
