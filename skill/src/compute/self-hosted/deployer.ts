/**
 * Self-hosted Docker compute provider (fallback).
 *
 * Deploys containers on a user-controlled server via SSH + Docker. This is
 * the escape hatch when decentralised providers are unavailable or too slow.
 */

import { Client as SSHClient } from 'ssh2';
import { readFileSync } from 'node:fs';
import type {
  ComputeProvider,
  Deployment,
  DeploymentConfig,
  DeploymentStatus,
  HealthCheckResult,
  FundingResult,
  Balance,
} from '../interface.js';

export interface SelfHostedOptions {
  host: string;
  port?: number;
  username: string;
  privateKeyPath: string;
  /** Optional Docker socket path on the remote (default: /var/run/docker.sock). */
  dockerSocket?: string;
}

export class SelfHostedProvider implements ComputeProvider {
  readonly name = 'self-hosted';

  private host: string;
  private port: number;
  private username: string;
  private privateKey: Buffer;

  constructor(opts: SelfHostedOptions) {
    this.host = opts.host;
    this.port = opts.port ?? 22;
    this.username = opts.username;
    this.privateKey = readFileSync(opts.privateKeyPath);
  }

  // -----------------------------------------------------------------------
  // ComputeProvider implementation
  // -----------------------------------------------------------------------

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    const containerName = `hydraa-agent-${Date.now()}`;

    // Build `docker run` command.
    const envFlags = Object.entries(config.env)
      .map(([k, v]) => `-e ${shellEscape(k)}=${shellEscape(v)}`)
      .join(' ');

    const portFlags = (config.ports ?? [])
      .map((p) => `-p ${p}:${p}`)
      .join(' ');

    const memoryFlag = config.memory ? `--memory=${config.memory.toLowerCase().replace('mi', 'm').replace('gi', 'g')}` : '';
    const cpuFlag = config.cpu ? `--cpus=${config.cpu}` : '';

    const volumeFlag = config.persistentStorage
      ? `-v hydraa-data:${config.persistentStorage.mountPath}`
      : '';

    const cmd = [
      `docker pull ${config.image}`,
      `docker run -d --name ${containerName}`,
      memoryFlag,
      cpuFlag,
      envFlags,
      portFlags,
      volumeFlag,
      `--restart unless-stopped`,
      config.image,
    ]
      .filter(Boolean)
      .join(' ');

    await this.exec(cmd);

    return {
      id: containerName,
      provider: this.name,
      status: 'running',
      createdAt: new Date(),
      config,
      metadata: {
        containerName,
        host: this.host,
      },
    };
  }

  async status(deployment: Deployment): Promise<DeploymentStatus> {
    const name = deployment.metadata['containerName'];
    if (!name) return 'unknown';

    try {
      const output = await this.exec(
        `docker inspect --format='{{.State.Status}}' ${name}`,
      );
      const state = output.trim().replace(/'/g, '');

      switch (state) {
        case 'running':
          return 'running';
        case 'exited':
        case 'dead':
          return 'stopped';
        case 'created':
        case 'restarting':
          return 'deploying';
        default:
          return 'unknown';
      }
    } catch {
      return 'unknown';
    }
  }

  async healthCheck(deployment: Deployment): Promise<HealthCheckResult> {
    const start = Date.now();
    const s = await this.status(deployment);
    const latency = Date.now() - start;

    return {
      healthy: s === 'running',
      latency,
      message: s === 'running' ? 'Container running' : `Container status: ${s}`,
      checkedAt: new Date(),
    };
  }

  async destroy(deployment: Deployment): Promise<void> {
    const name = deployment.metadata['containerName'];
    if (!name) return;
    await this.exec(`docker stop ${name} && docker rm ${name}`);
  }

  async fund(_amount: number): Promise<FundingResult> {
    return {
      success: true,
      message: 'Self-hosted provider does not require funding.',
    };
  }

  async getBalance(): Promise<Balance> {
    return { amount: Infinity, denom: 'N/A' };
  }

  async getLogs(deployment: Deployment, lines = 100): Promise<string[]> {
    const name = deployment.metadata['containerName'];
    if (!name) return ['No container name in metadata'];

    try {
      const output = await this.exec(`docker logs --tail ${lines} ${name}`);
      return output.split('\n').filter(Boolean);
    } catch (err) {
      return [`Failed to fetch logs: ${(err as Error).message}`];
    }
  }

  // -----------------------------------------------------------------------
  // SSH helpers
  // -----------------------------------------------------------------------

  /** Execute a command on the remote host over SSH and return stdout. */
  private exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new SSHClient();

      conn
        .on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            let stdout = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => {
              stdout += data.toString();
            });
            stream.stderr.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
            stream.on('close', (code: number) => {
              conn.end();
              if (code !== 0) {
                reject(
                  new Error(
                    `SSH command exited with code ${code}: ${stderr || stdout}`,
                  ),
                );
              } else {
                resolve(stdout);
              }
            });
          });
        })
        .on('error', reject)
        .connect({
          host: this.host,
          port: this.port,
          username: this.username,
          privateKey: this.privateKey,
        });
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Basic shell-escaping for environment variable values. */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
