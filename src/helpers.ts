import path from 'path';

let initializedRoot: string | null = null;

export function initialize(projectRoot: string): void {
  const resolvedRoot = path.resolve(
    projectRoot || process.env.RELAY_ROOT || process.cwd(),
  );

  initializedRoot = resolvedRoot;
}

export function getProjectRoot(): string {
  return initializedRoot || process.env.RELAY_ROOT || process.cwd();
}
