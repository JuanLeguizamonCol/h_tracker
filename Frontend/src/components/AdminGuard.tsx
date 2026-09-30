import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

// Real-Admin-only routes — not part of the per-section access system (see
// SectionGuard), since these aren't a section's "Edit," they're powers that
// stay tied to the actual role no matter what an Admin grants elsewhere
// (e.g. editing a project's own fields/dates, distinct from Projects' Edit,
// which only covers creating projects/roles and assigning people).
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth();
  const toasted = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAdmin && !toasted.current) {
      toasted.current = true;
      toast.error("You don't have permission to access this section");
    }
  }, [isAdmin, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
