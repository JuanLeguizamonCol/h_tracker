import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { Employee, AppRole, SectionAccess, SectionKey } from '@/types';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '@/lib/api';
import { msalInstance, ensureMsalInitialized } from '@/lib/msal';

// Super admins have unrestricted access to every invoice regardless of
// project ownership — everyone else (a regular Admin) only sees/manages
// invoices for projects they own. This list is a UX convenience only (e.g.
// showing "all invoices" affordances); the real enforcement is server-side
// in Backend/utils/roles.py — keep this in sync with SUPER_ADMIN_NAMES there.
const SUPER_ADMIN_NAMES = new Set(['jose fornell', 'gail fornell', 'juan leguizamon']);

interface AuthContextType {
  employee: Employee | null;
  role: AppRole;
  isLoading: boolean;
  isAdmin: boolean;
  /** True for the 'manager' role only. */
  isManager: boolean;
  /** Admin OR manager — elevated access to everything EXCEPT Invoices, which
   * stays gated behind `isAdmin` alone. */
  canManage: boolean;
  /** A named super admin (Jose Fornell, Gail Fornell, Juan Leguizamon) — sees
   * and manages every invoice, not just the ones for projects they own. */
  isSuperAdmin: boolean;
  isAuthenticated: boolean;
  /** Per-section View/Edit, resolved server-side (role default, or an Admin's
   * per-employee override — see Backend/utils/section_access.py). Drives the
   * sidebar and route guards; falls back to `true` while still loading so the
   * app doesn't flash "no access" before the first fetch resolves. */
  hasView: (section: SectionKey) => boolean;
  hasEdit: (section: SectionKey) => boolean;
  loginWithEntra: () => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState<AppRole>('employee');
  const [sectionAccess, setSectionAccess] = useState<Record<string, SectionAccess> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      // Independent calls (nothing here depends on another's result), fetched in
      // parallel — this gate blocks the first render of the whole app, so a
      // serial waterfall here adds extra round-trips to every load.
      const [emp, roles, access] = await Promise.all([
        api.get<Employee>('/employees/me'),
        api.get<{ id: string; user_id: string; role: AppRole }[]>('/user-roles'),
        api.get<SectionAccess[]>('/section-access/me'),
      ]);
      setEmployee(emp);
      const found = roles.find(r => r.user_id === emp.id);
      setRole(found?.role ?? 'employee');
      setSectionAccess(Object.fromEntries(access.map(a => [a.section, a])));
    } catch {
      clearStoredToken();
      setEmployee(null);
      setRole('employee');
      setSectionAccess(null);
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

  const loginWithEntra = async () => {
    await ensureMsalInitialized();
    const popupResult = await msalInstance.loginPopup({ scopes: ['openid', 'profile', 'email'] });
    const result = await api.post<{ access_token: string; token_type: string }>(
      '/auth/login/entra',
      { id_token: popupResult.idToken },
    );
    setStoredToken(result.access_token);
    await loadProfile();
  };

  const signOut = () => {
    clearStoredToken();
    setEmployee(null);
    setRole('employee');
    setSectionAccess(null);
    window.location.href = '/auth';
  };

  // Defaults to true while sectionAccess hasn't loaded yet (isLoading is what
  // route guards actually check to hold off rendering) and for any section
  // this build doesn't recognize, so a stale frontend never over-restricts.
  const hasView = (section: SectionKey) => sectionAccess?.[section]?.can_view ?? true;
  const hasEdit = (section: SectionKey) => sectionAccess?.[section]?.can_edit ?? true;

  return (
    <AuthContext.Provider value={{
      employee,
      role,
      isLoading,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      canManage: role === 'admin' || role === 'manager',
      isSuperAdmin: SUPER_ADMIN_NAMES.has((employee?.name || '').trim().toLowerCase()),
      isAuthenticated: !!employee,
      hasView,
      hasEdit,
      loginWithEntra,
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
