import { Command, Option } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../commands/init.js';
import { statusCommand } from '../commands/status.js';
import { dashboardCommand } from '../commands/dashboard.js';
import { doctorCommand } from '../commands/doctor.js';
import { updateCommand } from '../commands/update.js';
import { uninstallCommand } from '../commands/uninstall.js';
import { runCommand } from '../commands/run.js';
import { continueCommand } from '../commands/continue.js';
import {
  bridgeGuardCommand,
  bridgeHandoffCommand,
  bridgeStatusCommand,
} from '../commands/bridge.js';
import {
  addCommand,
  glossaryAddCommand,
  glossaryListCommand,
  glossarySearchCommand,
  harvestCommand,
  listCommand,
  loadCommand,
  searchCommand,
  wikiLinkCommand,
} from '../commands/knowledge.js';
import { graphInitCommand, graphQueryCommand, graphStatusCommand } from '../commands/graph.js';
import { nextCommand } from '../commands/next.js';
import { auditCommand, reviewCommand, testCommand } from '../commands/quality.js';
import {
  overlayAddCommand,
  overlayApplyCommand,
  overlayListCommand,
  overlayRemoveCommand,
} from '../commands/overlay.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();
const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

program.name('zcw').description('Spec Kit + Superpowers workflow automation').version(version);

program
  .command('init [path]')
  .description('Initialize Zen Flow workflow in your project')
  .option('--yes', 'Auto-install missing components, skip existing')
  .option('--skip-existing', 'Never overwrite existing components')
  .option('--overwrite', 'Overwrite manifest-managed files')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .addOption(new Option('--language <lang>', 'Language for skills').choices(['en', 'zh']))
  .action(async (targetPath = '.', options) => {
    try {
      await initCommand(targetPath, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      }
      throw error;
    }
  });

program
  .command('run <intent> [path]')
  .description('Plan a ZCW workflow chain from an intent')
  .option('--dry-run', 'Preview the chain without creating a session')
  .option('--code', 'Include CodeGraph code context in the session knowledge load')
  .option('--no-knowledge', 'Skip the mandatory session knowledge load')
  .option('--json', 'Output as JSON')
  .action(async (intent, targetPath = '.', options) => {
    await runCommand(intent, targetPath, options);
  });

program
  .command('continue [path]')
  .description('Resume from the first pending ZCW session step')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await continueCommand(targetPath, options);
  });

program
  .command('next [path]')
  .description('Recommend the next ZCW action from project state')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await nextCommand(targetPath, options);
  });

program
  .command('status [path]')
  .description('Show active changes and workflow status')
  .option('--json', 'Output as JSON')
  .option('--bridge', 'Include Spec Kit to Superpowers handoff state')
  .option('--next', 'Include the next pending ZCW session step')
  .action(async (targetPath = '.', options) => {
    await statusCommand(targetPath, options);
  });

program
  .command('audit [path]')
  .description('Run read-only ZCW quality audit checks and write .zcw/quality artifacts')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await auditCommand(targetPath, options);
  });

program
  .command('test [path]')
  .description('Run the project test script and write .zcw/quality artifacts')
  .option('--script <script>', 'package.json script to run', 'test')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await testCommand(targetPath, options);
  });

program
  .command('review [path]')
  .description('Run read-only ZCW review checks and write .zcw/quality artifacts')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await reviewCommand(targetPath, options);
  });

const bridge = program
  .command('bridge')
  .description('Inspect and update the Spec Kit to Superpowers bridge handoff');

bridge
  .command('status [path]')
  .description('Show Spec Kit to Superpowers handoff state')
  .option('--json', 'Output as JSON')
  .option('--actor <actor>', 'Calling actor: codex, claude, or unknown')
  .action(async (targetPath = '.', options) => {
    await bridgeStatusCommand(targetPath, options);
  });

