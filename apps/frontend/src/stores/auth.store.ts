import { create } from 'zustand';
import type { CurrentUser, UserRole } from '../types';

// Роли упорядочены так же, как на бэкенде (roles.decorator.ts): admin может всё,
// что operator, operator — всё, что viewer. UI только прячет недоступное —
// настоящая проверка прав всегда на бэкенде.
const ROLE_RANK: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasRole(role: UserRole | null, required: UserRole): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[required];
}

interface AuthState {
  user: CurrentUser | null;
  setUser: (user: CurrentUser) => void;
  markPasswordChanged: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  markPasswordChanged: () => set((state) => (state.user ? { user: { ...state.user, mustChangePassword: false } } : {})),
}));

export const useRole = () => useAuthStore((s) => s.user?.role ?? null);
