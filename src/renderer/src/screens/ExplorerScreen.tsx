import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { useRPC } from '../hooks/useRPC';
import { DataGrid } from '../components/DataGrid';
import { SchemaTree } from '../components/SchemaTree';
import { RecordDetail } from '../components/RecordDetail';
import { SQLEditor } from '../components/SQLEditor';
import { formatNumber } from '../utils/format';
import type { CellValue } from '../types';

export function ExplorerScreen() {
  const {
    selectedDatabase,
    selectedTable,
    tableData,
    showRecordDetail,
    selectedRow,
    showSQLEditor,
    showDeletedRecords,
    isLoading,
    setSelectedTable,
    setSelectedRow,
    toggleRecordDetail,
    toggleSQLEditor,
    toggleDeletedRecords,
    setScreen,
    backupInfo,
  } = useAppStore();

  const { loadTableData, searchTable, getDeletedRecords, exportTable } = useRPC();
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [deletedRows, setDeletedRows] = useState<CellValue[][]>([]);
  const pageSize = 100;

  const db = selectedDatabase;

  // Auto-select first table if none selected
  useEffect(() => {
    if (db && !selectedTable) {
      const tables = db.tables.filter((t) => t.type === 'table');
      if (tables.length > 0) {
        setSelectedTable(tables[0].name);
      }
    }
  }, [db, selectedTable, setSelectedTable]);

  // Load table data when table selected
  useEffect(() => {
    if (db && selectedTable) {
      setCurrentPage(0);
      loadTableData(db.fileId, selectedTable, 0, pageSize);
    }
  }, [db, selectedTable, loadTableData]);

  // Load deleted records when toggled on
  useEffect(() => {
    if (showDeletedRecords && db && selectedTable) {
      getDeletedRecords(db.fileId, selectedTable).then((data) => {
        if (data) setDeletedRows(data.rows);
      });
    } else {
      setDeletedRows([]);
    }
  }, [showDeletedRecords, db, selectedTable, getDeletedRecords]);

  const handleSort = useCallback(
    (column: string, dir: 'ASC' | 'DESC') => {
      if (db && selectedTable) {
        loadTableData(db.fileId, selectedTable, 0, pageSize, column, dir);
        setCurrentPage(0);
      }
    },
    [db, selectedTable, loadTableData]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (db && selectedTable) {
        setCurrentPage(page);
        loadTableData(db.fileId, selectedTable, page * pageSize, pageSize);
      }
    },
    [db, selectedTable, loadTableData]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (db && selectedTable && tableSearchQuery.trim()) {
        searchTable(db.fileId, selectedTable, tableSearchQuery.trim());
      } else if (db && selectedTable) {
        loadTableData(db.fileId, selectedTable, 0, pageSize);
      }
    },
    [db, selectedTable, tableSearchQuery, searchTable, loadTableData]
  );

  const handleExport = useCallback(
    async (format: 'csv' | 'json' | 'sqlite') => {
      if (!db || !selectedTable) return;
      const dir = await window.api.exportDir();
      if (dir) {
        await exportTable(db.fileId, selectedTable, format, dir);
      }
    },
    [db, selectedTable, exportTable]
  );

  const handleCopySQL = useCallback((sql: string) => {
    navigator.clipboard.writeText(sql);
  }, []);

  if (!db) return null;

  const totalPages = tableData ? Math.ceil(tableData.total / pageSize) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '6px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          background: 'var(--bg-secondary)',
        }}
      >
        <button className="btn btn-sm" onClick={() => setScreen('dashboard')}>
          ← Back
        </button>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ fontWeight: 500 }}>{db.label}</span>
        {selectedTable && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--accent)' }}>{selectedTable}</span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {selectedTable && (
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 4 }}>
            <input
              className="input"
              placeholder="Search table..."
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              style={{ width: 200, fontSize: 12, padding: '3px 8px' }}
            />
          </form>
        )}

        <button
          className="btn btn-sm"
          onClick={toggleSQLEditor}
          style={showSQLEditor ? { background: 'var(--bg-active)', borderColor: 'var(--accent-bg)' } : {}}
        >
          SQL
        </button>
        <button
          className="btn btn-sm"
          onClick={toggleDeletedRecords}
          style={showDeletedRecords ? { background: 'var(--deleted-bg)', borderColor: 'var(--danger)' } : {}}
        >
          Deleted
        </button>

        {selectedTable && (
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn btn-sm" onClick={() => handleExport('csv')}>CSV</button>
            <button className="btn btn-sm" onClick={() => handleExport('json')}>JSON</button>
            <button className="btn btn-sm" onClick={() => handleExport('sqlite')}>SQLite</button>
          </div>
        )}
      </div>

      {/* SQL Editor pane */}
      {showSQLEditor && db && <SQLEditor fileId={db.fileId} />}

      {/* Three-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Schema */}
        <div
          style={{
            width: 250,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <SchemaTree
            database={db}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onCopySQL={handleCopySQL}
          />
        </div>

        {/* Center: Data Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tableData ? (
            <>
              <DataGrid
                data={tableData}
                onSort={handleSort}
                onRowClick={(row) => setSelectedRow(row)}
                deletedRows={deletedRows}
                showDeleted={showDeletedRecords}
              />

              {/* Pagination */}
              <div
                style={{
                  padding: '6px 12px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                }}
              >
                <span>
                  {formatNumber(tableData.total)} rows
                  {tableData.duration_ms !== undefined && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      ({tableData.duration_ms}ms)
                    </span>
                  )}
                  {showDeletedRecords && deletedRows.length > 0 && (
                    <span style={{ color: 'var(--danger)', marginLeft: 8 }}>
                      +{deletedRows.length} deleted
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    className="btn btn-sm"
                    disabled={currentPage === 0}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    ←
                  </button>
                  <span>
                    Page {currentPage + 1} of {Math.max(totalPages, 1)}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    →
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                  <div>Loading table data...</div>
                </>
              ) : (
                'Select a table to view data'
              )}
            </div>
          )}
        </div>

        {/* Right: Record Detail */}
        {showRecordDetail && selectedRow && tableData && (
          <RecordDetail
            record={selectedRow}
            columnTypes={tableData.columnTypes}
            columnNames={tableData.columns.map((c) => c.name)}
            onClose={() => toggleRecordDetail()}
          />
        )}
      </div>
    </div>
  );
}
