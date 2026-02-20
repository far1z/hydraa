/**
 * hydraa_deploy — Package current config, generate SDL, and deploy to compute.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const deployTool: HydraaTool = {
  name: 'hydraa_deploy',
  description:
    'Package the current OpenClaw config, generate an SDL manifest, and deploy the agent container to a compute provider. Returns deployment ID, status, and provider info.',
  parameters: {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        description: 'Optional provider name override (e.g. "akash", "self-hosted"). Defaults to the highest-priority configured provider.',
      },
    },
    required: [],
    additionalProperties: false,
  },

  async execute(params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const providerName = (params.provider as string | undefined) ?? undefined;

    try {
      // Resolve which provider to use
      const provider = providerName
        ? await ctx.providerManager.getProvider(providerName)
        : await ctx.providerManager.getPrimaryProvider();

      if (!provider) {
        return {
          success: false,
          message: providerName
            ? `Provider "${providerName}" is not configured.`
            : 'No compute providers are configured.',
        };
      }

      // Build deployment config from current OpenClaw config
      const deploymentConfig = buildDeploymentConfig(ctx.config);

      // Deploy
      const deployment = await provider.deploy(deploymentConfig);

      return {
        success: true,
        message: `Deployment ${deployment.id} is ${deployment.status} on ${deployment.provider}.`,
        data: {
          deploymentId: deployment.id,
          provider: deployment.provider,
          status: deployment.status,
          createdAt: deployment.createdAt.toISOString(),
          metadata: deployment.metadata,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Deploy failed: ${msg}` };
    }
  },
};

/** Build a DeploymentConfig from the hydraa runtime config. */
function buildDeploymentConfig(config: any) {
  return {
    image: config.containerImage ?? 'ghcr.io/openclaw/agent:latest',
    cpu: config.cpu ?? 0.5,
    memory: config.memory ?? '512Mi',
    storage: config.storage ?? '1Gi',
    env: config.env ?? {},
    ports: config.ports ?? [],
  };
}
