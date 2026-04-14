import { create } from 'zustand';
import type {
  BackupInfo,
  DatabaseInfo,
  FileTreeNode,
  TableData,
  GlobalSearchResult,
} from '../types';

type Screen = 'welcome' | 'dashboard' | 'explorer' | 'search' | 'plist' | 'export' | 'query';

interface AppState {
  // Navigation
  screen: Screen;
  setScreen: (screen: Screen) => void;

  // Backup
  backupInfo: BackupInfo | null;
  setBackupInfo: (info: BackupInfo | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Password modal
  showPasswordModal: boolean;
  pendingBackupPath: string | null;
  setShowPasswordModal: (show: boolean, path?: string | null) => void;

  // Databases
  databases: DatabaseInfo[];
  setDatabases: (dbs: DatabaseInfo[]) => void;

  // File tree
  fileTree: FileTreeNode[];
  setFileTree: (tree: FileTreeNode[]) => void;
  showFileTree: boolean;
  toggleFileTree: () => void;

  // Database Explorer
  selectedDatabase: DatabaseInfo | null;
  selectedTable: string | null;
  tableData: TableData | null;
  setSelectedDatabase: (db: DatabaseInfo | null) => void;
  setSelectedTable: (table: string | null) => void;
  setTableData: (data: TableData | null) => void;

  // Record detail
  selectedRow: Record<string, unknown> | null;
  showRecordDetail: boolean;
  setSelectedRow: (row: Record<string, unknown> | null) => void;
  toggleRecordDetail: () => void;

  // Search
  globalSearchQuery: string;
  globalSearchResults: GlobalSearchResult[];
  isSearching: boolean;
  setGlobalSearchQuery: (q: string) => void;
  setGlobalSearchResults: (results: GlobalSearchResult[]) => void;
  setIsSearching: (searching: boolean) => void;

  // SQL Editor
  showSQLEditor: boolean;
  toggleSQLEditor: () => void;

  // Deleted records
  showDeletedRecords: boolean;
  toggleDeletedRecords: () => void;

  // Plist viewer
  plistFileId: string | null;
  plistData: unknown;
  setPlistView: (fileId: string | null, data: unknown) => void;

  // Export
  exportSelections: Array<{ fileId: string; table: string; format: string }>;
  setExportSelections: (sel: Array<{ fileId: string; table: string; format: string }>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'welcome',
  setScreen: (screen) => set({ screen }),

  backupInfo: null,
  setBackupInfo: (backupInfo) => set({ backupInfo }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),

  showPasswordModal: false,
  pendingBackupPath: null,
  setShowPasswordModal: (show, path = null) =>
    set({ showPasswordModal: show, pendingBackupPath: path }),

  databases: [],
  setDatabases: (databases) => set({ databases }),

  fileTree: [],
  setFileTree: (fileTree) => set({ fileTree }),
  showFileTree: false,
  toggleFileTree: () => set((s) => ({ showFileTree: !s.showFileTree })),

  selectedDatabase: null,
  selectedTable: null,
  tableData: null,
  setSelectedDatabase: (db) => set({ selectedDatabase: db, selectedTable: null, tableData: null }),
  setSelectedTable: (table) => set({ selectedTable: table, tableData: null }),
  setTableData: (tableData) => set({ tableData }),

  selectedRow: null,
  showRecordDetail: false,
  setSelectedRow: (row) => set({ selectedRow: row, showRecordDetail: row !== null }),
  toggleRecordDetail: () => set((s) => ({ showRecordDetail: !s.showRecordDetail })),

  globalSearchQuery: '',
  globalSearchResults: [],
  isSearching: false,
  setGlobalSearchQuery: (q) => set({ globalSearchQuery: q }),
  setGlobalSearchResults: (results) => set({ globalSearchResults: results }),
  setIsSearching: (searching) => set({ isSearching: searching }),

  showSQLEditor: false,
  toggleSQLEditor: () => set((s) => ({ showSQLEditor: !s.showSQLEditor })),

  showDeletedRecords: false,
  toggleDeletedRecords: () => set((s) => ({ showDeletedRecords: !s.showDeletedRecords })),

  plistFileId: null,
  plistData: null,
  setPlistView: (fileId, data) => set({ plistFileId: fileId, plistData: data, screen: fileId ? 'plist' : 'dashboard' }),

  exportSelections: [],
  setExportSelections: (sel) => set({ exportSelections: sel }),
}));
