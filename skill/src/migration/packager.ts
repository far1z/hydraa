/**
 * Package an OpenClaw workspace into a deployable container context.
 * Prepares the Dockerfile and build context — does NOT build the image.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { generateDockerfile } from '../../templates/Dockerfile.js';

export interface PackageResult {
  /** Generated Dockerfile content */
  dockerfile: string;
  /** List of files/directories to include in the build context */
  buildContext: string[];
  /** Suggested image name */
  image: string;
}

interface OpenClawConfig {
  name?: string;
  skills?: string[];
  [key: string]: unknown;
}

/**
 * Package an OpenClaw workspace into a deployable container.
 * Reads openclaw.json, SOUL.md, and the skills directory to produce
 * a Dockerfile and build context listing.
 */
export async function packageWorkspace(workspacePath: string): Promise<PackageResult> {
  // Read openclaw.json
  const configPath = join(workspacePath, 'openclaw.json');
  let config: OpenClawConfig = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw) as OpenClawConfig;
  }

  const agentName = config.name ?? basename(workspacePath);
  const skills = config.skills ?? [];

  // Check for everclaw
  const hasEverclaw = skills.includes('everclaw');

  // Collect build context files
  const buildContext: string[] = [];

  // Always include core config
  if (existsSync(configPath)) {
    buildContext.push('openclaw.json');
  }

  // Include SOUL.md if present
  const soulPath = join(workspacePath, 'SOUL.md');
  if (existsSync(soulPath)) {
    buildContext.push('SOUL.md');
  }

  // Include skills directory if present
  const skillsDir = join(workspacePath, 'skills');
  if (existsSync(skillsDir)) {
    buildContext.push('skills/');
    try {
      const skillEntries = readdirSync(skillsDir);
      for (const entry of skillEntries) {
        buildContext.push(`skills/${entry}`);
      }
    } catch {
      // Directory listing failed, just include the top-level dir
    }
  }

  // Include package.json if present
  const pkgPath = join(workspacePath, 'package.json');
  if (existsSync(pkgPath)) {
    buildContext.push('package.json');
  }

  // Include pnpm-lock.yaml if present
  const lockPath = join(workspacePath, 'pnpm-lock.yaml');
  if (existsSync(lockPath)) {
    buildContext.push('pnpm-lock.yaml');
  }

  // Generate Dockerfile
  const dockerfile = generateDockerfile({
    nodeVersion: '22',
    skills,
    hasEverclaw,
  });

  const image = `hydraa/${agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}:latest`;

  return {
    dockerfile,
    buildContext,
    image,
  };
}
