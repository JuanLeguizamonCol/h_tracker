import { useState } from 'react';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import { Loader2, Clock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  useTimeEntryLockOverrides,
  useGrantTimeEntryLockOverride,
  useRevokeTimeEntryLockOverride,
} from '@/hooks/useTimeEntryLockOverrides';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Admin-only: grants this employee a one-off 2-hour window to log, edit, or
 * delete time entries in an already-closed (locked) month. Nobody else is
 * affected, and it can't be extended — only re-granted after it expires. See
 * Backend/utils/time_entry_lock.py. */
export function TimeEntryLockOverridePanel({ employeeId }: { employeeId: string }) {
  const { data: overrides = [], isLoading } = useTimeEntryLockOverrides(employeeId);
  const grant = useGrantTimeEntryLockOverride();
  const revoke = useRevokeTimeEntryLockOverride();
  const [busy, setBusy] = useState(false);

  const active = overrides.find(o => o.is_active);

  const handleGrant = async () => {
    setBusy(true);
    try {
      await grant.mutateAsync(employeeId);
      toast.success('Enabled for 2 hours to log hours in closed months.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await revoke.mutateAsync({ id: active.id, employeeId });
      toast.success('Access revoked.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3 border rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          Lets this person log, edit, or delete hours in an already-closed month,
          for 2 hours from when it's granted. Nobody else is affected, and it
          can't be extended — if it expires, it has to be granted again.
        </p>
        {active ? (
          <Button variant="outline" size="sm" onClick={handleRevoke} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Revoke now
          </Button>
        ) : (
          <Button size="sm" onClick={handleGrant} disabled={busy} className="shrink-0">
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Enable for 2 hours
          </Button>
        )}
      </div>

      {active && (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <Badge variant="default">Active</Badge>
          <span className="text-muted-foreground">
            expires {format(new Date(active.expires_at), 'HH:mm')} ({formatDistanceToNow(new Date(active.expires_at), { addSuffix: true })})
          </span>
        </div>
      )}

      {overrides.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">History</p>
          {overrides.slice(0, 5).map(o => {
            const expired = !o.is_active && !o.revoked_at && isAfter(new Date(), new Date(o.expires_at));
            return (
              <div key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{format(new Date(o.granted_at), 'MM/dd/yyyy HH:mm')}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {o.is_active ? 'Active' : o.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Inactive'}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
