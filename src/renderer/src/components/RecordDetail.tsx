import { formatTimestamp, formatBytes } from '../utils/format';

interface RecordDetailProps {
  record: Record<string, unknown>;
  columnTypes: string[];
  columnNames: string[];
  onClose: () => void;
}

export function RecordDetail({ record, columnTypes, columnNames, onClose }: RecordDetailProps) {
  const copyAsJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
  };

  return (
    <div
      style={{
        width: 350,
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12 }}>Record Detail</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={copyAsJSON}>
            Copy JSON
          </button>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: 16, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', flex: 1, padding: 12 }}>
        {columnNames.map((name, i) => {
          const value = record[name];
          const colType = columnTypes[i] || 'text';

          return (
            <div key={name} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginBottom: 2,
                  fontWeight: 500,
                }}
              >
                {name}
                <span style={{ marginLeft: 6, fontSize: 10 }}>{colType}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                  padding: '4px 8px',
                  background: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                <DetailValue value={value} colType={colType} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailValue({ value, colType }: { value: unknown; colType: string }) {
  try {
    return <DetailValueInner value={value} colType={colType} />;
  } catch {
    return <span>[render error]</span>;
  }
}

function DetailValueInner({ value, colType }: { value: unknown; colType: string }) {
  if (value === null || value === undefined) {
    return <span style={{ fontStyle: 'italic' }}>NULL</span>;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const type = obj._type;

    if (type === 'blob') {
      const size = typeof obj.size === 'number' ? obj.size : 0;
      const hex = typeof obj.hex === 'string' ? obj.hex : '';
      return (
        <span>
          Binary data ({formatBytes(size)})
          {hex ? <div style={{ marginTop: 4, fontSize: 10 }}>{hex}</div> : null}
        </span>
      );
    }

    if (type === 'image') {
      const fmt = typeof obj.format === 'string' ? obj.format.toUpperCase() : 'IMG';
      const size = typeof obj.size === 'number' ? obj.size : 0;
      return <span>{fmt} image ({formatBytes(size)})</span>;
    }

    if (type === 'plist') {
      const size = typeof obj.size === 'number' ? obj.size : 0;
      return <span>Plist data ({formatBytes(size)})</span>;
    }

    try {
      return <span>{JSON.stringify(obj, null, 2)}</span>;
    } catch {
      return <span>[Object]</span>;
    }
  }

  if (Array.isArray(value)) {
    return <span>[Array: {value.length} items]</span>;
  }

  if (colType === 'timestamp' && typeof value === 'number') {
    return (
      <span>
        {formatTimestamp(value)}
        <span style={{ marginLeft: 8, fontSize: 10 }}>(raw: {value})</span>
      </span>
    );
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }

  try {
    return <span>{String(value)}</span>;
  } catch {
    return <span>[unknown]</span>;
  }
}
