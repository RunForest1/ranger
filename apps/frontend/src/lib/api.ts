import type {
  AppUser,
  AuditLogEntry,
  CurrentUser,
  UserRole,
  Build,
  CommitInfo,
  Container,
  ContainerMetricSample,
  DeployMode,
  Deployment,
  EnvVariableInput,
  FileContent,
  FileEntry,
  HostMetricSample,
  Project,
  PublicStatusEntry,
} from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Запрос ${path} завершился с ошибкой ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<CurrentUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  reauth: (password: string) => request<{ ok: boolean }>('/auth/reauth', { method: 'POST', body: JSON.stringify({ password }) }),

  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: {
    name: string;
    gitUrl: string;
    branch: string;
    deployPrivateKey: string;
    installCmd?: string;
    testCmd?: string;
    buildCmd?: string;
    triggerMode: 'cron' | 'manual';
    cronExpr?: string;
    containerPort?: number;
    hostPort?: number;
    env?: EnvVariableInput[];
  }) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  checkRepository: (gitUrl: string, deployPrivateKey: string) =>
    request<{ branches: string[] }>('/projects/check-repository', {
      method: 'POST',
      body: JSON.stringify({ gitUrl, deployPrivateKey }),
    }),
  updateProject: (
    id: string,
    data: Partial<{
      name: string;
      gitUrl: string;
      branch: string;
      installCmd: string;
      testCmd: string;
      buildCmd: string;
      triggerMode: 'cron' | 'manual';
      cronExpr: string;
      containerPort: number | null;
      hostPort: number | null;
      isPublic: boolean;
    }>,
  ) => request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getCommits: (id: string) => request<CommitInfo[]>(`/projects/${id}/commits`),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  replaceDeployKey: (id: string, deployPrivateKey: string) =>
    request<{ ok: boolean }>(`/projects/${id}/deploy-key`, {
      method: 'POST',
      body: JSON.stringify({ deployPrivateKey }),
    }),
  revealDeployKey: (id: string) =>
    request<{ privateKey: string }>(`/projects/${id}/deploy-key/reveal`, { method: 'POST' }),
  setDeployMode: (id: string, mode: DeployMode, composeFile: string) =>
    request<Project>(`/projects/${id}/deploy-mode`, { method: 'PUT', body: JSON.stringify({ mode, composeFile }) }),
  setProjectEnv: (id: string, variables: EnvVariableInput[]) =>
    request<Project>(`/projects/${id}/env`, { method: 'PUT', body: JSON.stringify({ variables }) }),
  revealProjectEnv: (id: string) =>
    request<{ env: Record<string, string> }>(`/projects/${id}/env/reveal`, { method: 'POST' }),

  listBuilds: (projectId: string) => request<Build[]>(`/projects/${projectId}/builds`),
  triggerBuild: (projectId: string, branch: string) =>
    request<Build>(`/projects/${projectId}/builds`, { method: 'POST', body: JSON.stringify({ branch }) }),
  listBranches: (projectId: string) => request<string[]>(`/projects/${projectId}/branches`),
  getBuild: (id: string) => request<Build>(`/builds/${id}`),

  listDeployments: (projectId: string) => request<Deployment[]>(`/projects/${projectId}/deployments`),
  rollbackDeployment: (projectId: string, deploymentId: string) =>
    request<{ ok: boolean; log: string[] }>(`/projects/${projectId}/deployments/${deploymentId}/rollback`, {
      method: 'POST',
    }),

  listContainers: () => request<Container[]>('/containers'),

  listAuditLog: () => request<AuditLogEntry[]>('/audit-log'),

  getPublicStatus: () => request<PublicStatusEntry[]>('/public/status'),

  listUsers: () => request<AppUser[]>('/users'),
  createUser: (email: string, role: UserRole) =>
    request<{ user: AppUser; password: string }>('/users', { method: 'POST', body: JSON.stringify({ email, role }) }),
  updateUser: (id: string, data: Partial<{ role: UserRole; disabled: boolean }>) =>
    request<AppUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetUserPassword: (id: string) =>
    request<{ user: AppUser; password: string }>(`/users/${id}/reset-password`, { method: 'POST' }),

  listFiles: (projectId: string, path: string) =>
    request<FileEntry[]>(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`),
  readFile: (projectId: string, path: string) =>
    request<FileContent>(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`),

  getHostMetrics: () => request<HostMetricSample[]>('/metrics/host'),
  getContainerMetricsHistory: (containerId: string) =>
    request<ContainerMetricSample[]>(`/metrics/containers/${containerId}`),
};
