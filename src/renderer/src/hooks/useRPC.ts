import { useCallback } from 'react';
import { useAppStore } from '../store';
import type { BackupInfo, DatabaseInfo, TableData, FileTreeNode } from '../types';

export function useRPC() {
  const store = useAppStore();

  const openBackup = useCallback(async (path: string, password?: string) => {
    store.setIsLoading(true);
    store.setError(null);
    try {
      const info = (await window.api.rpc('backup.open', { path, password })) as BackupInfo;
      store.setBackupInfo(info);

      await window.api.addRecentBackup({
        path: info.path,
        deviceName: info.device.name,
        date: info.device.last_backup_date,
        model: info.device.model,
      });

      // Navigate to dashboard immediately so user sees progress
      store.setScreen('dashboard');

      // Load databases and file tree in parallel — don't let one failure block the other
      const [dbResult, treeResult] = await Promise.allSettled([
        window.api.rpc('backup.getDatabases') as Promise<{ databases: DatabaseInfo[] }>,
        window.api.rpc('backup.getFileTree') as Promise<{ tree: FileTreeNode[] }>,
      ]);

      if (dbResult.status === 'fulfilled') {
        store.setDatabases(dbResult.value.databases);
      } else {
        store.setError(`Database discovery failed: ${dbResult.reason}`);
      }

      if (treeResult.status === 'fulfilled') {
        store.setFileTree(treeResult.value.tree);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only prompt for password if we didn't already provide one and the
      // error is specifically the "password required" message from the sidecar
      if (!password && msg.includes('password required')) {
        store.setShowPasswordModal(true, path);
      } else {
        store.setError(msg);
      }
    } finally {
      store.setIsLoading(false);
    }
  }, [store]);

  const loadTableData = useCallback(
    async (
      fileId: string,
      table: string,
      offset = 0,
      limit = 100,
      orderBy?: string,
      orderDir?: 'ASC' | 'DESC'
    ) => {
      store.setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.getTableData', {
          fileId,
          table,
          offset,
          limit,
          orderBy,
          orderDir,
        })) as TableData;
        store.setTableData(data);
      } catch (err: unknown) {
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        store.setIsLoading(false);
      }
    },
    [store]
  );

  const searchTable = useCallback(
    async (fileId: string, table: string, query: string, columns?: string[]) => {
      store.setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.searchTable', {
          fileId,
          table,
          query,
          columns,
        })) as TableData;
        store.setTableData(data);
      } catch (err: unknown) {
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        store.setIsLoading(false);
      }
    },
    [store]
  );

  const searchGlobal = useCallback(
    async (query: string) => {
      store.setIsSearching(true);
      store.setGlobalSearchQuery(query);
      try {
        const result = (await window.api.rpc('backup.searchGlobal', { query })) as {
          results: Array<{
            database: string;
            fileId: string;
            table: string;
            matchColumn: string;
            matchValue: string;
            row: Record<string, unknown>;
          }>;
        };
        store.setGlobalSearchResults(result.results);
        store.setScreen('search');
      } catch (err: unknown) {
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        store.setIsSearching(false);
      }
    },
    [store]
  );

  const executeSQL = useCallback(
    async (fileId: string, sql: string) => {
      store.setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.executeSQL', { fileId, sql })) as TableData;
        store.setTableData(data);
        return data;
      } catch (err: unknown) {
        store.setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        store.setIsLoading(false);
      }
    },
    [store]
  );

  const exportTable = useCallback(
    async (fileId: string, table: string, format: string, outputDir: string) => {
      const result = (await window.api.rpc('backup.exportTable', {
        fileId,
        table,
        format,
        outputDir,
      })) as { path: string };
      return result;
    },
    []
  );

  const getDeletedRecords = useCallback(
    async (fileId: string, table: string) => {
      store.setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.getDeletedRecords', {
          fileId,
          table,
        })) as TableData;
        return data;
      } catch (err: unknown) {
        store.setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        store.setIsLoading(false);
      }
    },
    [store]
  );

  const getFileContent = useCallback(async (fileId: string) => {
    return window.api.rpc('backup.getFileContent', { fileId });
  }, []);

  const getPlistContent = useCallback(async (fileId: string) => {
    return window.api.rpc('backup.getPlistContent', { fileId });
  }, []);

  return {
    openBackup,
    loadTableData,
    searchTable,
    searchGlobal,
    executeSQL,
    exportTable,
    getDeletedRecords,
    getFileContent,
    getPlistContent,
  };
}
