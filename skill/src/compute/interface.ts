/**
 * Core types and interfaces for the pluggable compute provider system.
 *
 * The compute module is designed so that different backends (Akash, self-hosted
 * Docker, Phala, Flux, etc.) can be swapped transparently.  Each backend
 * implements the {@link ComputeProvider} interface and is registered with the
 * {@link ProviderManager}.
 */

// ---------------------------------------------------------------------------
// Deployment configuration & state
// ---------------------------------------------------------------------------

/** Configuration needed to launch a container on any provider. */
export interface DeploymentConfig {
  /** Container image reference (e.g. "ghcr.io/org/agent:latest"). */
  image: string;
  /** Fractional vCPU allocation (e.g. 0.5). */
  cpu: number;
  /** Memory limit in Kubernetes quantity notation (e.g. "512Mi"). */
  memory: string;
  /** Ephemeral storage limit (e.g. "1Gi"). */
  storage: string;
  /** Environment variables injected into the container. */
  env: Record<string, string>;
  /** Ports to expose. Usually empty -- outbound-only is the default. */
  ports?: number[];
  /** Optional persistent volume. */
  persistentStorage?: { size: string; mountPath: string };
}

/** A running (or previously running) deployment on a specific provider. */
export interface Deployment {
  id: string;
  provider: string;
  status: DeploymentStatus;
  createdAt: Date;
  config: DeploymentConfig;
  /** Provider-specific metadata (lease ID, container ID, etc.). */
  metadata: Record<string, string>;
}

export type DeploymentStatus =
  | 'pending'
  | 'deploying'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'unknown';

// ---------------------------------------------------------------------------
// Financial primitives
// ---------------------------------------------------------------------------

/** Result of a funding / top-up operation. */
export interface FundingResult {
  success: boolean;
  txHash?: string;
  message: string;
}

/** Token balance on a chain or account. */
export interface Balance {
  amount: number;
  denom: string;
  usdEstimate?: number;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Outcome of a single health-check probe. */
export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  message?: string;
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/**
 * Uniform interface that every compute backend must implement.
 *
 * The {@link ProviderManager} talks exclusively through this interface so that
 * failover, monitoring, and deployment logic stays provider-agnostic.
 */
export interface ComputeProvider {
  /** Human-readable provider name (e.g. "akash", "self-hosted"). */
  readonly name: string;

  /** Deploy a container according to the given config. */
  deploy(config: DeploymentConfig): Promise<Deployment>;

  /** Query the current status of an existing deployment. */
  status(deployment: Deployment): Promise<DeploymentStatus>;

  /** Run a health-check against the deployment. */
  healthCheck(deployment: Deployment): Promise<HealthCheckResult>;

  /** Tear down the deployment and release all resources. */
  destroy(deployment: Deployment): Promise<void>;

  /** Fund the provider account (chain tx, top-up, etc.). */
  fund(amount: number): Promise<FundingResult>;

  /** Return the current balance available for compute spending. */
  getBalance(): Promise<Balance>;

  /** Optionally retrieve recent container logs. */
  getLogs?(deployment: Deployment, lines?: number): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Provider registry config
// ---------------------------------------------------------------------------

/** Declarative config entry used by ProviderManager to instantiate providers. */
export interface ProviderConfig {
  type: 'akash' | 'self-hosted' | 'phala' | 'flux';
  /** Lower numbers = higher priority. */
  priority: number;
  /** Provider-specific options (RPC endpoint, SSH host, etc.). */
  [key: string]: unknown;
}
