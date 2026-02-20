/**
 * Akash SDL YAML generator.
 * Produces valid Akash SDL v2.0 deployment manifests.
 */

interface DeployConfig {
  /** CPU units (e.g. 0.5 for half a core) */
  cpu: number;
  /** Memory allocation (e.g. "512Mi") */
  memory: string;
  /** Persistent storage size (e.g. "1Gi") */
  storage: string;
  /** Docker image to deploy */
  image: string;
  /** Environment variables */
  env: Record<string, string>;
}

/**
 * Generate an Akash SDL YAML deployment manifest.
 * The service is outbound-only (no exposed ports).
 */
export function generateDeployYaml(config: DeployConfig): string {
  const { cpu, memory, storage, image, env } = config;

  // Build environment variable entries
  const envLines = Object.entries(env)
    .map(([key, value]) => `        - ${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join('\n');

  const envSection = envLines ? `\n      env:\n${envLines}` : '';

  return `---
version: "2.0"

services:
  openclaw:
    image: ${image}
    command:
      - "/bin/sh"
      - "-c"
      - "node /app/workspace/node_modules/.bin/openclaw gateway"${envSection}
    params:
      storage:
        data:
          mount: /data

profiles:
  compute:
    openclaw:
      resources:
        cpu:
          units: ${cpu}
        memory:
          size: ${memory}
        storage:
          - size: ${storage}
            name: data
            attributes:
              persistent: true
              class: beta3

  placement:
    global:
      pricing:
        openclaw:
          denom: uakt
          amount: 1000

deployment:
  openclaw:
    global:
      profile: openclaw
      count: 1
`;
}
