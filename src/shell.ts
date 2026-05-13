import { execa } from 'execa';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
}

export async function runShell(command: string, cwd: string, reject = false): Promise<CommandResult> {
  const result = await execa(command, {
    cwd,
    shell: true,
    reject,
    all: true,
    env: {
      ...process.env,
      CI: 'true'
    }
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    combined: result.all ?? `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  };
}
