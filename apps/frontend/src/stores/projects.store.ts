import { create } from 'zustand';
import { api } from '../lib/api';
import type { Project } from '../types';

// Общий стор вместо локального fetch в каждом компоненте — иначе сайдбар (смонтирован
// один раз на весь Dashboard-layout) не узнаёт о новом проекте после навигации
// через NewProject, где стоит собственный useEffect с собственным fetch.
interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  loaded: false,
  refresh: async () => {
    const projects = await api.listProjects();
    set({ projects, loaded: true });
  },
}));
