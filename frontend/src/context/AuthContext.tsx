import { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

const TOKEN_KEY = 'awt_token';

export type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  role: 'admin' | 'user';
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: validate stored token via /api/auth/me
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    api
      .get<{ user: AuthUser }>('/api/auth/me')
      .then(({ user: u }) => setUser(u))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const { token, user: u } = await api.post<{ token: string; user: AuthUser }>(
      '/api/auth/login',
      { username, password }
    );
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}
