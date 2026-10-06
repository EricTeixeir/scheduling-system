import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { REPO_ROOT } from './config';
import { ApiClient } from './http';

const COMMAND_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 1_000;

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function dockerCompose(args: readonly string[], input?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...args], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input ?? '');
  });
}

export async function restartService(service: 'api' | 'db'): Promise<void> {
  const result = await dockerCompose(['restart', service]);
  if (result.exitCode !== 0) {
    throw new Error(`docker compose restart ${service} failed: ${result.stderr.trim()}`);
  }
}

export async function waitUntilReady(): Promise<void> {
  const probe = new ApiClient();
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await probe.request('GET', '/api/health/ready', { retryOnRateLimit: false });
      if (response.status === 200) return;
      last = `HTTP ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(READY_POLL_MS);
  }
  throw new Error(`stack not ready after ${String(READY_TIMEOUT_MS)} ms (last: ${last})`);
}

export function runSqlInDatabase(sql: string): Promise<CommandResult> {
  return dockerCompose(
    [
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    sql,
  );
}
