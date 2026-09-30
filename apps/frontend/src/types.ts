export type UserRole = 'admin' | 'operator' | 'viewer';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  gitUrl: string;
  branch: string;
  installCmd: string | null;
  testCmd: string | null;
  buildCmd: string | null;
  triggerMode: 'cron' | 'manual';
  cronExpr: string | null;
  containerPort: number | null;
  hostPort: number | null;
  isPublic: boolean;
  envKeys: string[];
  deployKey: { id: string } | null;
}

// value не передан — оставить сохранённое значение (значения не возвращаются в API).
export interface EnvVariableInput {
  key: string;
  value?: string;
}

export interface PublicStatusEntry {
  name: string;
  status: BuildStatus | null;
  at: string | null;
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export type BuildStatus = 'queued' | 'running' | 'success' | 'failed' | 'rolled_back';
export type BuildStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface BuildStep {
  name: 'install' | 'test' | 'build' | 'deploy';
  status: BuildStepStatus;
  durationMs: number | null;
  logRef: string | null;
}

export interface Build {
  id: string;
  projectId: string;
  status: BuildStatus;
  branch: string;
  triggeredBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  steps: BuildStep[];
}

export interface Deployment {
  id: string;
  projectId: string;
  buildId: string;
  containerId: string | null;
  imageTag: string;
  status: string;
  deployedAt: string;
  rolledBack: boolean;
}

export interface ContainerPort {
  privatePort: number;
  publicPort: number | null;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: ContainerPort[];
  project: { id: string; name: string } | null;
  group: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modifiedAt: string;
}

export interface FileContent {
  size: number;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

export interface HostMetricSample {
  timestamp: number;
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
}

export interface ContainerMetricSample {
  timestamp: number;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target: string;
  createdAt: string;
  userEmail: string;
}
