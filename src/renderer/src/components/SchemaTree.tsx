import { useState } from 'react';
import type { DatabaseInfo, TableInfo } from '../types';
import { formatNumber } from '../utils/format';

interface SchemaTreeProps {
  database: DatabaseInfo;
  selectedTable: string | null;
  onSelectTable: (table: string) => void;
  onCopySQL: (sql: string) => void;
}

export function SchemaTree({ database, selectedTable, onSelectTable, onCopySQL }: SchemaTreeProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleExpand = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const tables = database.tables.filter((t) => t.type === 'table');
  const views = database.tables.filter((t) => t.type === 'view');

  return (
    <div style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
      <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Tables ({tables.length})
      </div>
      {tables.map((table) => (
        <TableNode
          key={table.name}
          table={table}
          isSelected={selectedTable === table.name}
          isExpanded={expandedTables.has(table.name)}
          onSelect={() => onSelectTable(table.name)}
          onToggle={(e) => toggleExpand(table.name, e)}
          onCopySQL={onCopySQL}
        />
      ))}

      {views.length > 0 && (
        <>
          <div style={{ padding: '12px 12px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Views ({views.length})
          </div>
          {views.map((view) => (
            <TableNode
              key={view.name}
              table={view}
              isSelected={selectedTable === view.name}
              isExpanded={expandedTables.has(view.name)}
              onSelect={() => onSelectTable(view.name)}
              onToggle={(e) => toggleExpand(view.name, e)}
              onCopySQL={onCopySQL}
            />
          ))}
        </>
      )}

      {database.indices.length > 0 && (
        <>
          <div style={{ padding: '12px 12px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Indices ({database.indices.length})
          </div>
          {database.indices.map((idx) => (
            <div
              key={idx.name}
              style={{
                padding: '4px 12px 4px 24px',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
              }}
              title={idx.sql || ''}
              onClick={() => idx.sql && onCopySQL(idx.sql)}
            >
              {idx.name}
              <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 10 }}>
                on {idx.table}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function TableNode({
  table,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onCopySQL,
}: {
  table: TableInfo;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
  onCopySQL: (sql: string) => void;
}) {
  return (
    <div>
      <div
        onClick={onSelect}
        style={{
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          background: isSelected ? 'var(--bg-active)' : undefined,
          borderLeft: isSelected ? '2px solid var(--accent-bg)' : '2px solid transparent',
        }}
        onMouseOver={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseOut={(e) => {
          if (!isSelected) e.currentTarget.style.background = '';
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (table.sql) onCopySQL(table.sql);
        }}
      >
        <span
          onClick={onToggle}
          style={{ color: 'var(--text-muted)', fontSize: 10, width: 12, textAlign: 'center' }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        <span style={{ flex: 1 }}>{table.name}</span>
        {table.row_count >= 0 && (
          <span className="badge" style={{ fontSize: 10 }}>
            {formatNumber(table.row_count)}
          </span>
        )}
      </div>

      {isExpanded && (
        <div style={{ paddingLeft: 30 }}>
          {table.columns.map((col) => (
            <div
              key={col.name}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {col.pk && <span style={{ color: 'var(--warning)', fontSize: 9 }}>PK</span>}
              <span style={{ color: 'var(--text-primary)' }}>{col.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{col.type}</span>
              {col.notnull && <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>NOT NULL</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
