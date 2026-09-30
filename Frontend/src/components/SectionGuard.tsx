import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { SectionKey } from '@/types';
import { Loader2 } from 'lucide-react';

// Gates a route by the caller's resolved access for one section — the role
// default, or an Admin's per-employee override (see
// Backend/utils/section_access.py and the Access tab on an employee's
// profile). `level="edit"` is for a section's create/manage routes
// (e.g. /projects/new); `level="view"` for everything else.
export function SectionGuard({
  children, section, level = 'view',
}: { children: React.ReactNode; section: SectionKey; level?: 'view' | 'edit' }) {
  const { hasView, hasEdit, isLoading } = useAuth();
  const allowed = level === 'edit' ? hasEdit(section) : hasView(section);
  const toasted = useRef(false);

  useEffect(() => {
    if (!isLoading && !allowed && !toasted.current) {
      toasted.current = true;
      toast.error("You don't have permission to access this section");
    }
  }, [allowed, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
