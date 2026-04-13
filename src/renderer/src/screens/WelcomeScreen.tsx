import { useEffect, useState } from 'react';
import { useRPC } from '../hooks/useRPC';
import type { RecentBackup } from '../types';

export function WelcomeScreen() {
  const { openBackup } = useRPC();
  const [recentBackups, setRecentBackups] = useState<RecentBackup[]>([]);

  useEffect(() => {
    window.api.getRecentBackups().then(setRecentBackups);
  }, []);

  const handleOpenFolder = async () => {
    const path = await window.api.openFolder();
    if (path) openBackup(path);
  };

  const handleAutoDetect = async () => {
    const paths = await window.api.getDefaultBackupPaths();
    if (paths.length > 0) {
      // Try to open the first path that exists
      for (const p of paths) {
        try {
          // List subdirectories in the backup location
          // This will be handled by trying to open - if it fails, we show the folder picker
          openBackup(p);
          return;
        } catch {
          continue;
        }
      }
    }
    handleOpenFolder();
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>OpenExplore</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 14 }}>
          Browse, search, and analyze iPhone backup databases
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
          <button className="btn btn-primary" onClick={handleOpenFolder} style={{ padding: '10px 24px', fontSize: 14 }}>
            Open Backup
          </button>
          <button className="btn" onClick={handleAutoDetect} style={{ padding: '10px 24px', fontSize: 14 }}>
            Auto-Detect
          </button>
        </div>

        {recentBackups.length > 0 && (
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recent Backups
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentBackups.map((backup, i) => (
                <button
                  key={i}
                  onClick={() => openBackup(backup.path)}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                >
                  <div style={{ fontSize: 20 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{backup.deviceName || 'Unknown Device'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {backup.model} &middot; {backup.date || 'Unknown date'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 40, fontSize: 11, color: 'var(--text-muted)' }}>
          {window.api.platform === 'darwin' && 'Default: ~/Library/Application Support/MobileSync/Backup/'}
          {window.api.platform === 'win32' && 'Default: %APPDATA%\\Apple Computer\\MobileSync\\Backup\\'}
          {window.api.platform === 'linux' && 'Manually select your backup folder'}
        </div>
      </div>
    </div>
  );
}
