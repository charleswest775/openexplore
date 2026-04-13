const APPLE_EPOCH_OFFSET = 978307200;
const MIN_UNIX_TS = 946684800;
const MAX_UNIX_TS = 2208988800;
const MIN_APPLE_TS = 0;
const MAX_APPLE_TS = MAX_UNIX_TS - APPLE_EPOCH_OFFSET;

export function formatTimestamp(value: number): string {
  let date: Date;
  if (value > MIN_UNIX_TS && value < MAX_UNIX_TS) {
    date = new Date(value * 1000);
  } else if (value > MIN_APPLE_TS && value < MAX_APPLE_TS) {
    date = new Date((value + APPLE_EPOCH_OFFSET) * 1000);
  } else if (value > 1e12 && value < 2e15) {
    // Milliseconds
    date = new Date(value);
  } else {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}
