import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

// Gates admin-level sections (e.g. Employees) to Admin AND Manager — Manager
// has elevated access everywhere except Invoices (see InvoiceGuard) and,
// with `adminOnly`, Staffing/project assignment (Admin alone).
export function AdminGuard({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { canManage, isAdmin, isLoading } = useAuth();
  const allowed = adminOnly ? isAdmin : canManage;
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
