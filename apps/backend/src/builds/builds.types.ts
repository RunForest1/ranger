export type BuildStepName = 'install' | 'test' | 'build' | 'deploy';
export type BuildStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface BuildStep {
  name: BuildStepName;
  status: BuildStepStatus;
  durationMs: number | null;
  logRef: string | null;
}
