import { useState, useCallback } from 'react';
import { useAppStore } from '../store';

export function PlistScreen() {
  const { plistData, plistFileId, setScreen, setPlistView } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const handleBack = () => {
    setPlistView(null, null);
    setScreen('dashboard');
  };

  const copyAsJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(plistData, null, 2));
  };

  const copyAsXML = () => {
    // Simple JSON-to-XML-ish conversion for display
    navigator.clipboard.writeText(JSON.stringify(plistData, null, 2));
  };

  if (!plistData) return null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '6px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-secondary)',
          fontSize: 12,
        }}
      >
        <button className="btn btn-sm" onClick={handleBack}>
          ← Back
        </button>
        <span style={{ fontWeight: 500 }}>Plist Viewer</span>
        {plistFileId && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {plistFileId.substring(0, 16)}...
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input
          className="input"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 200, fontSize: 12, padding: '3px 8px' }}
        />
        <button className="btn btn-sm" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? 'Tree' : 'Raw'}
        </button>
        <button className="btn btn-sm" onClick={copyAsJSON}>
          Copy JSON
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {showRaw ? (
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: 'var(--text-primary)',
            }}
          >
            {JSON.stringify(plistData, null, 2)}
          </pre>
        ) : (
          <PlistTree data={plistData} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  );
}

function PlistTree({ data, searchQuery, depth = 0 }: { data: unknown; searchQuery: string; depth?: number }) {
  if (data === null || data === undefined) {
    return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>;
  }

  if (typeof data === 'boolean') {
    return <span style={{ color: 'var(--accent)' }}>{data ? 'true' : 'false'}</span>;
  }

  if (typeof data === 'number') {
    return <span style={{ color: '#ffffff' }}>{data}</span>;
  }

  if (typeof data === 'string') {
    const matches = searchQuery && data.toLowerCase().includes(searchQuery.toLowerCase());
    return (
      <span
        style={{
          color: 'var(--success)',
          background: matches ? 'rgba(255, 255, 255, 0.1)' : undefined,
          borderRadius: 2,
          padding: matches ? '0 2px' : undefined,
        }}
      >
        "{data.length > 500 ? data.substring(0, 500) + '...' : data}"
      </span>
    );
  }

  if (typeof data === 'object' && '_type' in (data as Record<string, unknown>)) {
    const typed = data as { _type: string; [key: string]: unknown };
    if (typed._type === 'data') {
      return (
        <span style={{ color: 'var(--text-muted)' }}>
          &lt;data&gt; {typed.base64 ? String(typed.base64).substring(0, 40) + '...' : String(typed.hex || '').substring(0, 40) + '...'}
        </span>
      );
    }
  }

  if (Array.isArray(data)) {
    return <CollapsibleArray items={data} searchQuery={searchQuery} depth={depth} />;
  }

  if (typeof data === 'object') {
    return <CollapsibleDict entries={data as Record<string, unknown>} searchQuery={searchQuery} depth={depth} />;
  }

  return <span>{String(data)}</span>;
}

function CollapsibleDict({ entries, searchQuery, depth }: { entries: Record<string, unknown>; searchQuery: string; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const keys = Object.keys(entries);

  return (
    <div>
      <span
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}
      >
        {expanded ? '▼' : '▶'} {'{'}
        {!expanded && <span> {keys.length} keys {'}'}</span>}
      </span>
      {expanded && (
        <div style={{ paddingLeft: 20, borderLeft: '1px solid var(--border-light)', marginLeft: 4 }}>
          {keys.map((key) => {
            const matches = searchQuery && key.toLowerCase().includes(searchQuery.toLowerCase());
            return (
              <div key={key} style={{ marginBottom: 2 }}>
                <span
                  style={{
                    color: '#ffffff',
                    fontWeight: 500,
                    background: matches ? 'rgba(255, 255, 255, 0.1)' : undefined,
                    borderRadius: 2,
                    padding: matches ? '0 2px' : undefined,
                  }}
                >
                  {key}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>: </span>
                <PlistTree data={entries[key]} searchQuery={searchQuery} depth={depth + 1} />
              </div>
            );
          })}
        </div>
      )}
      {expanded && <span style={{ color: 'var(--text-muted)' }}>{'}'}</span>}
    </div>
  );
}

function CollapsibleArray({ items, searchQuery, depth }: { items: unknown[]; searchQuery: string; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  return (
    <div>
      <span
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}
      >
        {expanded ? '▼' : '▶'} {'['}
        {!expanded && <span> {items.length} items {']'}</span>}
      </span>
      {expanded && (
        <div style={{ paddingLeft: 20, borderLeft: '1px solid var(--border-light)', marginLeft: 4 }}>
          {items.map((item, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>{i}</span>
              <PlistTree data={item} searchQuery={searchQuery} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
      {expanded && <span style={{ color: 'var(--text-muted)' }}>{']'}</span>}
    </div>
  );
}
