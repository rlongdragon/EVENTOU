import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from './api';
import type { User } from './api';
import { AuthContext, type AuthContextValue } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .fetchCurrentUser(controller.signal)
      .catch(() => null)
      .then((currentUser) => {
        if (controller.signal.aborted) return;
        setUser(currentUser);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (input) => setUser(await authApi.login(input)),
      register: async (input) => setUser(await authApi.register(input)),
      logout: async () => {
        await authApi.logout();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
