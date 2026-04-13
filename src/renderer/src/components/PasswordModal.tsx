import { useState } from 'react';

interface PasswordModalProps {
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordModal({ onSubmit, onCancel }: PasswordModalProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          width: 400,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h3 style={{ marginBottom: 8, fontSize: 16 }}>Encrypted Backup</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
          This backup is encrypted. Enter the backup password to decrypt.
        </p>
        <input
          type="password"
          className="input"
          placeholder="Backup password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{ width: '100%', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!password}>
            Decrypt
          </button>
        </div>
      </form>
    </div>
  );
}
