import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { AUTH_EXPIRED_EVENT, queryClient } from './queryClient';

interface AuthState {
  user: User | null;
  loading: boolean;
  isEditor: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('GET', '/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expire = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
  }, []);

  const value: AuthState = {
    user,
    loading,
    isEditor: user?.role === 'editor',
    login: async (email, password) => {
      const r = await api<{ user: User }>('POST', '/api/auth/login', { email, password });
      setUser(r.user);
    },
    logout: async () => {
      await api('POST', '/api/auth/logout');
      queryClient.clear(); // no dejar datos en caché para el siguiente usuario
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
