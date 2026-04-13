import { useCallback, useMemo, useState } from 'react';
import type { ColumnInfo, CellValue, TableData } from '../types';
import { formatTimestamp, formatPhoneNumber, formatBytes, truncate } from '../utils/format';

interface DataGridProps {
  data: TableData;
  onSort: (column: string, dir: 'ASC' | 'DESC') => void;
  onRowClick: (row: Record<string, unknown>) => void;
  deletedRows?: CellValue[][];
  showDeleted?: boolean;
}

export function DataGrid({ data, onSort, onRowClick, deletedRows, showDeleted }: DataGridProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  const handleSort = (colName: string) => {
    const newDir = sortCol === colName && sortDir === 'ASC' ? 'DESC' : 'ASC';
    setSortCol(colName);
    setSortDir(newDir);
    onSort(colName, newDir);
  };

  const allRows = useMemo(() => {
    const rows: Array<{ values: CellValue[]; isDeleted: boolean }> = (data.rows || []).map((r) => ({
      values: r,
      isDeleted: false,
    }));
    if (showDeleted && deletedRows) {
      deletedRows.forEach((r) => rows.push({ values: r, isDeleted: true }));
    }
    return rows;
  }, [data.rows, deletedRows, showDeleted]);

  const columns = data.columns || [];
  const columnTypes = data.columnTypes || [];

  const handleRowClick = useCallback(
    (row: CellValue[]) => {
      const record: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        record[col.name] = i < row.length ? row[i] : null;
      });
      onRowClick(record);
    },
    [columns, onRowClick]
  );

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.name}
                onClick={() => handleSort(col.name)}
                style={{
                  position: 'sticky',
                  top: 0,
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  fontSize: 11,
                  userSelect: 'none',
                  zIndex: 1,
                }}
              >
                <span>{col.name}</span>
                <span style={{ marginLeft: 4, fontSize: 10 }}>
                  {columnTypes[i] || col.type}
                </span>
                {sortCol === col.name && (
                  <span style={{ marginLeft: 4 }}>{sortDir === 'ASC' ? '▲' : '▼'}</span>
                )}
                {col.pk && (
                  <span style={{ marginLeft: 4, fontSize: 10 }}>PK</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row, ri) => (
            <tr
              key={ri}
              onClick={() => handleRowClick(row.values)}
              style={{
                cursor: 'pointer',
                background: row.isDeleted ? 'var(--deleted-bg)' : undefined,
                borderLeft: row.isDeleted ? '3px solid var(--danger)' : '3px solid transparent',
              }}
              onMouseOver={(e) => {
                if (!row.isDeleted) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = row.isDeleted ? 'var(--deleted-bg)' : '';
              }}
            >
              {columns.map((_col, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '4px 10px',
                    borderBottom: '1px solid var(--border-light)',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <SafeCellRenderer
                    value={ci < row.values.length ? row.values[ci] : null}
                    colType={ci < columnTypes.length ? columnTypes[ci] : 'text'}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {allRows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          No data
        </div>
      )}
    </div>
  );
}

function SafeCellRenderer({ value, colType }: { value: unknown; colType: string }) {
  try {
    return <CellRenderer value={value} colType={colType} />;
  } catch {
    return <span>[render error]</span>;
  }
}

function CellRenderer({ value, colType }: { value: unknown; colType: string }) {
  if (value === null || value === undefined) {
    return <span style={{ fontStyle: 'italic' }}>NULL</span>;
  }

  // Handle typed objects from the sidecar (blob, image, plist)
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const type = obj._type;

    if (type === 'blob') {
      const size = typeof obj.size === 'number' ? obj.size : 0;
      return <span>BLOB ({formatBytes(size)})</span>;
    }

    if (type === 'image') {
      const fmt = typeof obj.format === 'string' ? obj.format.toUpperCase() : 'IMG';
      const size = typeof obj.size === 'number' ? obj.size : 0;
      return <span>[{fmt} image, {formatBytes(size)}]</span>;
    }

    if (type === 'plist') {
      return <span>[Plist data]</span>;
    }

    if (type === 'data') {
      return <span>[Binary data]</span>;
    }

    // Unknown object — stringify safely
    try {
      const s = JSON.stringify(obj);
      return <span>{truncate(s, 80)}</span>;
    } catch {
      return <span>[Object]</span>;
    }
  }

  if (Array.isArray(value)) {
    return <span>[Array: {value.length} items]</span>;
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'true' : 'false'}</span>;
  }

  if (colType === 'timestamp' && typeof value === 'number') {
    return <span title={String(value)}>{formatTimestamp(value)}</span>;
  }

  if (colType === 'phone' && typeof value === 'string') {
    return <span>{formatPhoneNumber(value)}</span>;
  }

  if (typeof value === 'string') {
    return <span title={value.length > 50 ? value : undefined}>{truncate(value, 80)}</span>;
  }

  if (typeof value === 'number') {
    return <span>{value}</span>;
  }

  // Final fallback — force to string safely
  try {
    return <span>{String(value)}</span>;
  } catch {
    return <span>[unknown]</span>;
  }
}
