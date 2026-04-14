/**
 * Design 3: Forensics Investigation Panel
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Messages | Contacts | Calls | Notes | Safari | Raw SQL  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │                                                          │
 *   │  Category-specific data view (DataGrid)                  │
 *   │  Column filter inputs above each column                  │
 *   │                                                          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  ▶ SQL Query  [collapsible — shows/edits underlying SQL] │
 *   └──────────────────────────────────────────────────────────┘
 */
import { useState } from 'react';
import { useAppStore } from '../store';
import { QUERY_GROUPS } from '../data/predefinedQueries';
import { CategoryView } from './forensics/CategoryView';
import { RawSQLView } from './forensics/RawSQLView';

type CategoryId = string | 'raw';

const CATEGORIES: Array<{ id: CategoryId; label: string; icon: string }> = [
  ...QUERY_GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon })),
  { id: 'raw', label: 'Raw SQL', icon: '🗄️' },
];

export function ForensicsScreen() {
  const { backupInfo, setScreen } = useAppStore();
  const [activeCategory, setActiveCategory] = useState<CategoryId>(CATEGORIES[0].id);

  const activeGroup = QUERY_GROUPS.find((g) => g.id === activeCategory);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '5px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <button className="btn btn-sm" onClick={() => setScreen('dashboard')}>
          ← Back
        </button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Forensics</span>
        <span style={{ color: 'var(--text-muted)', flex: 1 }}>{backupInfo?.device.name}</span>
      </div>

      {/* Category tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid var(--border)',
          background: 'var(--bg-secondary)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              padding: '10px 18px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeCategory === cat.id ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              borderBottom:
                activeCategory === cat.id
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              marginBottom: -2,
              color: activeCategory === cat.id ? 'var(--accent)' : 'var(--text-primary)',
              background:
                activeCategory === cat.id ? 'var(--bg-active, var(--bg-primary))' : 'transparent',
              transition: 'color 0.1s',
            }}
            onMouseOver={(e) => {
              if (activeCategory !== cat.id)
                e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseOut={(e) => {
              if (activeCategory !== cat.id) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </div>
        ))}
      </div>

      {/* Active view */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeCategory === 'raw' ? (
          <RawSQLView />
        ) : activeGroup ? (
          <CategoryView key={activeCategory} queries={activeGroup.queries} />
        ) : null}
      </div>
    </div>
  );
}
