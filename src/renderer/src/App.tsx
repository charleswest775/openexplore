import { useEffect } from 'react';
import { useAppStore } from './store';
import { useRPC } from './hooks/useRPC';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ExplorerScreen } from './screens/ExplorerScreen';
import { SearchScreen } from './screens/SearchScreen';
import { PlistScreen } from './screens/PlistScreen';
import { ExportScreen } from './screens/ExportScreen';
import { ForensicsScreen } from './screens/ForensicsScreen';
import { PasswordModal } from './components/PasswordModal';
import { ErrorBanner } from './components/ErrorBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

export function App() {
  const { screen, isLoading, error, showPasswordModal, pendingBackupPath, setError, setShowPasswordModal } =
    useAppStore();
  const { openBackup } = useRPC();

  useEffect(() => {
    const cleanup = window.api.onMenuEvent('openBackup', async () => {
      const path = await window.api.openFolder();
      if (path) openBackup(path);
    });
    return cleanup;
  }, [openBackup]);

  const handlePasswordSubmit = (password: string) => {
    const path = pendingBackupPath;
    setShowPasswordModal(false);
    if (path) {
      openBackup(path, password);
    }
  };

  return (
    <ErrorBoundary>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {isLoading && <div className="loading-bar" />}
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {showPasswordModal && (
          <PasswordModal
            onSubmit={handlePasswordSubmit}
            onCancel={() => setShowPasswordModal(false)}
          />
        )}

        {screen === 'welcome' && <WelcomeScreen />}
        {screen === 'dashboard' && <DashboardScreen />}
        {screen === 'explorer' && (
          <ErrorBoundary>
            <ExplorerScreen />
          </ErrorBoundary>
        )}
        {screen === 'search' && <SearchScreen />}
        {screen === 'plist' && <PlistScreen />}
        {screen === 'export' && <ExportScreen />}
        {screen === 'forensics' && <ForensicsScreen />}
      </div>
    </ErrorBoundary>
  );
}
