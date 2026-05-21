import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, AlertCircle, Search, Loader2,
  RefreshCw, Download, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useFreshSalesTest, useFreshSalesAccounts, useImportFreshSalesAccounts,
} from '@/hooks/useFreshSales';
import type { FreshSalesAccount } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFreshsalesIds: Set<number>;
}

export function FreshSalesImportModal({ open, onOpenChange, existingFreshsalesIds }: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data: testResult, isLoading: testLoading, refetch: retestConnection } = useFreshSalesTest(open);
  const isConnected = testResult?.success === true;

  const { data: accountsData, isLoading: accountsLoading } = useFreshSalesAccounts(
    page, debouncedSearch, open && isConnected,
  );

  const importMutation = useImportFreshSalesAccounts();

  const accounts = accountsData?.accounts ?? [];
  const total = accountsData?.total ?? 0;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const newable = accounts.filter(a => !existingFreshsalesIds.has(a.id)).map(a => a.id);
    const allSelected = newable.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        newable.forEach(id => next.delete(id));
      } else {
        newable.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setImportProgress(`Importing ${ids.length} account${ids.length > 1 ? 's' : ''}...`);
    try {
      const result = await importMutation.mutateAsync(ids);
      setImportProgress(null);
      setSelected(new Set());
      const parts = [];
      if (result.imported > 0) parts.push(`${result.imported} imported`);
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);
      toast.success(parts.join(', ') || 'Done');
      if (result.errors.length === 0) onOpenChange(false);
    } catch (e: unknown) {
      setImportProgress(null);
      toast.error(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const newableCount = accounts.filter(a => !existingFreshsalesIds.has(a.id)).length;
  const allNewSelected = newableCount > 0 && accounts
    .filter(a => !existingFreshsalesIds.has(a.id))
    .every(a => selected.has(a.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Import from FreshSales
          </DialogTitle>
          <DialogDescription>
            Select accounts to import into Horas+ as clients.
          </DialogDescription>
        </DialogHeader>

        {/* Connection status banner */}
        <ConnectionBanner
          isLoading={testLoading}
          result={testResult}
          onRetest={() => retestConnection()}
        />

        {isConnected && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search FreshSales accounts..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Account list */}
            <ScrollArea className="flex-1 min-h-0 border rounded-md">
              {accountsLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <Building2 className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No accounts found. Try relaxing the filters.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={allNewSelected}
                          onCheckedChange={toggleSelectAll}
                          disabled={newableCount === 0}
                        />
                      </th>
                      <th className="p-3 text-left font-medium">Company</th>
                      <th className="p-3 text-left font-medium">Email</th>
                      <th className="p-3 text-left font-medium">Industry</th>
                      <th className="p-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(account => {
                      const alreadyIn = existingFreshsalesIds.has(account.id);
                      return (
                        <AccountRow
                          key={account.id}
                          account={account}
                          alreadyIn={alreadyIn}
                          selected={selected.has(account.id)}
                          onToggle={() => toggleSelect(account.id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>

            {/* Pagination */}
            {total > 25 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Showing {Math.min(page * 25, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : 'No accounts selected'}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                  onClick={handleImport}
                  disabled={selected.size === 0 || importMutation.isPending}
                >
                  {importMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{importProgress ?? 'Importing...'}</>
                  ) : (
                    <>Import {selected.size > 0 ? selected.size : ''} selected</>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionBanner({
  isLoading, result, onRetest,
}: {
  isLoading: boolean;
  result: { success: boolean; user?: string; domain?: string; error?: string } | undefined;
  onRetest: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-muted/40 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking FreshSales connection...</span>
      </div>
    );
  }

  if (!result) return null;

  if (result.success) {
    return (
      <div className="flex items-center justify-between p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 text-sm">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            Connected as <strong>{result.user}</strong> — {result.domain}.myfreshworks.com
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRetest} className="h-7 gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Test
        </Button>
      </div>
    );
  }

  if (result.error?.includes('not set')) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-sm text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">FreshSales not configured</p>
          <p className="text-xs mt-0.5">Add <code>FRESHSALES_DOMAIN</code> and <code>FRESHSALES_API_KEY</code> to your environment variables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-400">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4" />
        <span>{result.error ?? 'Connection failed'}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onRetest} className="h-7 gap-1 text-xs">
        <RefreshCw className="h-3 w-3" /> Retry
      </Button>
    </div>
  );
}

function AccountRow({
  account, alreadyIn, selected, onToggle,
}: {
  account: FreshSalesAccount;
  alreadyIn: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className={`border-b last:border-0 transition-colors ${alreadyIn ? 'opacity-60' : 'hover:bg-muted/20'}`}>
      <td className="p-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} disabled={alreadyIn} />
      </td>
      <td className="p-3">
        <div className="font-medium">{account.name}</div>
        {(account.city || account.country) && (
          <div className="text-xs text-muted-foreground">
            {[account.city, account.country].filter(Boolean).join(', ')}
          </div>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{account.email ?? '—'}</td>
      <td className="p-3 text-muted-foreground">{account.industry ?? '—'}</td>
      <td className="p-3">
        {alreadyIn ? (
          <Badge variant="secondary" className="text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> Synced
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">Not imported</Badge>
        )}
      </td>
    </tr>
  );
}
