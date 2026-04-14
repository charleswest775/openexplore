import { useCallback } from 'react';
import { useAppStore } from '../store';
import type { BackupInfo, DatabaseInfo, TableData, FileTreeNode } from '../types';

export function useRPC() {
  // Select only the stable setter functions — not the whole store.
  // Zustand setters have stable references and won't cause re-renders.
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setError = useAppStore((s) => s.setError);
  const setBackupInfo = useAppStore((s) => s.setBackupInfo);
  const setDatabases = useAppStore((s) => s.setDatabases);
  const setFileTree = useAppStore((s) => s.setFileTree);
  const setTableData = useAppStore((s) => s.setTableData);
  const setScreen = useAppStore((s) => s.setScreen);
  const setShowPasswordModal = useAppStore((s) => s.setShowPasswordModal);
  const setIsSearching = useAppStore((s) => s.setIsSearching);
  const setGlobalSearchQuery = useAppStore((s) => s.setGlobalSearchQuery);
  const setGlobalSearchResults = useAppStore((s) => s.setGlobalSearchResults);

  const openBackup = useCallback(async (path: string, password?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const info = (await window.api.rpc('backup.open', { path, password })) as BackupInfo;
      setBackupInfo(info);

      await window.api.addRecentBackup({
        path: info.path,
        deviceName: info.device.name,
        date: info.device.last_backup_date,
        model: info.device.model,
      });

      // Navigate to dashboard immediately so user sees progress
      setScreen('dashboard');

      // Load databases and file tree in parallel — don't let one failure block the other
      const [dbResult, treeResult] = await Promise.allSettled([
        window.api.rpc('backup.getDatabases') as Promise<{ databases: DatabaseInfo[] }>,
        window.api.rpc('backup.getFileTree') as Promise<{ tree: FileTreeNode[] }>,
      ]);

      if (dbResult.status === 'fulfilled') {
        setDatabases(dbResult.value.databases);
      } else {
        setError(`Database discovery failed: ${dbResult.reason}`);
      }

      if (treeResult.status === 'fulfilled') {
        setFileTree(treeResult.value.tree);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only prompt for password if we didn't already provide one and the
      // error is specifically the "password required" message from the sidecar
      if (!password && msg.includes('password required')) {
        setShowPasswordModal(true, path);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, setBackupInfo, setScreen, setDatabases, setFileTree, setShowPasswordModal]);

  const loadTableData = useCallback(
    async (
      fileId: string,
      table: string,
      offset = 0,
      limit = 100,
      orderBy?: string,
      orderDir?: 'ASC' | 'DESC'
    ) => {
      setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.getTableData', {
          fileId,
          table,
          offset,
          limit,
          orderBy,
          orderDir,
        })) as TableData;
        setTableData(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setTableData, setError]
  );

  const searchTable = useCallback(
    async (fileId: string, table: string, query: string, columns?: string[]) => {
      setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.searchTable', {
          fileId,
          table,
          query,
          columns,
        })) as TableData;
        setTableData(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setTableData, setError]
  );

  const searchGlobal = useCallback(
    async (query: string) => {
      setIsSearching(true);
      setGlobalSearchQuery(query);
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
        setGlobalSearchResults(result.results);
        setScreen('search');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSearching(false);
      }
    },
    [setIsSearching, setGlobalSearchQuery, setGlobalSearchResults, setScreen, setError]
  );

  const executeSQL = useCallback(
    async (fileId: string, sql: string) => {
      setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.executeSQL', { fileId, sql })) as TableData;
        setTableData(data);
        return data;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setTableData, setError]
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
      setIsLoading(true);
      try {
        const data = (await window.api.rpc('backup.getDeletedRecords', {
          fileId,
          table,
        })) as TableData;
        return data;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setError]
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
