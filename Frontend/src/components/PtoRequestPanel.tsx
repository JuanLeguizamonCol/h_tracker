import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarHeart, Palmtree, Thermometer, PartyPopper, MoreHorizontal, Plus, Check, X, Loader2, Trash2, Paperclip, Upload, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePtoRequests, useCreatePtoRequest, useReviewPtoRequest, useCancelPtoRequest,
  usePtoRequestAttachments, useUploadPtoRequestAttachment, useDeletePtoRequestAttachment,
} from '@/hooks/usePtoRequests';
import { useAdminEmployees, useManagerEmployees } from '@/hooks/useProjects';
import { useEmployee } from '@/hooks/useEmployees';
import { PtoCategory, PtoStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CATEGORY_META: Record<PtoCategory, { label: string; icon: typeof Palmtree; color: string }> = {
  vacation: { label: 'Vacation', icon: Palmtree, color: 'text-sky-600 dark:text-sky-400' },
  sick: { label: 'Sick', icon: Thermometer, color: 'text-rose-600 dark:text-rose-400' },
  holiday: { label: 'Holiday', icon: PartyPopper, color: 'text-amber-600 dark:text-amber-400' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'text-muted-foreground' },
};

const STATUS_BADGE: Record<PtoStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
};

type PtoForm = {
  category: PtoCategory;
  startDate: string;
  endDate: string;
  hours: string;
  notes: string;
  approverId: string;
};

const EMPTY_FORM: PtoForm = { category: 'vacation', startDate: '', endDate: '', hours: '', notes: '', approverId: '' };

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'MMM d, yyyy');
}