bridge
  .command('handoff [path]')
  .description('Create or update the Superpowers handoff state')
  .option('--json', 'Output as JSON')
  .addOption(
    new Option('--status <status>', 'Handoff status').choices([
      'ready',
      'executing',
      'blocked',
      'complete',
    ]),
  )
  .option('--feature <dir>', 'Spec Kit feature directory, for example specs/my-feature')
  .option('--reason <reason>', 'Reason for blocked status or operator note')
  .option('--actor <actor>', 'Calling actor: codex, claude, or unknown')
  .action(async (targetPath = '.', options) => {
    await bridgeHandoffCommand(targetPath, options);
  });

bridge
  .command('guard [path]')
  .description('Check whether a Spec Kit or Superpowers action is allowed')
  .requiredOption('--action <action>', 'Action to check, for example speckit.implement')
  .option('--json', 'Output as JSON')
  .option('--feature <dir>', 'Spec Kit feature directory override')
  .option('--reason <reason>', 'Operator note')
  .option('--actor <actor>', 'Calling actor: codex, claude, or unknown')
  .action(async (targetPath = '.', options) => {
    await bridgeGuardCommand(targetPath, options);
  });

const graph = program.command('graph').description('Use CodeGraph semantic code intelligence');

graph
  .command('status [path]')
  .description('Show CodeGraph CLI and project index status')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await graphStatusCommand(targetPath, options);
  });

graph
  .command('init [path]')
  .description('Initialize or refresh the project CodeGraph index')
  .option('--install', 'Install CodeGraph CLI if missing')
  .option('--force', 'Refresh even when .codegraph already exists')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await graphInitCommand(targetPath, options);
  });

graph
  .command('search <query> [path]')
  .description('Search code with CodeGraph')
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (query, targetPath = '.', options) => {
    await graphQueryCommand('search', query, targetPath, options);
  });

graph
  .command('callers <symbol> [path]')
  .description('Find callers for a symbol with CodeGraph')
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (symbol, targetPath = '.', options) => {
    await graphQueryCommand('callers', symbol, targetPath, options);
  });

graph
  .command('context <symbol> [path]')
  .description('Load code context for a symbol with CodeGraph')
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (symbol, targetPath = '.', options) => {
    await graphQueryCommand('context', symbol, targetPath, options);
  });

const kn = program.command('kn').description('Manage local ZCW knowhow entries');

kn.command('add <title> [path]')
  .description('Add a local knowhow entry')
  .option('--content <content>', 'Entry content')
  .option('--source <source>', 'Source note or artifact path')
  .option('--tag <tag>', 'Tag, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (title, targetPath = '.', options) => {
    await addCommand('kn', title, targetPath, options);
  });

kn.command('list [path]')
  .description('List local knowhow entries')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await listCommand('kn', targetPath, options);
  });

kn.command('search <query> [path]')
  .description('Search local knowhow entries')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (query, targetPath = '.', options) => {
    await searchCommand('kn', query, targetPath, options);
  });

const wiki = program.command('wiki').description('Manage the local ZCW wiki graph');

wiki
  .command('add <title> [path]')
  .description('Add a local wiki entry')
  .option('--content <content>', 'Entry content')
  .option('--source <source>', 'Source note or artifact path')
  .option('--tag <tag>', 'Tag, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (title, targetPath = '.', options) => {
    await addCommand('wiki', title, targetPath, options);
  });

wiki
  .command('list [path]')
  .description('List local wiki entries')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await listCommand('wiki', targetPath, options);
  });

wiki
  .command('search <query> [path]')
  .description('Search local wiki entries')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (query, targetPath = '.', options) => {
    await searchCommand('wiki', query, targetPath, options);
  });

wiki
  .command('link <from> <to> [path]')
  .description('Link two local wiki entries')
  .option('--relation <relation>', 'Link relation label')
  .option('--json', 'Output as JSON')
  .action(async (from, to, targetPath = '.', options) => {
    await wikiLinkCommand(from, to, targetPath, options);
  });

const glossary = program
  .command('glossary')
  .description('Manage project glossary terms backed by the local ZCW wiki');

glossary
  .command('add <term> [path]')
  .description('Add a glossary term')
  .option('--definition <definition>', 'Term definition')
  .option('--source <source>', 'Source note or artifact path')
  .option('--tag <tag>', 'Tag, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (term, targetPath = '.', options) => {
    await glossaryAddCommand(term, targetPath, options);
  });

