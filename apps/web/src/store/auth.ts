import { create } from 'zustand';

export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'AUTHOR' | 'ADMIN';

interface User {
  sub: string;
  email: string;
  displayName: string;
  restore_tier: Tier;
  restore_roles: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  isBronze: () => boolean;
  isSilver: () => boolean;
  isGold: () => boolean;
  isAtLeast: (tier: Tier) => boolean;
}

const TIER_RANK: Record<Tier, number> = {
  BRONZE: 1, SILVER: 2, GOLD: 2, AUTHOR: 3, ADMIN: 4,
};

export const useAuth = create<AuthState>((set, get) => ({
  user: (() => {
    const stored = localStorage.getItem('restore_user');
    return stored ? JSON.parse(stored) : null;
  })(),
  token: localStorage.getItem('restore_token'),

  setAuth: (token, user) => {
    localStorage.setItem('restore_token', token);
    localStorage.setItem('restore_user', JSON.stringify(user));
    set({ token, user });
  },

  clearAuth: () => {
    localStorage.removeItem('restore_token');
    localStorage.removeItem('restore_user');
    set({ token: null, user: null });
  },

  isBronze: () => get().user?.restore_tier === 'BRONZE',
  isSilver: () => get().user?.restore_tier === 'SILVER',
  isGold:   () => get().user?.restore_tier === 'GOLD',
  isAtLeast: (tier: Tier) => {
    const t = get().user?.restore_tier;
    if (!t) return false;
    if (t === 'ADMIN') return true;
    return TIER_RANK[t] >= TIER_RANK[tier];
  },
}));
