/**
 * QueryPanel — collapsible SQL panel shown at the bottom of Forensics views.
 * Displays the current underlying SQL, allows editing and re-running.
 */
import { useState, useCallback } from 'react';

interface QueryPanelProps {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  isRunning: boolean;
  error: string | null;
  durationMs: number | null;
  rowCount: number;
}

export function QueryPanel({
  sql,
  onSqlChange,
  onRun,
  isRunning,
  error,
  durationMs,
  rowCount,
}: QueryPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onRun();
      }
    },
    [onRun]
  );

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}
    >
      {/* Toggle bar */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: '5px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
          color: 'var(--text-muted)',
          userSelect: 'none',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
      >
        <span style={{ fontWeight: 600 }}>{expanded ? '▼' : '▶'} SQL Query</span>
        {!expanded && (
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {sql.replace(/\s+/g, ' ').slice(0, 120)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexShrink: 0 }}>
          {error && <span style={{ color: 'var(--danger)' }}>Error</span>}
          {!error && durationMs !== null && (
            <span>
              {rowCount.toLocaleString()} rows · {durationMs}ms
            </span>
          )}
        </span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: '0 12px 10px' }}>
          {error && (
            <div
              style={{
                padding: '6px 8px',
                marginBottom: 6,
                background: 'var(--danger-bg, #3a0000)',
                border: '1px solid var(--danger)',
                borderRadius: 4,
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              {error}
            </div>
          )}
          <textarea
            value={sql}
            onChange={(e) => onSqlChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={6}
            style={{
              width: '100%',
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
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={onRun}
              disabled={isRunning}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: '4px 14px',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {isRunning ? '...' : '▶ Run'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ctrl+Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}
