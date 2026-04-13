export interface DeviceInfo {
  name: string;
  model: string;
  ios_version: string;
  serial_number: string;
  imei: string;
  phone_number: string;
  last_backup_date: string;
  iccid: string;
}

export interface BackupStats {
  total_files: number;
  total_size: number;
  database_count: number;
}

export interface BackupInfo {
  path: string;
  is_encrypted: boolean;
  device: DeviceInfo;
  status: {
    is_full: boolean;
    snapshot_state: string;
    date: string;
  };
  stats: BackupStats;
}

export interface ColumnInfo {
  cid?: number;
  name: string;
  type: string;
  notnull?: boolean;
  default?: unknown;
  pk: boolean;
}

export interface TableInfo {
  name: string;
  type: string;
  sql: string;
  row_count: number;
  columns: ColumnInfo[];
}

export interface IndexInfo {
  name: string;
  table: string;
  sql: string;
}

export interface TriggerInfo {
  name: string;
  table: string;
  sql: string;
}

export interface DatabaseInfo {
  fileId: string;
  domain: string;
  relativePath: string;
  filename: string;
  label: string;
  category: string;
  size: number;
  tables: TableInfo[];
  indices: IndexInfo[];
  triggers: TriggerInfo[];
  total_rows: number;
  table_count: number;
}

export interface TableData {
  columns: ColumnInfo[];
  columnTypes: string[];
  rows: CellValue[][];
  total: number;
  offset: number;
  limit: number;
  duration_ms: number;
}

export type CellValue =
  | null
  | string
  | number
  | boolean
  | BlobCell
  | ImageCell
  | PlistCell;

export interface BlobCell {
  _type: 'blob';
  hex: string;
  size: number;
}

export interface ImageCell {
  _type: 'image';
  format: string;
  size: number;
  _preview?: boolean;
  data?: string; // base64
}

export interface PlistCell {
  _type: 'plist';
  data: unknown;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  fileId: string | null;
  size: number;
  domain: string;
  fileType: string;
  children: FileTreeNode[];
}

export interface GlobalSearchResult {
  database: string;
  fileId: string;
  table: string;
  matchColumn: string;
  matchValue: string;
  row: Record<string, unknown>;
}

export interface RecentBackup {
  path: string;
  deviceName: string;
  date: string;
  model: string;
}

export interface FileContent {
  type: 'database' | 'plist' | 'image' | 'json' | 'text' | 'binary';
  data?: unknown;
  format?: string;
  size: number;
  hex_preview?: string;
}

declare global {
  interface Window {
    api: {
      rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
      openFolder: () => Promise<string | null>;
      saveFile: (defaultPath: string) => Promise<string | null>;
      exportDir: () => Promise<string | null>;
      getRecentBackups: () => Promise<RecentBackup[]>;
      addRecentBackup: (backup: RecentBackup) => Promise<void>;
      getDefaultBackupPaths: () => Promise<string[]>;
      sidecarStatus: () => Promise<boolean>;
      sidecarRestart: () => Promise<boolean>;
      onMenuEvent: (event: string, callback: () => void) => () => void;
      platform: string;
    };
  }
}
