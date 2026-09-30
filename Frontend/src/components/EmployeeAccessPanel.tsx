import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeSectionAccess, useUpdateSectionAccess } from '@/hooks/useSectionAccess';
import { SectionAccess, SectionAccessPatch, SectionKey } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Draft = Record<SectionKey, { can_view: boolean; can_edit: boolean }>;

function draftFrom(rows: SectionAccess[]): Draft {
  return Object.fromEntries(rows.map(r => [r.section, { can_view: r.can_view, can_edit: r.can_edit }])) as Draft;
}

/** Per-employee, per-section View/Edit overrides — Admin only. Sits on top of
 * the employee's role (employee/manager/admin): what's shown here is what
 * they actually get, whether that's the role default or a custom override
 * (see Backend/utils/section_access.py). */
export function EmployeeAccessPanel({ employeeId }: { employeeId: string }) {
  const { employee: currentUser } = useAuth();
  const { data: rows = [], isLoading } = useEmployeeSectionAccess(employeeId);
  const updateAccess = useUpdateSectionAccess();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync the draft whenever fresh server data lands (initial load, or after
  // a save/reset) — but never clobber in-progress edits on an unrelated refetch.
  useEffect(() => {
    if (rows.length > 0) setDraft(draftFrom(rows));
  }, [rows]);

  const isSelf = employeeId === currentUser?.id;
  const isDirty = draft != null && rows.some(r => draft[r.section].can_view !== r.can_view || draft[r.section].can_edit !== r.can_edit);

  const setCell = (section: SectionKey, field: 'can_view' | 'can_edit', value: boolean) => {
    setDraft(d => {
      if (!d) return d;
      const next = { ...d, [section]: { ...d[section] } };
      next[section][field] = value;
      // Edit implies View — an edit-only grant with no view would just be
      // confusing (and every write endpoint sits behind a view-gated route).
      if (field === 'can_edit' && value) next[section].can_view = true;
      if (field === 'can_view' && !value) next[section].can_edit = false;
      return next;
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      const overrides: SectionAccessPatch[] = rows.map(r => ({
        section: r.section, can_view: draft[r.section].can_view, can_edit: draft[r.section].can_edit,
      }));
      await updateAccess.mutateAsync({ employeeId, overrides });
      toast.success('Access saved.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAll = async () => {
    setIsSaving(true);
    try {
      await updateAccess.mutateAsync({ employeeId, overrides: [] });
      toast.success('Reset to role defaults.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !draft) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          What this person can see and change in each section. Starts from their role
          (Employee / Manager / Admin) — check a box to grant access beyond it, or
          uncheck one to take access away, without changing their role for anyone else.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleResetAll} disabled={isSaving || isSelf}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset all to defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty || isSelf}>
            {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      {isSelf && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          You can't change your own access — ask another Admin.
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Section</TableHead>
            <TableHead className="text-center w-24">View</TableHead>
            <TableHead className="text-center w-24">Edit</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const custom = row.view_overridden || row.edit_overridden;
            return (
              <TableRow key={row.section}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={draft[row.section].can_view}
                    disabled={isSelf}
                    onCheckedChange={v => setCell(row.section, 'can_view', !!v)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={draft[row.section].can_edit}
                    disabled={isSelf}
                    onCheckedChange={v => setCell(row.section, 'can_edit', !!v)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={custom ? 'default' : 'secondary'} className="text-xs font-normal">
                    {custom ? 'Custom' : 'Role default'}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
