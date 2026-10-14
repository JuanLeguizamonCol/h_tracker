import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useTimeEntryDelegates,
  useGrantTimeEntryDelegate,
  useRevokeTimeEntryDelegate,
} from '@/hooks/useTimeEntryDelegates';
import { useEmployees } from '@/hooks/useEmployees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';

/** Admin-only: lets this employee also log, edit, or delete time entries for
 * one or more specific OTHER employees (e.g. an assistant entering hours for
 * someone who doesn't use the tracker directly) — scoped to exactly those
 * people, not manager-style access to everyone. See
 * Backend/models/time_entry_delegates.py. */
export function TimeEntryDelegatePanel({ employeeId }: { employeeId: string }) {
  const { data: delegates = [], isLoading } = useTimeEntryDelegates(employeeId);
  const { data: employees = [] } = useEmployees();
  const grant = useGrantTimeEntryDelegate();
  const revoke = useRevokeTimeEntryDelegate();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = delegates.filter(d => d.is_active);
  const activeTargetIds = new Set(active.map(d => d.target_user_id));
  const options = employees
    .filter(e => e.id !== employeeId && e.is_active && !activeTargetIds.has(e.id))
    .map(e => ({ id: e.id, label: e.name }));

  const handleGrant = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      await grant.mutateAsync({ delegate_user_id: employeeId, target_user_id: targetId });
      setTargetId(null);
      toast.success('Can now log hours for that person too.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    try {
      await revoke.mutateAsync({ id, delegateUserId: employeeId });
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
      <p className="text-sm text-muted-foreground flex items-start gap-2">
        <Users className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        Lets this person also log, edit, or delete time entries for someone else specifically —
        not everyone, just the people added below. Useful for an assistant entering hours on
        behalf of someone who doesn't use the tracker directly.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <SearchableCombobox options={options} value={targetId} onChange={setTargetId} placeholder="Add a person to log hours for..." />
        </div>
        <Button size="sm" onClick={handleGrant} disabled={!targetId || busy} className="shrink-0">
          {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Add
        </Button>
      </div>

      {active.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {active.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-sm rounded-md border px-3 py-2">
              <span>
                Can log hours for <span className="font-medium">{d.target_name}</span>
                <span className="text-xs text-muted-foreground ml-2">since {format(new Date(d.granted_at), 'MM/dd/yyyy')}</span>
              </span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => handleRevoke(d.id)} disabled={busy} title="Revoke">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {active.length === 0 && (
        <p className="text-xs text-muted-foreground">Not currently delegated to log hours for anyone else.</p>
      )}

      {delegates.some(d => !d.is_active) && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">History</p>
          {delegates.filter(d => !d.is_active).slice(0, 5).map(d => (
            <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{d.target_name}</span>
              <Badge variant="secondary" className="text-xs font-normal">Revoked</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
