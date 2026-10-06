import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface WorkerState {
  process: ChildProcess | null;
  pid: number | null;
  startedAt: number | null;
  logs: string[];
}

const MAX_LOGS = 100;

// Preserve worker across Next.js API reloads
const globalForWorker = global as unknown as { __mipaWorkerState?: WorkerState };

if (!globalForWorker.__mipaWorkerState) {
  globalForWorker.__mipaWorkerState = {
    process: null,
    pid: null,
    startedAt: null,
    logs: [],
  };
}

const state = globalForWorker.__mipaWorkerState;

function addLog(line: string) {
  const clean = line.trim();
  if (!clean) return;
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  state.logs.push(`[${timestamp}] ${clean}`);
  if (state.logs.length > MAX_LOGS) {
    state.logs.shift();
  }
}

export function isWorkerRunning(): boolean {
  if (!state.process || !state.pid) return false;
  try {
    // Signal 0 tests if process exists
    process.kill(state.pid, 0);
    return true;
  } catch {
    state.process = null;
    state.pid = null;
    state.startedAt = null;
    return false;
  }
}

export function startWorkerProcess(): { success: boolean; message: string; pid?: number } {
  if (isWorkerRunning()) {
    return {
      success: true,
      message: `Worker đã đang chạy (PID: ${state.pid}).`,
      pid: state.pid!,
    };
  }

  try {
    const workerScript = path.join(process.cwd(), 'src', 'worker', 'index.ts');
    
    // Spawn tsx src/worker/index.ts
    const child = spawn('npx', ['tsx', workerScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':0',
      },
      detached: false,
    });

    state.process = child;
    state.pid = child.pid || null;
    state.startedAt = Date.now();
    addLog(`Đã khởi động Worker tự động (PID: ${state.pid})`);

    child.stdout?.on('data', (data) => {
      const text = data.toString('utf-8');
      text.split('\n').forEach(addLog);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString('utf-8');
      text.split('\n').forEach(addLog);
    });

    child.on('error', (err) => {
      addLog(`Lỗi tiến trình Worker: ${err.message}`);
      state.process = null;
      state.pid = null;
      state.startedAt = null;
    });

    child.on('exit', (code, signal) => {
      addLog(`Worker đã dừng (Mã thoát: ${code || signal})`);
      state.process = null;
      state.pid = null;
      state.startedAt = null;
    });

    return {
      success: true,
      message: `Đã khởi động Worker thành công (PID: ${state.pid}).`,
      pid: state.pid || undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Không thể khởi động Worker: ${err.message}`,
    };
  }
}

export function stopWorkerProcess(): { success: boolean; message: string } {
  if (!isWorkerRunning() || !state.pid) {
    return {
      success: true,
      message: 'Worker hiện đang không chạy.',
    };
  }

  try {
    const pid = state.pid;
    // Kill child process and sub-processes
    state.process?.kill('SIGTERM');
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}

    state.process = null;
    state.pid = null;
    state.startedAt = null;
    addLog(`Đã gửi lệnh dừng Worker (PID: ${pid})`);

    return {
      success: true,
      message: 'Đã dừng Worker thành công.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khi dừng Worker: ${err.message}`,
    };
  }
}

export function getWorkerProcessStatus() {
  const running = isWorkerRunning();
  const uptimeSeconds = running && state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;

  return {
    isRunning: running,
    pid: running ? state.pid : null,
    uptimeSeconds,
    logs: state.logs.slice(-30), // Latest 30 log lines
  };
}
