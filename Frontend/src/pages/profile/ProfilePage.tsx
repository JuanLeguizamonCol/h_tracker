import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Briefcase, Zap, Edit2, X, Save, Plus, Trash2, Pencil, Star, Lock, Award } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile, usePatchProfile, useMySkills, useAddSkill, useUpdateSkill, useDeleteSkill } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { EmployeeSkill } from '@/types';

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const WORK_MODES = ['Remote', 'On-site', 'Hybrid'];
const SKILL_CATEGORIES = ['Frontend', 'Backend', 'Cloud', 'Data', 'Design', 'DevOps', 'Management', 'Other'];

const PROFICIENCY = [
  { level: 1, label: 'Beginner' },
  { level: 2, label: 'Intermediate' },
  { level: 3, label: 'Advanced' },
  { level: 4, label: 'Expert' },
];

function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold select-none flex-shrink-0">
      {initials}
    </div>
  );
}

function StarRating({ level, onChange }: { level: number; onChange?: (l: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4].map(n => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= level ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} ${onChange ? 'cursor-pointer hover:text-amber-400' : ''}`}
          onClick={() => onChange?.(n)}
        />
      ))}
    </div>
  );
}

// ── Personal Info Tab ─────────────────────────────────────────────────────────

function PersonalInfoTab({ editing, setEditing }: { editing: boolean; setEditing: (v: boolean) => void }) {
  const { data: profile, isLoading } = useProfile();
  const patchProfile = usePatchProfile();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    personal_email: '',
    personal_phone: '',
    date_of_birth: '',
    gender: '',
    country: '',
    state: '',
    city: '',
    timezone: '',
    street_address: '',
    zip_code: '',
    work_mode: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  useEffect(() => {
    if (profile && !editing) {
      setForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        personal_email: profile.personal_email || '',
        personal_phone: profile.personal_phone || '',
        date_of_birth: profile.date_of_birth || '',
        gender: profile.gender || '',
        country: profile.country || '',
        state: profile.state || '',
        city: profile.city || '',
        timezone: profile.timezone || '',
        street_address: profile.street_address || '',
        zip_code: profile.zip_code || '',
        work_mode: profile.work_mode || '',
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
      });
    }
  }, [profile, editing]);

  async function handleSave() {
    try {
      await patchProfile.mutateAsync(form as any);
      toast.success('Profile updated.');
      setEditing(false);
    } catch {
      toast.error('Failed to save profile.');
    }
  }

  function field(label: string, key: keyof typeof form, type = 'text') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        {editing ? (
          <Input
            type={type}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <p className="text-sm py-1">{(form[key] as string) || <span className="text-muted-foreground">—</span>}</p>
        )}
      </div>
    );
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {editing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={patchProfile.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {patchProfile.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Basic */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {field('First Name', 'first_name')}
          {field('Last Name', 'last_name')}
          {field('Personal Email', 'personal_email', 'email')}
          {field('Personal Phone', 'personal_phone', 'tel')}
          <div className="space-y-1.5">
            <Label className="text-xs">Gender</Label>
            {editing ? (
              <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <p className="text-sm py-1">{form.gender || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
          {field('Date of Birth', 'date_of_birth', 'date')}
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {field('Country', 'country')}
          {field('State / Province', 'state')}
          {field('City', 'city')}
          {field('Timezone', 'timezone')}
          {field('Address', 'street_address')}
          {field('ZIP / Postal Code', 'zip_code')}
          <div className="space-y-1.5">
            <Label className="text-xs">Work Mode</Label>
            {editing ? (
              <Select value={form.work_mode} onValueChange={v => setForm(f => ({ ...f, work_mode: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{WORK_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <p className="text-sm py-1">{form.work_mode || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Emergency Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {field('Contact Name', 'emergency_contact_name')}
          {field('Contact Phone', 'emergency_contact_phone', 'tel')}
        </CardContent>
      </Card>

      {/* Admin-managed (read-only) */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Managed by Admin
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[
            ['Employee ID', profile?.employee_code],
            ['Department', profile?.department],
            ['Employment Type', profile?.employment_type],
            ['Start Date', profile?.start_date],
            ['Status', profile?.employment_status],
          ].map(([label, value]) => (
            <div key={label as string} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <p className="text-sm text-muted-foreground">{(value as string) || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Corporate Tab ─────────────────────────────────────────────────────────────

function CorporateTab() {
  const { data: profile } = useProfile();
  const { isAdmin } = useAuth();

  const rows: [string, string | null | undefined][] = [
    ['Corporate Email', profile?.email],
    ['Corporate Phone', profile?.corporate_phone],
    ['Job Title', profile?.title],
    ['Business Unit', profile?.business_unit],
    ['Department', profile?.department],
    ['Employment Type', profile?.employment_type],
    ['Start Date', profile?.start_date],
    ['End Date', profile?.end_date],
    ['Status', profile?.employment_status],
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        To update corporate information, contact your administrator.
      </p>
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            {rows.map(([label, value]) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <p className="text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Skills Tab ────────────────────────────────────────────────────────────────

type SkillForm = {
  skill_name: string;
  category: string;
  proficiency_level: number;
  years_experience: string;
  certified: boolean;
  certificate_name: string;
  cert_expiry_date: string;
  notes: string;
};

const EMPTY_SKILL: SkillForm = {
  skill_name: '',
  category: 'Backend',
  proficiency_level: 1,
  years_experience: '',
  certified: false,
  certificate_name: '',
  cert_expiry_date: '',
  notes: '',
};

function SkillsTab() {
  const { data: skills = [], isLoading } = useMySkills();
  const addSkill = useAddSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL);
  const [editingId, setEditingId] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_SKILL);
    setShowForm(true);
  }

  function openEdit(s: EmployeeSkill) {
    setEditingId(s.id);
    setForm({
      skill_name: s.skill_name,
      category: s.category,
      proficiency_level: s.proficiency_level,
      years_experience: s.years_experience?.toString() || '',
      certified: s.certified,
      certificate_name: s.certificate_name || '',
      cert_expiry_date: s.cert_expiry_date || '',
      notes: s.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.skill_name.trim()) { toast.error('Skill name is required.'); return; }
    const payload = {
      ...form,
      years_experience: form.years_experience ? parseFloat(form.years_experience) : null,
    };
    try {
      if (editingId) {
        await updateSkill.mutateAsync({ id: editingId, ...payload });
        toast.success('Skill updated.');
      } else {
        await addSkill.mutateAsync(payload as any);
        toast.success('Skill added.');
      }
      setShowForm(false);
      setForm(EMPTY_SKILL);
      setEditingId(null);
    } catch {
      toast.error('Failed to save skill.');
    }
  }

  async function handleDelete(skillId: string, skillName: string) {
    if (!confirm(`Remove "${skillName}" from your profile?`)) return;
    try {
      await deleteSkill.mutateAsync(skillId);
      toast.success('Skill removed.');
    } catch {
      toast.error('Failed to remove skill.');
    }
  }

  // Group by category
  const grouped = skills.reduce<Record<string, EmployeeSkill[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd} variant="outline">
          <Plus className="h-4 w-4 mr-1" /> Add Skill
        </Button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editingId ? 'Edit Skill' : 'New Skill'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Skill Name *</Label>
                <Input
                  value={form.skill_name}
                  onChange={e => setForm(f => ({ ...f, skill_name: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="e.g. React"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SKILL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Proficiency</Label>
                <div className="flex gap-2 items-center pt-1">
                  <StarRating level={form.proficiency_level} onChange={l => setForm(f => ({ ...f, proficiency_level: l }))} />
                  <span className="text-xs text-muted-foreground">
                    {PROFICIENCY.find(p => p.level === form.proficiency_level)?.label}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Years Experience</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.years_experience}
                  onChange={e => setForm(f => ({ ...f, years_experience: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="e.g. 2"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="certified"
                checked={form.certified}
                onChange={e => setForm(f => ({ ...f, certified: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="certified" className="text-xs cursor-pointer">Certified</Label>
            </div>

            {form.certified && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Certificate Name</Label>
                  <Input value={form.certificate_name} onChange={e => setForm(f => ({ ...f, certificate_name: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expiry Date</Label>
                  <Input type="date" value={form.cert_expiry_date} onChange={e => setForm(f => ({ ...f, cert_expiry_date: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={addSkill.isPending || updateSkill.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save Skill
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skill list grouped by category */}
      {skills.length === 0 && !showForm ? (
        <div className="py-12 text-center text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No skills yet.</p>
          <p className="text-xs mt-1">Add your first skill to help with project matching.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{category}</h4>
            <div className="grid gap-2">
              {items.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.skill_name}</span>
                      {s.certified && (
                        <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                          <Award className="h-3 w-3" /> Certified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <StarRating level={s.proficiency_level} />
                      <span className="text-xs text-muted-foreground">
                        {PROFICIENCY.find(p => p.level === s.proficiency_level)?.label}
                      </span>
                      {s.years_experience != null && (
                        <span className="text-xs text-muted-foreground">{s.years_experience} yr{s.years_experience !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id, s.skill_name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Profile Page ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { employee, isAdmin } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const [editing, setEditing] = useState(false);

  if (isLoading || !profile) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading profile…</div>;
  }

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.name;
  const locationParts = [profile.city, profile.country].filter(Boolean).join(', ');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-5 p-6 rounded-xl border bg-card">
        <InitialsAvatar name={displayName} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{displayName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {profile.title && <span className="text-sm text-muted-foreground">{profile.title}</span>}
            {profile.title && <span className="text-muted-foreground/40">·</span>}
            <span className="text-sm text-muted-foreground">{profile.email}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {locationParts && <span className="text-xs text-muted-foreground">{locationParts}</span>}
            {profile.work_mode && (
              <Badge variant="outline" className="text-xs">{profile.work_mode}</Badge>
            )}
            <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">
              {isAdmin ? 'Administrator' : 'Employee'}
            </Badge>
          </div>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit2 className="h-4 w-4 mr-1.5" /> Edit Profile
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList className="w-full">
          <TabsTrigger value="personal" className="flex-1 gap-1.5">
            <User className="h-4 w-4" /> Personal Info
          </TabsTrigger>
          <TabsTrigger value="corporate" className="flex-1 gap-1.5">
            <Briefcase className="h-4 w-4" /> Corporate
          </TabsTrigger>
          <TabsTrigger value="skills" className="flex-1 gap-1.5">
            <Zap className="h-4 w-4" /> Skills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <PersonalInfoTab editing={editing} setEditing={setEditing} />
        </TabsContent>
        <TabsContent value="corporate" className="mt-4">
          <CorporateTab />
        </TabsContent>
        <TabsContent value="skills" className="mt-4">
          <SkillsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
