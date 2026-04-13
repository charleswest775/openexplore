import { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { formatBytes, formatNumber } from '../utils/format';
import type { DatabaseInfo } from '../types';

type SortKey = 'size' | 'tables' | 'label';

export function DashboardScreen() {
  const {
    backupInfo,
    databases,
    isLoading,
    setSelectedDatabase,
    setSelectedTable,
    setScreen,
  } = useAppStore();

  const [sortBy, setSortBy] = useState<SortKey>('size');
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    let list = [...databases];

    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (db) =>
          db.label.toLowerCase().includes(q) ||
          db.filename.toLowerCase().includes(q) ||
          db.domain.toLowerCase().includes(q) ||
          db.tables.some((t) => t.name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'size') cmp = a.size - b.size;
      else if (sortBy === 'tables') cmp = a.table_count - b.table_count;
      else cmp = a.label.localeCompare(b.label);
      return sortDesc ? -cmp : cmp;
    });

    return list;
  }, [databases, sortBy, sortDesc, filter]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDesc(!sortDesc);
    else { setSortBy(key); setSortDesc(true); }
  };

  const openDatabase = (db: DatabaseInfo) => {
    setSelectedDatabase(db);
    const tables = db.tables.filter((t) => t.type === 'table');
    if (tables.length > 0) {
      setSelectedTable(tables[0].name);
    }
    setScreen('explorer');
  };

  if (!backupInfo) return null;

  const arrow = (key: SortKey) =>
    sortBy === key ? (sortDesc ? ' ▼' : ' ▲') : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {backupInfo.device.name || 'iPhone Backup'}
          </span>
          <span style={{ marginLeft: 12, fontSize: 12 }}>
            {backupInfo.device.model} &middot; iOS {backupInfo.device.ios_version}
          </span>
        </div>
        <input
          className="input"
          placeholder="Filter databases..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 240 }}
        />
        {isLoading ? (
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" /> Discovering databases...
          </span>
        ) : (
          <span style={{ fontSize: 12 }}>
            {filtered.length} database{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && databases.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <div>Scanning backup for databases...</div>
          <div style={{ fontSize: 12 }}>This may take a minute for encrypted backups</div>
        </div>
      )}

      {/* Database table */}
      {(databases.length > 0 || !isLoading) && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <Th onClick={() => handleSort('label')} width="45%">
                  Database{arrow('label')}
                </Th>
                <Th onClick={() => handleSort('tables')} width="12%" align="right">
                  Tables{arrow('tables')}
                </Th>
                <Th onClick={() => handleSort('size')} width="15%" align="right">
                  Size{arrow('size')}
                </Th>
                <Th width="28%">Domain</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((db) => (
                <tr
                  key={db.fileId}
                  onClick={() => openDatabase(db)}
                  style={{ cursor: 'pointer' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ fontWeight: 500 }}>
                      {db.label.length > 60 ? db.filename || db.label.split('/').pop() : db.label}
                    </div>
                    {db.filename && db.label !== db.filename && (
                      <div style={{ fontSize: 11, marginTop: 1 }}>{db.filename}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {db.table_count}
                  </td>
                  <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {formatBytes(db.size)}
                  </td>
                  <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>
                    {db.domain}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              {filter ? `No databases match "${filter}"` : 'No databases found in this backup'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children, onClick, width, align }: { children: React.ReactNode; onClick?: () => void; width?: string; align?: string }) {
  return (
    <th
      onClick={onClick}
      style={{
        position: 'sticky',
        top: 0,
        padding: '8px 16px',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border)',
        textAlign: (align || 'left') as 'left' | 'right',
        cursor: onClick ? 'pointer' : undefined,
        whiteSpace: 'nowrap',
        fontWeight: 600,
        fontSize: 12,
        width,
        userSelect: 'none',
      }}
    >
      {children}
    </th>
  );
}
