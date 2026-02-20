/**
 * HeartbeatScheduler -- Cron-like scheduler for recurring monitors and actions.
 *
 * Wraps the `cron` npm package to provide named, inspectable jobs with
 * last-run / next-run tracking.
 */

import { CronJob } from 'cron';

/** Status snapshot for a single registered job. */
export interface JobStatus {
  name: string;
  running: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
}

/** Aggregate status of all scheduled jobs. */
export interface SchedulerStatus {
  running: boolean;
  jobs: JobStatus[];
}

interface RegisteredJob {
  name: string;
  fn: () => Promise<void>;
  cronExpression: string;
  cronJob: CronJob | null;
  lastRun: Date | null;
}

export class HeartbeatScheduler {
  private jobs: Map<string, RegisteredJob> = new Map();
  private started = false;

  /**
   * Register a named monitor or action to run on a cron schedule.
   *
   * @param name      Unique identifier for this job.
   * @param fn        Async function to execute on each tick.
   * @param interval  Cron expression (e.g. every 5 minutes).
   */
  register(name: string, fn: () => Promise<void>, interval: string): void {
    if (this.jobs.has(name)) {
      throw new Error(`Job "${name}" is already registered.`);
    }

    this.jobs.set(name, {
      name,
      fn,
      cronExpression: interval,
      cronJob: null,
      lastRun: null,
    });
  }

  /** Start all registered cron jobs. */
  start(): void {
    if (this.started) return;

    for (const job of this.jobs.values()) {
      const tickFn = async () => {
        try {
          await job.fn();
        } catch (err) {
          console.error(`[heartbeat] Job "${job.name}" failed:`, err);
        } finally {
          job.lastRun = new Date();
        }
      };

      job.cronJob = new CronJob(job.cronExpression, tickFn, null, true);
    }

    this.started = true;
  }

  /** Stop all running cron jobs. */
  stop(): void {
    for (const job of this.jobs.values()) {
      job.cronJob?.stop();
      job.cronJob = null;
    }
    this.started = false;
  }

  /** Manually trigger a specific job by name. */
  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" is not registered.`);
    }

    try {
      await job.fn();
    } finally {
      job.lastRun = new Date();
    }
  }

  /** Return the current status of all registered jobs. */
  getStatus(): SchedulerStatus {
    const jobs: JobStatus[] = [];

    for (const job of this.jobs.values()) {
      const nextDate = job.cronJob?.nextDate();
      jobs.push({
        name: job.name,
        running: job.cronJob?.running ?? false,
        lastRun: job.lastRun,
        nextRun: nextDate ? nextDate.toJSDate() : null,
      });
    }

    return { running: this.started, jobs };
  }
}
