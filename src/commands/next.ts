import path from 'path';
import { readBridgeStatus } from '../core/bridge.js';
import { getNextWorkflowStep, type SessionNextStep } from '../core/session.js';
import { listKnowledgeEntries } from '../core/knowledge.js';
import { collectDashboardSnapshot } from '../dashboard/collector.js';

type NextRecommendationSource = 'session' | 'bridge' | 'change' | 'knowledge' | 'start';

interface NextRecommendation {
  command: string | null;
  source: NextRecommendationSource;
  reason: string;
  description: string;
  sessionNext?: SessionNextStep | null;
  change?: {
    name: string;
    phase: string;
  };
}

interface NextOptions {
  json?: boolean;
}

function bridgeCommand(status: Awaited<ReturnType<typeof readBridgeStatus>>): string | null {
  if (status.state !== 'parseable') return null;
  if (status.status === 'ready') return '/zcw-build';
  if (status.status === 'executing') {
    return status.pendingTasks === 0 ? '/zcw-verify' : '/zcw-build';
  }
  if (status.status === 'blocked') return 'zcw bridge status';
  if (status.status === 'complete') return '/zcw-archive';
  return null;
}

async function recommendProjectNext(projectPath: string): Promise<NextRecommendation> {
  const sessionNext = await getNextWorkflowStep(projectPath);
  if (sessionNext?.step) {
    return {
      command: 'zcw continue',
      source: 'session',
      reason: `Session ${sessionNext.session.sessionId} has a pending step.`,
      description: `Resume and execute ${sessionNext.step.command}: ${sessionNext.step.description}`,
      sessionNext,
    };
  }

  const bridge = await readBridgeStatus(projectPath);
  const bridgeNext = bridgeCommand(bridge);
  if (bridgeNext) {
    return {
      command: bridgeNext,
      source: 'bridge',
      reason: `Bridge handoff is ${bridge.status}.`,
      description: bridge.next,
    };
  }

  const snapshot = await collectDashboardSnapshot(projectPath);
  const active = snapshot.changes.active.find((change) => change.next?.command);
  if (active?.next) {
    return {
      command: active.next.command,
      source: 'change',
      reason: active.next.reason,
      description: active.next.description,
      change: {
        name: active.displayName,
        phase: active.phase,
      },
    };
  }

  const knowledgeEntries = await listKnowledgeEntries(projectPath);
  if (knowledgeEntries.length === 0) {
    return {
      command: 'zcw kn add "<title>" --content "<note>"',
      source: 'knowledge',
      reason: 'No local ZCW knowledge entries found.',
      description: 'Capture reusable project context after the next meaningful discovery.',
    };
  }

  return {
    command: 'zcw run "<intent>"',
    source: 'start',
    reason: 'No active ZCW session, bridge handoff, or change was found.',
    description: 'Start a new ZCW workflow from a concrete task intent.',
  };
}

function formatNextRecommendation(recommendation: NextRecommendation): string {
  const lines = [
    'ZCW next recommendation:',
    `  next: ${recommendation.command ?? '(none)'}`,
    `  source: ${recommendation.source}`,
    `  reason: ${recommendation.reason}`,
    `  detail: ${recommendation.description}`,
  ];
  if (recommendation.change) {
    lines.push(`  change: ${recommendation.change.name} [phase: ${recommendation.change.phase}]`);
  }
  return lines.join('\n');
}

async function nextCommand(targetPath: string, options: NextOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const recommendation = await recommendProjectNext(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, recommendation }, null, 2));
    return;
  }

  console.log(formatNextRecommendation(recommendation));
}

export { formatNextRecommendation, nextCommand, recommendProjectNext };
export type { NextRecommendation, NextRecommendationSource, NextOptions };
