interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        background: 'rgba(255, 107, 107, 0.18)',
        borderBottom: '2px solid rgba(255, 107, 107, 0.5)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{ color: '#ffffff', fontSize: 16, padding: '0 4px' }}
      >
        ×
      </button>
    </div>
  );
}
