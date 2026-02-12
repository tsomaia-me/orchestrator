#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { main } from './main';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

function getPackageRoot(): string {
  return path.join(__dirname, '..');
}

const program = new Command();

program
  .name('relay')
  .description('Agent-to-agent coordination relay')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize .relay folder')
  .action(async () => {
    const code = await main('init', {}, { command: 'init', args: {}, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program
  .command('add <name>')
  .description('Create a new feature')
  .option('--custom', 'Include feature-level prompts')
  .action(async (name: string, opts: { custom?: boolean }) => {
    const code = await main('add', { name, ...opts }, { command: 'add', args: { name, ...opts }, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program
  .command('features')
  .description('List active features')
  .action(async () => {
    const code = await main('features', {}, { command: 'features', args: {}, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program
  .command('status <feature>')
  .description('Show feature status')
  .action(async (feature: string) => {
    const code = await main('status', { feature }, { command: 'status', args: { feature }, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program
  .command('architect [feature] [pulse]')
  .description('Run architect agent')
  .option('--submit', 'Submit the directive')
  .action(async (featureArg?: string, pulseArg?: string, opts?: { submit?: boolean }) => {
    const code = await main(
      'architect',
      { feature: featureArg, pulse: pulseArg, ...opts },
      { command: 'architect', args: { feature: featureArg, pulse: pulseArg, ...opts }, packageRoot: getPackageRoot(), program }
    );
    process.exit(code);
  });

program
  .command('engineer [feature] [pulse]')
  .description('Run engineer agent')
  .option('--submit', 'Submit the report')
  .action(async (featureArg?: string, pulseArg?: string, opts?: { submit?: boolean }) => {
    const code = await main(
      'engineer',
      { feature: featureArg, pulse: pulseArg, ...opts },
      { command: 'engineer', args: { feature: featureArg, pulse: pulseArg, ...opts }, packageRoot: getPackageRoot(), program }
    );
    process.exit(code);
  });

program
  .command('archive <feature>')
  .description('Archive a feature')
  .action(async (feature: string) => {
    const code = await main('archive', { feature }, { command: 'archive', args: { feature }, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program
  .command('help')
  .description('Show help')
  .action(async () => {
    const code = await main('help', {}, { command: 'help', args: {}, packageRoot: getPackageRoot(), program });
    process.exit(code);
  });

program.parse(process.argv);
