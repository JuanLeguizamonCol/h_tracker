import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, Search, Loader2, User } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useActiveClients } from '@/hooks/useClients';
import { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_COLORS: Record<string, string> = {
  active: 'default',
  on_hold: 'secondary',
  completed: 'outline',
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly',
  quarterly: 'Quarterly',
  custom: 'Custom',
};

export default function Projects() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const { data: clients = [] } = useActiveClients();
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');

  const getClientName = (clientId: string) =>
    clients.find(c => c.id === clientId)?.name || 'No client';

  const filtered = projects.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getClientName(p.client_id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany =
      companyFilter === 'all' || (p.owner_company || 'IPC') === companyFilter;
    return matchesSearch && matchesCompany;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground">Manage projects, roles & rates, and employee assignments</p>
        </div>
        <Button className="gap-2" onClick={() => navigate('/projects/new')}>
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            <SelectItem value="IPC">IPC</SelectItem>
            <SelectItem value="PI">PI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            clientName={getClientName(project.client_id)}
            onClick={() => navigate(`/projects/${project.id}`)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No projects found</p>
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  clientName,
  onClick,
}: {
  project: Project;
  clientName: string;
  onClick: () => void;
}) {
  return (
    <Card
      className="card-elevated group transition-all duration-200 hover:shadow-lg cursor-pointer"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{project.name}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">{clientName}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Status + internal + company badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={(STATUS_COLORS[project.status] as any) || 'secondary'} className="capitalize text-xs">
            {project.status?.replace('_', ' ') || 'active'}
          </Badge>
          {project.is_internal && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-2 py-0.5 text-xs font-semibold">
              Internal
            </span>
          )}
          {project.project_code && (
            <Badge variant="outline" className="text-xs font-mono">{project.project_code}</Badge>
          )}
          {(project.owner_company || 'IPC') === 'IPC' ? (
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 text-xs font-semibold">
              IPC
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 text-xs font-semibold">
              PI
            </span>
          )}
        </div>

        {/* Category tags */}
        {(project.area_category || project.business_unit) && (
          <div className="flex flex-wrap gap-1">
            {project.area_category && (
              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                {project.area_category}
              </span>
            )}
            {project.business_unit && (
              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                {project.business_unit}
              </span>
            )}
          </div>
        )}

        {/* Billing period */}
        {!project.is_internal && (
          <div className="text-xs text-muted-foreground">
            Billing: {BILLING_PERIOD_LABELS[project.billing_period] || project.billing_period || 'Monthly'}
          </div>
        )}

        {/* Manager */}
        <div className="flex items-center gap-1.5 text-xs">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className={project.manager_name ? 'text-foreground' : 'text-muted-foreground italic'}>
            {project.manager_name ?? '— Unassigned'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
