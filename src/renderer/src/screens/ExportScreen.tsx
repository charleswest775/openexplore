import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { useRPC } from '../hooks/useRPC';
import { formatNumber, formatBytes } from '../utils/format';

export function ExportScreen() {
  const { databases, setScreen } = useAppStore();
  const { exportTable } = useRPC();
  const [selections, setSelections] = useState<
    Map<string, { fileId: string; table: string; format: string; label: string }>
  >(new Map());
  const [outputDir, setOutputDir] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exported, setExported] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const toggleSelection = (key: string, fileId: string, table: string, label: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { fileId, table, format: 'csv', label });
      }
      return next;
    });
  };

  const setFormat = (key: string, format: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const item = next.get(key);
      if (item) next.set(key, { ...item, format });
      return next;
    });
  };

  const selectOutputDir = async () => {
    const dir = await window.api.exportDir();
    if (dir) setOutputDir(dir);
  };

  const handleExport = useCallback(async () => {
    if (!outputDir || selections.size === 0) return;

    setIsExporting(true);
    setProgress(0);
    setExported([]);

    const items = Array.from(selections.values());
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const result = await exportTable(item.fileId, item.table, item.format, outputDir);
        setExported((prev) => [...prev, `${item.label} / ${item.table} -> ${item.format}`]);
      } catch (err) {
        setExported((prev) => [
          ...prev,
          `FAILED: ${item.label} / ${item.table}: ${err instanceof Error ? err.message : String(err)}`,
        ]);
      }
      setProgress(((i + 1) / items.length) * 100);
    }

    setIsExporting(false);
  }, [outputDir, selections, exportTable]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--bg-secondary)',
        }}
      >
        <button className="btn btn-sm" onClick={() => setScreen('dashboard')}>
          ← Back
        </button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Export Manager</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {selections.size} table(s) selected
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Table selection */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {databases.map((db) => (
            <div key={db.fileId} style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {db.label}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                  {db.table_count} tables, {formatNumber(db.total_rows)} rows
                </span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 12 }}>
                {db.tables
                  .filter((t) => t.type === 'table')
                  .map((table) => {
                    const key = `${db.fileId}:${table.name}`;
                    const isSelected = selections.has(key);
                    const sel = selections.get(key);

                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: isSelected ? 'rgba(255, 255, 255, 0.06)' : undefined,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(key, db.fileId, table.name, db.label)}
                        />
                        <span style={{ flex: 1, fontSize: 12 }}>{table.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatNumber(table.row_count)} rows
                        </span>
                        {isSelected && (
                          <select
                            value={sel?.format || 'csv'}
                            onChange={(e) => setFormat(key, e.target.value)}
                            style={{
                              fontSize: 11,
                              padding: '2px 4px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <option value="csv">CSV</option>
                            <option value="json">JSON</option>
                            <option value="sqlite">SQLite</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* Export panel */}
        <div
          style={{
            width: 320,
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Output Directory
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                className="input"
                value={outputDir}
                readOnly
                placeholder="Select directory..."
                style={{ flex: 1, fontSize: 12 }}
              />
              <button className="btn btn-sm" onClick={selectOutputDir}>
                Browse
              </button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            Include deleted records (if available)
          </label>

          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isExporting || selections.size === 0 || !outputDir}
            style={{ width: '100%' }}
          >
            {isExporting ? (
              <>
                <span className="spinner" /> Exporting...
              </>
            ) : (
              `Export ${selections.size} table(s)`
            )}
          </button>

          {isExporting && (
            <div
              style={{
                height: 4,
                background: 'var(--border)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--accent-bg)',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          )}

          {exported.length > 0 && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                Results:
              </div>
              {exported.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: '2px 0',
                    color: line.startsWith('FAILED') ? 'var(--danger)' : 'var(--success)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
