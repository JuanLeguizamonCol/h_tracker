import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { Employee, AppRole } from '@/types';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '@/lib/api';

interface AuthContextType {
  employee: Employee | null;
  role: AppRole;
  isLoading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState<AppRole>('employee');
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      // These two are independent (roles are matched client-side by emp.id), so
      // fetch them in parallel — this gate blocks the first render of the whole
      // app, so a serial waterfall here adds a full round-trip to every load.
      const [emp, roles] = await Promise.all([
        api.get<Employee>('/employees/me'),
        api.get<{ id: string; user_id: string; role: AppRole }[]>('/user-roles'),
      ]);
      setEmployee(emp);
      const found = roles.find(r => r.user_id === emp.id);
      setRole(found?.role ?? 'employee');
    } catch {
      clearStoredToken();
      setEmployee(null);
      setRole('employee');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // On mount: if a token exists, load the profile
  useEffect(() => {
    if (getStoredToken()) {
      loadProfile();
    } else {
      setIsLoading(false);
    }
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    const result = await api.post<{ access_token: string; token_type: string }>(
      '/auth/login',
      { email, password },
    );
    setStoredToken(result.access_token);
    await loadProfile();
  };

  const signOut = () => {
    clearStoredToken();
    setEmployee(null);
    setRole('employee');
    window.location.href = '/auth';
  };

  return (
    <AuthContext.Provider value={{
      employee,
      role,
      isLoading,
      isAdmin: role === 'admin',
      isAuthenticated: !!employee,
      mustChangePassword: !!employee?.must_change_password,
      login,
      signOut,
      refreshProfile: loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
