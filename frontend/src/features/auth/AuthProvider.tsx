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
      devLogin: async (studentId, role) => setUser(await authApi.devLogin(studentId, role)),
      updateProfile: async (input) => {
        const updated = await authApi.updateProfile(input);
        setUser(updated);
        return updated;
      },
      resendEmailVerification: async () => setUser(await authApi.resendEmailVerification()),
      cancelEmailVerification: async () => setUser(await authApi.cancelEmailVerification()),
      refreshUser: async () => setUser(await authApi.fetchCurrentUser()),
      logout: async (cas = false) => {
        const casLogoutUrl = await authApi.logout(cas);
        setUser(null);
        if (casLogoutUrl) window.location.assign(casLogoutUrl);
      },
    }),
    [user, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
