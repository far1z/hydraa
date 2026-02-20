/**
 * Akash SDL (Stack Definition Language) template generation.
 *
 * Produces valid YAML that the Akash Network accepts for container deployment.
 */

import type { DeploymentConfig } from '../interface.js';

/**
 * Convert a Kubernetes-style memory string ("512Mi", "1Gi") to a numeric
 * value in the same unit family that Akash SDL expects.
 */
function normalizeMemory(mem: string): string {
  // Akash SDL accepts suffixes like Mi, Gi — pass through as-is.
  return mem;
}

/**
 * Generate a valid Akash SDL YAML string from a {@link DeploymentConfig}.
 *
 * Defaults (when the config omits optional values):
 * - 0.5 CPU, 512Mi RAM, 1Gi ephemeral storage
 * - No exposed ports (outbound-only)
 * - Persistent storage volume mounted at /data (when configured)
 */
export function generateSDL(config: DeploymentConfig): string {
  const cpu = config.cpu || 0.5;
  const memory = normalizeMemory(config.memory || '512Mi');
  const storage = config.storage || '1Gi';
  const ports = config.ports ?? [];

  // --- Environment block ------------------------------------------------
  const envLines = Object.entries(config.env)
    .map(([k, v]) => `          - ${JSON.stringify(k)}=${JSON.stringify(v)}`)
    .join('\n');

  // --- Exposed port block -----------------------------------------------
  let exposeBlock = '    expose: []\n';
  if (ports.length > 0) {
    const portEntries = ports
      .map(
        (p) =>
          `    - port: ${p}\n      to:\n        - global: true`,
      )
      .join('\n');
    exposeBlock = `    expose:\n${portEntries}\n`;
  }

  // --- Persistent storage -----------------------------------------------
  let persistentStorageProfile = '';
  let persistentStorageParam = '';
  let persistentStorageMount = '';

  if (config.persistentStorage) {
    const { size, mountPath } = config.persistentStorage;
    persistentStorageProfile = `
      data:
        size: ${size}
        attributes:
          persistent: true
          class: beta3`;

    persistentStorageParam = `
        storage:
          data:
            mount: ${mountPath}
            readOnly: false`;

    persistentStorageMount = `
  data:
    attributes:
      persistent: true
      class: beta3`;
  }

  // --- Compose the full SDL ---------------------------------------------
  const sdl = `---
version: "2.0"
services:
  agent:
    image: ${config.image}
    ${envLines ? `env:\n${envLines}` : ''}
${exposeBlock}    params:${persistentStorageParam || '\n      {}'}
profiles:
  compute:
    agent:
      resources:
        cpu:
          units: ${cpu}
        memory:
          size: ${memory}
        storage:
          - size: ${storage}${persistentStorageProfile}
  placement:
    dcloud:
      pricing:
        agent:
          denom: uakt
          amount: 10000
deployment:
  agent:
    dcloud:
      profile: agent
      count: 1
`;

  return sdl;
}
