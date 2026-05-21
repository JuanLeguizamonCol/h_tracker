import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Edit, UserCircle, MapPin, Briefcase, Star, Plus, Trash2, Loader2,
  Mail, Phone, Calendar, Shield, FolderKanban, Award, CheckCircle2, X,
} from 'lucide-react';
import { useEmployee, useEmployees } from '@/hooks/useEmployees';
import { useEmployeeSkills, useCreateEmployeeSkill, useUpdateEmployeeSkill, useDeleteEmployeeSkill, useSkillCatalog } from '@/hooks/useSkills';
import { useAssignedProjectsWithDetails } from '@/hooks/useAssignedProjects';
import { EmployeeProjectsDialog } from '@/components/EmployeeProjectsDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { EmployeeSkill } from '@/types';

const SKILL_CATEGORIES = ['Frontend', 'Backend', 'Cloud', 'DevOps', 'Design', 'Data', 'Management', 'Soft Skills', 'Other'];
const PROFICIENCY_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };
const PROFICIENCY_COLORS: Record<number, string> = {
  1: 'bg-slate-100 text-slate-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-emerald-100 text-emerald-700',
};

function ProficiencyStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= level ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

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
  skill_name: '', category: 'Backend', proficiency_level: 2,
  years_experience: '', certified: false, certificate_name: '', cert_expiry_date: '', notes: '',
};

