import { useEffect, useCallback, useState } from 'react';
import { useAppStore } from '../store';
import { useRPC } from '../hooks/useRPC';
import { truncate } from '../utils/format';
import type { GlobalSearchResult, DatabaseInfo } from '../types';

export function SearchScreen() {
  const {
    globalSearchQuery,
    globalSearchResults,
    isSearching,
    databases,
    setScreen,
    setSelectedDatabase,
    setSelectedTable,
    setGlobalSearchQuery,
  } = useAppStore();

  const { searchGlobal } = useRPC();
  const [query, setQuery] = useState(globalSearchQuery);

  useEffect(() => {
    if (globalSearchQuery && globalSearchResults.length === 0 && !isSearching) {
      searchGlobal(globalSearchQuery);
    }
  }, [globalSearchQuery]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        searchGlobal(query.trim());
      }
    },
    [query, searchGlobal]
  );

  const handleResultClick = (result: GlobalSearchResult) => {
    const db = databases.find((d) => d.fileId === result.fileId);
    if (db) {
      setSelectedDatabase(db);
      setSelectedTable(result.table);
      setScreen('explorer');
    }
  };

  // Group results by database -> table
  const grouped = globalSearchResults.reduce<Record<string, Record<string, GlobalSearchResult[]>>>((acc, r) => {
    if (!acc[r.database]) acc[r.database] = {};
    if (!acc[r.database][r.table]) acc[r.database][r.table] = [];
    acc[r.database][r.table].push(r);
    return acc;
  }, {});

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

        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all databases..."
            style={{ flex: 1 }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={isSearching}>
            {isSearching ? <span className="spinner" /> : 'Search'}
          </button>
        </form>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {isSearching && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3, marginBottom: 12 }} />
            <div>Searching across all databases...</div>
          </div>
        )}

        {!isSearching && globalSearchResults.length === 0 && globalSearchQuery && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No results found for "{globalSearchQuery}"
          </div>
        )}

        {!isSearching && globalSearchResults.length > 0 && (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {globalSearchResults.length} results for "{globalSearchQuery}"
            </div>

            {Object.entries(grouped).map(([dbLabel, tables]) => (
              <div key={dbLabel} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {dbLabel}
                </h3>

                {Object.entries(tables).map(([tableName, results]) => (
                  <div key={tableName} style={{ marginBottom: 12, marginLeft: 12 }}>
                    <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {tableName} ({results.length})
                    </h4>

                    {results.map((result, i) => (
                      <button
                        key={i}
                        onClick={() => handleResultClick(result)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '8px 12px',
                          marginBottom: 2,
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      >
                        <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                          {result.matchColumn}:
                        </span>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: highlightMatch(result.matchValue, globalSearchQuery),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): string {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const truncated = truncate(text, 200);
  return truncated.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark style="background: rgba(255, 255, 255, 0.2); color: #ffffff; border-radius: 2px; padding: 0 2px;">$1</mark>'
  );
}
