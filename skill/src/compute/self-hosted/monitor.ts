/**
 * Self-hosted Docker container health monitoring.
 *
 * Uses SSH to query Docker on the remote host for container status and
 * resource usage.
 */

import { Client as SSHClient } from 'ssh2';
import { readFileSync } from 'node:fs';
import type { HealthCheckResult } from '../interface.js';

export interface SelfHostedMonitorOptions {
  host: string;
  port?: number;
  username: string;
  privateKeyPath: string;
}

/** CPU and memory stats from `docker stats`. */
export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: string;
  memoryLimit: string;
  memoryPercent: number;
}

export class SelfHostedMonitor {
  private host: string;
  private port: number;
  private username: string;
  private privateKey: Buffer;

  constructor(opts: SelfHostedMonitorOptions) {
    this.host = opts.host;
    this.port = opts.port ?? 22;
    this.username = opts.username;
    this.privateKey = readFileSync(opts.privateKeyPath);
  }

  /**
   * Check whether a Docker container is running on the remote host.
   */
  async checkHealth(containerName: string): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      const output = await this.exec(
        `docker inspect --format='{{.State.Status}}' ${containerName}`,
      );
      const latency = Date.now() - start;
      const status = output.trim().replace(/'/g, '');

      return {
        healthy: status === 'running',
        latency,
        message: status === 'running' ? 'Container running' : `Container status: ${status}`,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: `Health check failed: ${(err as Error).message}`,
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Retrieve CPU and memory usage for a running container.
   */
  async getContainerStats(containerName: string): Promise<ContainerStats | null> {
    try {
      const output = await this.exec(
        `docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' ${containerName}`,
      );

      const line = output.trim().replace(/'/g, '');
      const [cpuStr, memUsage, memPercStr] = line.split('|');

      if (!cpuStr || !memUsage || !memPercStr) return null;

      const [usage, limit] = memUsage.split('/').map((s) => s.trim());

      return {
        cpuPercent: parseFloat(cpuStr.replace('%', '')),
        memoryUsage: usage ?? '0',
        memoryLimit: limit ?? '0',
        memoryPercent: parseFloat(memPercStr.replace('%', '')),
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // SSH helper
  // -----------------------------------------------------------------------

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