export function PtoRequestPanel() {
  const { employee, canManage } = useAuth();
  const { data: myRequests = [], isLoading: myLoading } = usePtoRequests({ userId: employee?.id, enabled: !!employee?.id });
  const { data: pendingApprovals = [], isLoading: approvalsLoading } = usePtoRequests({ status: 'pending', enabled: canManage });

  const createRequest = useCreatePtoRequest();
  const reviewRequest = useReviewPtoRequest();
  const cancelRequest = useCancelPtoRequest();

  const { data: admins = [] } = useAdminEmployees();
  const { data: managers = [] } = useManagerEmployees();
  const { data: mySupervisor } = useEmployee(employee?.supervisor_id ?? undefined);

  const approverOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    [...admins, ...managers].forEach(e => byId.set(e.id, { id: e.id, name: e.name }));
    if (mySupervisor) byId.set(mySupervisor.id, { id: mySupervisor.id, name: mySupervisor.name });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [admins, managers, mySupervisor]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<PtoForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reviewing, setReviewing] = useState<{ id: string; status: 'approved' | 'rejected' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const [docsFor, setDocsFor] = useState<{ id: string; label: string } | null>(null);
  const { data: docAttachments = [], isLoading: docsLoading } = usePtoRequestAttachments(docsFor?.id);
  const uploadAttachment = useUploadPtoRequestAttachment();
  const deleteAttachment = useDeletePtoRequestAttachment();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setForm({ ...EMPTY_FORM, approverId: employee?.supervisor_id || '' });
    setIsFormOpen(true);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !docsFor) return;
    setIsUploading(true);
    try {
      await uploadAttachment.mutateAsync({ ptoRequestId: docsFor.id, file });
      toast.success('Document uploaded.');
    } catch {
      toast.error('Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteAttachment(id: string) {
    if (!docsFor) return;
    try {
      await deleteAttachment.mutateAsync({ id, ptoRequestId: docsFor.id });
      toast.success('Document removed.');
    } catch {
      toast.error('Failed to remove document.');
    }
  }

  const daySpan = useMemo(() => {
    if (!form.startDate || !form.endDate) return null;
    const start = new Date(`${form.startDate}T00:00:00`);
    const end = new Date(`${form.endDate}T00:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return days > 0 ? days : null;
  }, [form.startDate, form.endDate]);

  async function handleSubmit() {
    if (!form.startDate || !form.endDate) { toast.error('Pick a start and end date.'); return; }
    if (form.endDate < form.startDate) { toast.error('End date must be on or after the start date.'); return; }
    const hoursNum = parseFloat(form.hours);
    if (!form.hours || isNaN(hoursNum) || hoursNum <= 0) { toast.error('Enter the total hours requested.'); return; }
    setIsSubmitting(true);
    try {
      await createRequest.mutateAsync({
        category: form.category,
        start_date: form.startDate,
        end_date: form.endDate,
        hours: hoursNum,
        notes: form.notes || null,
        approver_id: form.approverId || null,
      });
      toast.success('Time off requested — awaiting approval.');
      setIsFormOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      toast.error('Failed to submit request.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this request?')) return;
    try {
      await cancelRequest.mutateAsync(id);
      toast.success('Request cancelled.');
    } catch {
      toast.error('Failed to cancel request.');
    }
  }

  async function handleReviewSubmit() {
    if (!reviewing) return;
    setIsReviewing(true);
    try {
      await reviewRequest.mutateAsync({ id: reviewing.id, status: reviewing.status, review_notes: reviewNotes || null });
      toast.success(reviewing.status === 'approved' ? 'Request approved.' : 'Request rejected.');
      setReviewing(null);
      setReviewNotes('');
    } catch {
      toast.error('Failed to review request.');
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* My Time Off */}
      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarHeart className="h-4 w-4 text-primary" /> My Time Off
          </CardTitle>
          <Button size="sm" className="gap-1.5" onClick={openForm}>
            <Plus className="h-3.5 w-3.5" /> Request Time Off
          </Button>
        </CardHeader>
        <CardContent>
          {myLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : myRequests.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">
              No time off requested yet — vacation, sick days, holidays, and more.
            </p>
          ) : (
            <div className="space-y-2">
              {myRequests.map(r => {
                const meta = CATEGORY_META[r.category];
                const Icon = meta.icon;
                const badge = STATUS_BADGE[r.status];
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {meta.label} · {r.hours}h
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(r.start_date)} → {formatDate(r.end_date)}
                          {r.notes ? ` · ${r.notes}` : ''}
                        </p>
                        {r.status === 'pending' && r.approver_name && (
                          <p className="text-xs text-muted-foreground/70 truncate">
                            Awaiting approval from {r.approver_name}
                          </p>
                        )}
                        {r.status !== 'pending' && r.reviewer_name && (
                          <p className="text-xs text-muted-foreground/70 truncate">
                            {STATUS_BADGE[r.status].label} by {r.reviewer_name}
                            {r.review_notes ? ` — ${r.review_notes}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={badge.variant} className="text-xs font-normal">{badge.label}</Badge>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                        onClick={() => setDocsFor({ id: r.id, label: `${meta.label} · ${formatDate(r.start_date)} → ${formatDate(r.end_date)}` })}
                        title="Documents"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </Button>
                      {r.status === 'pending' && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => handleCancel(r.id)}
                          title="Cancel request"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals — Admin/Manager only */}
      {canManage && (
        <Card className="card-elevated">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarHeart className="h-4 w-4 text-primary" /> Pending Time Off Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">{pendingApprovals.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {approvalsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : pendingApprovals.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No pending requests. All clear! 🎉</p>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map(r => {
                  const meta = CATEGORY_META[r.category];
                  const Icon = meta.icon;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{r.employee_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {meta.label} · {r.hours}h · {formatDate(r.start_date)} → {formatDate(r.end_date)}
                          </p>
                          {r.approver_name && (
                            <p className="text-xs text-muted-foreground/70 truncate">Approver: {r.approver_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          onClick={() => setDocsFor({ id: r.id, label: `${r.employee_name} · ${meta.label}` })}
                          title="Documents"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                          onClick={() => setReviewing({ id: r.id, status: 'approved' })}
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => setReviewing({ id: r.id, status: 'rejected' })}
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request form dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as PtoCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_META) as PtoCategory[]).map(cat => (
                    <SelectItem key={cat} value={cat}>{CATEGORY_META[cat].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total Hours</Label>
              <Input
                type="number" min="0" step="0.5"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="e.g. 8"
              />
              <p className="text-xs text-muted-foreground">
                {daySpan != null ? `${daySpan} day${daySpan > 1 ? 's' : ''} selected — ` : ''}
                e.g. 8h × number of days.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Anything your manager should know…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Needs approval from</Label>
              <Select
                value={form.approverId || '__none__'}
                onValueChange={v => setForm(f => ({ ...f, approverId: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select an approver" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No specific approver</SelectItem>
                  {approverOptions.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.id === employee?.supervisor_id ? ' (your supervisor)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Any Admin or Manager can still review the request — this just flags who should.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject confirmation dialog */}
      <Dialog open={!!reviewing} onOpenChange={o => { if (!o) { setReviewing(null); setReviewNotes(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewing?.status === 'approved' ? 'Approve' : 'Reject'} Time Off Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Note (optional)</Label>
            <Textarea
              rows={2}
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="Visible to the employee…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={handleReviewSubmit} disabled={isReviewing} variant={reviewing?.status === 'rejected' ? 'destructive' : 'default'}>
              {isReviewing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {reviewing?.status === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Documents dialog */}
      <Dialog open={!!docsFor} onOpenChange={o => { if (!o) setDocsFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Documents</DialogTitle>
            {docsFor && <p className="text-xs text-muted-foreground">{docsFor.label}</p>}
          </DialogHeader>
          <div className="space-y-2 py-2">
            {docsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : docAttachments.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">No documents attached yet.</p>
            ) : (
              <div className="space-y-1.5">
                {docAttachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-lg">
                    <a
                      href={att.file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 min-w-0 text-sm text-foreground hover:text-primary"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{att.file_name}</span>
                      {att.file_size != null && (
                        <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.file_size)}</span>
                      )}
                    </a>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0"
                      onClick={() => handleDeleteAttachment(att.id)}
                      title="Remove document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
            <Button
              variant="outline" size="sm" className="w-full gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload document
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
