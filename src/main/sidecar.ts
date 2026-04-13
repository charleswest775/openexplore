import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { app } from 'electron';
import * as readline from 'readline';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SidecarManager {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private rl: readline.Interface | null = null;
  private _running = false;

  start(): void {
    const pythonPath = this.findPython();
    const scriptPath = this.findScript();

    this.process = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    this._running = true;

    if (this.process.stdout) {
      this.rl = readline.createInterface({ input: this.process.stdout });
      this.rl.on('line', (line: string) => {
        this.handleResponse(line);
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        console.error('[sidecar stderr]', data.toString());
      });
    }

    this.process.on('exit', (code) => {
      console.log(`[sidecar] exited with code ${code}`);
      this._running = false;
      // Reject all pending requests
      for (const [id, req] of this.pending) {
        clearTimeout(req.timer);
        req.reject(new Error(`Sidecar exited with code ${code}`));
      }
      this.pending.clear();
    });

    this.process.on('error', (err) => {
      console.error('[sidecar] error:', err);
      this._running = false;
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.rl?.close();
    this.rl = null;
    this._running = false;
  }

  isRunning(): boolean {
    return this._running;
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Sidecar is not running');
    }

    const id = ++this.requestId;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout for method: ${method}`));
      }, 300000); // 5 minute timeout for large encrypted backups

      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin!.write(request + '\n');
    });
  }

  private handleResponse(line: string): void {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      console.warn('[sidecar] non-JSON output:', line);
      return;
    }

    const id = response.id;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (response.error) {
      pending.reject(new Error(response.error.message || 'RPC error'));
    } else {
      pending.resolve(response.result);
    }
  }

  private findPython(): string {
    if (app.isPackaged) {
      // In packaged app, use bundled PyInstaller executable
      const resourcePath = process.resourcesPath;
      const ext = process.platform === 'win32' ? '.exe' : '';
      return path.join(resourcePath, 'python-sidecar', `openexplore${ext}`);
    }

    // In development, use system Python
    const venvPython = process.platform === 'win32'
      ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : path.join(process.cwd(), '.venv', 'bin', 'python');

    return venvPython;
  }

  private findScript(): string {
    if (app.isPackaged) {
      return ''; // PyInstaller bundle doesn't need a script argument
    }
    return path.join(process.cwd(), 'python-sidecar', 'main.py');
  }
}
