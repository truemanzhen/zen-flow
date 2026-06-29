import path from 'path';
import {
  guardBridgeAction,
  readBridgeStatus,
  updateBridgeHandoff,
  type BridgeHandoffStatus,
} from '../core/bridge.js';

interface BridgeStatusOptions {
  json?: boolean;
  actor?: string;
}

interface BridgeHandoffOptions {
  json?: boolean;
  status?: BridgeHandoffStatus;
  feature?: string;
  reason?: string;
  actor?: string;
}

interface BridgeGuardOptions {
  json?: boolean;
  action?: string;
  actor?: string;
  feature?: string;
  reason?: string;
}

function printBridgeStatus(status: Awaited<ReturnType<typeof readBridgeStatus>>): void {
  console.log('[zcw bridge]');
  console.log(`  State: ${status.state}`);
  console.log(`  Handoff: ${status.handoffPath}`);
  console.log(`  Feature directory: ${status.featureDirectory ?? '(none)'}`);
  console.log(`  Status: ${status.status ?? '(none)'}`);
  console.log(`  Artifact owner: ${status.artifactOwner ?? '(none)'}`);
  console.log(`  Actor: ${status.actor}`);
  console.log(`  Pending tasks: ${status.pendingTasks ?? '(unknown)'}`);
  if (status.error) console.log(`  Error: ${status.error}`);
  console.log(`  Next: ${status.next}`);
  console.log();
}

export async function bridgeStatusCommand(
  targetPath: string,
  options: BridgeStatusOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const status = await readBridgeStatus(projectPath, options.actor);

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  printBridgeStatus(status);
}

export async function bridgeHandoffCommand(
  targetPath: string,
  options: BridgeHandoffOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const status = options.status ?? 'ready';
  const handoff = await updateBridgeHandoff(projectPath, {
    status,
    featureDirectory: options.feature,
    reason: options.reason,
    actor: options.actor,
  });

  if (options.json) {
    console.log(JSON.stringify(handoff, null, 2));
    return;
  }

  console.log(`ZCW bridge handoff updated: ${handoff.status}`);
  console.log(`  feature: ${handoff.feature_directory}`);
  console.log(`  actor: ${handoff.actor ?? 'unknown'}`);
  if (handoff.reason) console.log(`  reason: ${handoff.reason}`);
}

export async function bridgeGuardCommand(
  targetPath: string,
  options: BridgeGuardOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await guardBridgeAction(projectPath, {
    action: options.action ?? '',
    actor: options.actor,
    targetFeatureDirectory: options.feature,
    reason: options.reason,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`ZCW bridge guard ${result.decision}: ${options.action}`);
    if (result.reason) console.log(`  reason: ${result.reason}`);
    console.log(`  next: ${result.status.next}`);
  }

  if (result.decision === 'deny') {
    process.exitCode = 1;
  }
}

export { printBridgeStatus };
