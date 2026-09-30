import { create } from 'zustand';

type Theme = 'light' | 'dark';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('ranger-theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — используем системную тему
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem('ranger-theme', theme);
    } catch {
      // игнорируем — тема всё равно применится для текущей сессии
    }
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
}));
