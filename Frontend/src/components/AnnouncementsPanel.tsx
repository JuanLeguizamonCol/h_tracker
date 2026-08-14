import { useMemo, useState } from 'react';
import { Megaphone, Plus, Trash2, Paperclip, Loader2, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/hooks/useEmployees';
import {
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
  useUploadAnnouncementAttachment, useDeleteAnnouncementAttachment,
} from '@/hooks/useAnnouncements';
import { apiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function fileHref(fileUrl: string): string {
  return /^https?:\/\//i.test(fileUrl) ? fileUrl : apiUrl(fileUrl);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AnnouncementsPanel() {
  const { canManage } = useAuth();
  const { data: announcements = [], isLoading } = useAnnouncements();
  const { data: employees = [] } = useEmployees();
  const createAnnouncement = useCreateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const uploadAttachment = useUploadAnnouncementAttachment();
  const deleteAttachment = useDeleteAnnouncementAttachment();

  const allLocations = useMemo(
    () => Array.from(new Set(employees.map(e => e.location).filter((l): l is string => !!l?.trim()))).sort(),
    [employees]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'locations'>('all');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setTitle(''); setBody(''); setVisibility('all'); setSelectedLocations([]); setFiles([]);
  }

  function toggleLocation(loc: string) {
    setSelectedLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]);
  }

  async function handlePost() {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    if (visibility === 'locations' && selectedLocations.length === 0) {
      toast.error('Select at least one location.');
      return;
    }
    setIsSaving(true);
    try {
      const announcement = await createAnnouncement.mutateAsync({
        title: title.trim(),
        body: body.trim() || null,
        visibility,
        locations: visibility === 'locations' ? selectedLocations : [],
      });
      for (const file of files) {
        await uploadAttachment.mutateAsync({ announcementId: announcement.id, file });
      }
      toast.success('Announcement posted.');
      resetForm();
      setIsOpen(false);
    } catch {
      toast.error('Failed to post announcement.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this announcement for everyone?')) return;
    try {
      await deleteAnnouncement.mutateAsync(id);
      toast.success('Announcement removed.');
    } catch {
      toast.error('Failed to remove announcement.');
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await deleteAttachment.mutateAsync(id);
    } catch {
      toast.error('Failed to remove attachment.');
    }
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4" />Announcements
        </CardTitle>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="h-4 w-4" /> Post
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No announcements yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{a.title}</p>
                      {a.visibility === 'locations' && (
                        <Badge variant="outline" className="text-xs">
                          {a.locations.join(', ')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.posted_by_name} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {a.body && <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{a.body}</p>}
                {a.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.attachments.map(att => (
                      <span key={att.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                        <a href={fileHref(att.file_url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary">
                          <Paperclip className="h-3 w-3" />{att.file_name}
                        </a>
                        {canManage && (
                          <button onClick={() => handleDeleteAttachment(att.id)} className="ml-0.5 text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={isOpen} onOpenChange={v => { if (!v) setIsOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Post Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Holiday schedule update" />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Details…" />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={visibility === 'all' ? 'default' : 'outline'} onClick={() => setVisibility('all')}>
                  Everyone
                </Button>
                <Button type="button" size="sm" variant={visibility === 'locations' ? 'default' : 'outline'} onClick={() => setVisibility('locations')}>
                  Specific locations
                </Button>
              </div>
            </div>
            {visibility === 'locations' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Visible to employees in</Label>
                {allLocations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No locations set on employee profiles yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-3 rounded-md border p-3">
                    {allLocations.map(loc => (
                      <label key={loc} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={selectedLocations.includes(loc)} onCheckedChange={() => toggleLocation(loc)} />
                        {loc}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Attachments</Label>
              <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:border-primary/50">
                <Upload className="h-4 w-4" />
                {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Attach documents'}
                <input
                  type="file" multiple className="hidden"
                  onChange={e => setFiles(Array.from(e.target.files || []))}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handlePost} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