export default function EmployeeProfilePage() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();

  const { data: employee, isLoading } = useEmployee(employeeId);
  const { data: allEmployees = [] } = useEmployees();
  const { data: skills = [] } = useEmployeeSkills(employeeId);
  const { data: assignments = [] } = useAssignedProjectsWithDetails(employeeId);
  const { data: catalog = [] } = useSkillCatalog();

  const createSkill = useCreateEmployeeSkill(employeeId!);
  const updateSkill = useUpdateEmployeeSkill(employeeId!);
  const deleteSkill = useDeleteEmployeeSkill(employeeId!);

  const [isProjectsDialogOpen, setIsProjectsDialogOpen] = useState(false);
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EmployeeSkill | null>(null);
  const [skillForm, setSkillForm] = useState<SkillForm>(EMPTY_SKILL);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  if (isLoading || !employee) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const supervisor = allEmployees.find(e => e.id === employee.supervisor_id);

  // ── Radar chart data ──────────────────────────────────────────────────────
  const radarData = SKILL_CATEGORIES.map(cat => {
    const catSkills = skills.filter(s => s.category === cat);
    const avg = catSkills.length > 0
      ? catSkills.reduce((sum, s) => sum + s.proficiency_level, 0) / catSkills.length
      : 0;
    return { category: cat.replace(' Skills', ''), level: parseFloat(avg.toFixed(1)), count: catSkills.length };
  }).filter(d => d.count > 0);

  // ── Skill grouped by category ─────────────────────────────────────────────
  const skillsByCategory = SKILL_CATEGORIES.reduce<Record<string, EmployeeSkill[]>>((acc, cat) => {
    const catSkills = skills.filter(s => s.category === cat);
    if (catSkills.length > 0) acc[cat] = catSkills;
    return acc;
  }, {});

  // ── Skill dialog helpers ──────────────────────────────────────────────────
  const openAddSkill = () => {
    setEditingSkill(null);
    setSkillForm(EMPTY_SKILL);
    setCatalogSearch('');
    setIsSkillDialogOpen(true);
  };

  const openEditSkill = (skill: EmployeeSkill) => {
    setEditingSkill(skill);
    setSkillForm({
      skill_name: skill.skill_name,
      category: skill.category,
      proficiency_level: skill.proficiency_level,
      years_experience: skill.years_experience != null ? String(skill.years_experience) : '',
      certified: skill.certified,
      certificate_name: skill.certificate_name || '',
      cert_expiry_date: skill.cert_expiry_date || '',
      notes: skill.notes || '',
    });
    setCatalogSearch('');
    setIsSkillDialogOpen(true);
  };

  const handleSaveSkill = async () => {
    if (!skillForm.skill_name.trim()) { toast.error('Skill name is required.'); return; }
    setIsSavingSkill(true);
    try {
      const payload = {
        skill_name: skillForm.skill_name,
        category: skillForm.category,
        proficiency_level: skillForm.proficiency_level,
        years_experience: skillForm.years_experience ? parseFloat(skillForm.years_experience) : null,
        certified: skillForm.certified,
        certificate_name: skillForm.certificate_name || null,
        cert_expiry_date: skillForm.cert_expiry_date || null,
        notes: skillForm.notes || null,
      };
      if (editingSkill) {
        await updateSkill.mutateAsync({ id: editingSkill.id, updates: payload });
        toast.success('Skill updated.');
      } else {
        await createSkill.mutateAsync(payload as Parameters<typeof createSkill.mutateAsync>[0]);
        toast.success('Skill added.');
      }
      setIsSkillDialogOpen(false);
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm('Remove this skill?')) return;
    try {
      await deleteSkill.mutateAsync(skillId);
      toast.success('Skill removed.');
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const filteredCatalog = catalogSearch
    ? catalog.filter(c => c.name.toLowerCase().includes(catalogSearch.toLowerCase()))
    : catalog.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/employees')} className="cursor-pointer">Employees</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{employee.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/employees')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <UserCircle className="h-9 w-9 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{employee.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{employee.title || 'No title'}</span>
              {employee.department && <Badge variant="outline" className="text-xs">{employee.department}</Badge>}
              <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                {employee.employment_status || (employee.is_active ? 'Active' : 'Inactive')}
              </Badge>
              {employee.work_mode && <Badge variant="outline" className="text-xs">{employee.work_mode}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsProjectsDialogOpen(true)} className="gap-2">
            <FolderKanban className="h-4 w-4" /> Assign Projects
          </Button>
          <Button onClick={() => navigate(`/employees/${employeeId}/edit`)} className="gap-2">
            <Edit className="h-4 w-4" /> Edit Profile
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="skills">Skills {skills.length > 0 && `(${skills.length})`}</TabsTrigger>
          <TabsTrigger value="projects">Projects {assignments.length > 0 && `(${assignments.length})`}</TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Personal */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCircle className="h-4 w-4" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <InfoRow label="First Name" value={employee.first_name} />
                <InfoRow label="Last Name" value={employee.last_name} />
                <InfoRow label="Date of Birth" value={employee.date_of_birth} />
                <InfoRow label="Gender" value={employee.gender} />
                <InfoRow label="Personal Email" value={employee.personal_email} />
                <InfoRow label="Personal Phone" value={employee.personal_phone} />
                <InfoRow label="ID / Passport" value={employee.id_number} />
                <InfoRow label="Emergency Contact" value={employee.emergency_contact_name} />
                <InfoRow label="Emergency Phone" value={employee.emergency_contact_phone} />
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Location
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <InfoRow label="Country" value={employee.country} />
                <InfoRow label="State / Province" value={employee.state} />
                <InfoRow label="City" value={employee.city} />
                <InfoRow label="Time Zone" value={employee.timezone} />
                <InfoRow label="Address" value={employee.street_address} />
                <InfoRow label="Zip Code" value={employee.zip_code} />
                <InfoRow label="Work Mode" value={employee.work_mode} />
              </CardContent>
            </Card>

            {/* Corporate */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Corporate Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <InfoRow label="Corporate Email" value={employee.email} />
                <InfoRow label="Corporate Phone" value={employee.corporate_phone} />
                <InfoRow label="Employee Code" value={employee.employee_code} />
                <InfoRow label="Job Title" value={employee.title} />
                <InfoRow label="Department" value={employee.department} />
                <InfoRow label="Business Unit" value={employee.business_unit} />
                <InfoRow label="Employment Type" value={employee.employment_type} />
                <InfoRow label="Start Date" value={employee.start_date} />
                <InfoRow label="End Date" value={employee.end_date} />
                <InfoRow label="Reports To" value={supervisor?.name} />
              </CardContent>
            </Card>

            {/* Notes */}
            {employee.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{employee.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Skills Tab ── */}
        <TabsContent value="skills" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{skills.length} skill{skills.length !== 1 ? 's' : ''} registered</p>
            <Button size="sm" onClick={openAddSkill} className="gap-2">
              <Plus className="h-4 w-4" /> Add Skill
            </Button>
          </div>

          {skills.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <Star className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No skills yet</p>
              <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={openAddSkill}>
                <Plus className="h-4 w-4" /> Add first skill
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Radar Chart */}
              {radarData.length >= 3 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Skill Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                        <Radar
                          name="Proficiency"
                          dataKey="level"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.25}
                        />
                        <Tooltip
                          formatter={(value: number) => [PROFICIENCY_LABELS[Math.round(value)] || value, 'Level']}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Skills by category */}
              <div className="space-y-4">
                {Object.entries(skillsByCategory).map(([cat, catSkills]) => (
                  <Card key={cat}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground">{cat}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {catSkills.map(skill => (
                        <div key={skill.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{skill.skill_name}</span>
                              {skill.certified && (
                                <Award className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" title="Certified" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <ProficiencyStars level={skill.proficiency_level} />
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${PROFICIENCY_COLORS[skill.proficiency_level]}`}>
                                {PROFICIENCY_LABELS[skill.proficiency_level]}
                              </span>
                              {skill.years_experience != null && (
                                <span className="text-xs text-muted-foreground">{skill.years_experience}y exp</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSkill(skill)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteSkill(skill.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Projects Tab ── */}
        <TabsContent value="projects" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{assignments.length} project assignment{assignments.length !== 1 ? 's' : ''}</p>
            <Button size="sm" variant="outline" onClick={() => setIsProjectsDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Assign Project
            </Button>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Not assigned to any projects</p>
              <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={() => setIsProjectsDialogOpen(true)}>
                <Plus className="h-4 w-4" /> Assign to project
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map(a => (
                <Card
                  key={a.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/projects/${a.project_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{a.project_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.client_name}</p>
                        {a.role_name && (
                          <Badge variant="outline" className="mt-1 text-xs">{a.role_name}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Projects Dialog */}
      <EmployeeProjectsDialog
        open={isProjectsDialogOpen}
        onOpenChange={setIsProjectsDialogOpen}
        employee={employee}
      />

      {/* Add/Edit Skill Dialog */}
      <Dialog open={isSkillDialogOpen} onOpenChange={setIsSkillDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSkill ? 'Edit Skill' : 'Add Skill'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Skill name with autocomplete */}
            <div className="space-y-1.5">
              <Label>Skill Name *</Label>
              <Input
                value={skillForm.skill_name}
                onChange={e => {
                  setSkillForm(p => ({ ...p, skill_name: e.target.value }));
                  setCatalogSearch(e.target.value);
                }}
                placeholder="e.g. React, Python, AWS..."
              />
              {catalogSearch && filteredCatalog.length > 0 && (
                <div className="border rounded-md bg-background shadow-md max-h-36 overflow-y-auto">
                  {filteredCatalog.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
                      onClick={() => {
                        setSkillForm(p => ({ ...p, skill_name: c.name, category: c.category }));
                        setCatalogSearch('');
                      }}
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={skillForm.category} onValueChange={v => setSkillForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Proficiency Level</Label>
              <div className="flex gap-2">
                {([1, 2, 3, 4] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setSkillForm(p => ({ ...p, proficiency_level: level }))}
                    className={`flex-1 py-2 rounded-md text-xs font-medium border transition-colors ${
                      skillForm.proficiency_level === level
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {PROFICIENCY_LABELS[level]}
                  </button>
                ))}
              </div>
              <div className="flex justify-center mt-1">
                <ProficiencyStars level={skillForm.proficiency_level} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Years of Experience</Label>
              <Input
                value={skillForm.years_experience}
                onChange={e => setSkillForm(p => ({ ...p, years_experience: e.target.value }))}
                type="number" min="0" step="0.5" placeholder="e.g. 3.5"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={skillForm.certified}
                onCheckedChange={v => setSkillForm(p => ({ ...p, certified: v }))}
              />
              <Label>Certified</Label>
            </div>

            {skillForm.certified && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Certificate Name</Label>
                  <Input
                    value={skillForm.certificate_name}
                    onChange={e => setSkillForm(p => ({ ...p, certificate_name: e.target.value }))}
                    placeholder="AWS Solutions Architect"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expiry Date</Label>
                  <Input
                    value={skillForm.cert_expiry_date}
                    onChange={e => setSkillForm(p => ({ ...p, cert_expiry_date: e.target.value }))}
                    type="date"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSkillDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSkill} disabled={isSavingSkill} className="gap-2">
              {isSavingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editingSkill ? 'Save Changes' : 'Add Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