glossary
  .command('list [path]')
  .description('List glossary terms')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await glossaryListCommand(targetPath, options);
  });

glossary
  .command('search <query> [path]')
  .description('Search glossary terms')
  .option('--tag <tag>', 'Tag filter, repeatable or comma-separated', collect, [])
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (query, targetPath = '.', options) => {
    await glossarySearchCommand(query, targetPath, options);
  });

const overlay = program.command('overlay').description('Manage project-level ZCW skill overlays');

overlay
  .command('add <skill> [path]')
  .description('Add or replace a project overlay for zcw or a zcw-* skill')
  .option('--content <content>', 'Overlay instructions')
  .option('--json', 'Output as JSON')
  .action(async (skill, targetPath = '.', options) => {
    await overlayAddCommand(skill, targetPath, options);
  });

overlay
  .command('list [path]')
  .description('List project overlays')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await overlayListCommand(targetPath, options);
  });

overlay
  .command('remove <skill> [path]')
  .description('Remove a project overlay')
  .option('--json', 'Output as JSON')
  .action(async (skill, targetPath = '.', options) => {
    await overlayRemoveCommand(skill, targetPath, options);
  });

overlay
  .command('apply [skill] [path]')
  .description('Apply project overlays to installed ZCW skills')
  .option('--json', 'Output as JSON')
  .action(async (skill, targetPath = '.', options) => {
    await overlayApplyCommand(skill, targetPath, options);
  });

program
  .command('harvest <spec> [path]')
  .description('Harvest a Spec Kit change into local ZCW knowledge')
  .option('--json', 'Output as JSON')
  .action(async (specPath, targetPath = '.', options) => {
    await harvestCommand(specPath, targetPath, options);
  });

program
  .command('load [path]')
  .description('Load relevant local ZCW knowledge for an intent')
  .option('--intent <intent>', 'Task intent to search with')
  .option('--query <query>', 'Direct knowledge search query')
  .option('--code', 'Include CodeGraph code search results')
  .option('--limit <limit>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await loadCommand(targetPath, options);
  });

program
  .command('dashboard [path]')
  .description('Launch the local Zen Flow dashboard in your browser')
  .option('--port <port>', 'HTTP port to bind (default 4321, auto-bumps if busy)', (value) => {
    if (!/^\d+$/u.test(value)) {
      throw new Error(`Invalid --port value: "${value}". Use an integer between 0 and 65535.`);
    }
    return Number.parseInt(value, 10);
  })
  .option('--no-open', "Don't open the dashboard URL in the browser automatically")
  .option('--json', 'Print a single dashboard snapshot to stdout and exit')
  .action(async (targetPath = '.', options) => {
    await dashboardCommand(targetPath, options);
  });

program
  .command('doctor [path]')
  .description('Diagnose Zen Flow installation health')
  .option('--json', 'Output as JSON')
  .option('--readiness', 'Include bridge readiness checks')
  .addOption(
    new Option('--scope <scope>', 'Install scope to diagnose').choices([
      'auto',
      'global',
      'project',
    ]),
  )
  .action(async (targetPath = '.', options) => {
    await doctorCommand(targetPath, options);
  });

program
  .command('update [path]')
  .description('Update ZCW skill files to latest version')
  .option('--json', 'Output as JSON')
  .option('--dry-run', 'Preview update actions without changing files')
  .option('--setup-only', 'Skip npm self-update and refresh local setup only')
  .addOption(new Option('--language <lang>', 'Language for skills').choices(['en', 'zh']))
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .addOption(new Option('--skip-npm', 'Skip npm package self-update').hideHelp())
  .action(async (targetPath = '.', options) => {
    await updateCommand(targetPath, options);
  });

program
  .command('uninstall [path]')
  .description('Remove Zen Flow skills, rules, and hooks from your project or global scope')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--scope <scope>', 'Uninstall scope').choices(['global', 'project']))
  .option('--force', 'Skip confirmation prompts')
  .action(async (targetPath = '.', options) => {
    try {
      await uninstallCommand(targetPath, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      }
      throw error;
    }
  });

program.parse();
