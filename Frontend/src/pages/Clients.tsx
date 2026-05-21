import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Plus, Users, Search, MoreHorizontal, Edit, ChevronDown, ChevronRight,
  Briefcase, Loader2, Download, RefreshCw,
} from 'lucide-react';
import { useClients, useUpdateClient } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { FreshSalesImportModal } from '@/components/FreshSalesImportModal';

export default function Clients() {
  const navigate = useNavigate();
  const { data: clients = [], isLoading } = useClients();
  const { data: projects = [] } = useProjects();
  const updateClient = useUpdateClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const filteredClients = clients.filter(
    client =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false),
  );

  const getProjectsByClient = (clientId: string) =>
    projects.filter(p => p.client_id === clientId);

  const toggleExpanded = (clientId: string) => {
    setExpandedClients(prev => {
      const newSet = new Set(prev);
      newSet.has(clientId) ? newSet.delete(clientId) : newSet.add(clientId);
      return newSet;
    });
  };

  const handleToggleActive = async (client: typeof clients[0]) => {
    try {
      await updateClient.mutateAsync({ id: client.id, updates: { is_active: !client.is_active } });
      toast.success(client.is_active ? 'Client deactivated.' : 'Client activated.');
    } catch { toast.error('Something went wrong. Please try again.'); }
  };

  const existingFreshsalesIds = new Set(
    clients.filter(c => c.freshsales_id != null).map(c => c.freshsales_id as number),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground">Manage clients and their projects</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Import from FreshSales
          </Button>
          <Button className="gap-2" onClick={() => navigate('/clients/new')}>
            <Plus className="h-4 w-4" /> New Client
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-4">
        {filteredClients.map(client => {
          const clientProjects = getProjectsByClient(client.id);
          const isExpanded = expandedClients.has(client.id);
          const isCrm = client.freshsales_id != null;

          return (
            <Card key={client.id} className="card-elevated">
              <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(client.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{client.name}</CardTitle>
                          {isCrm && <CrmBadge syncedAt={client.crm_synced_at} />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {client.email || 'No email'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        <Briefcase className="h-3 w-3" />
                        {clientProjects.length} projects
                      </Badge>
                      <Badge variant={client.is_active ? 'default' : 'secondary'}>
                        {client.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(client)}>
                            {client.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="ml-14 mt-2 space-y-2">
                      <p className="text-sm font-medium text-muted-foreground mb-3">
                        Associated projects:
                      </p>
                      {clientProjects.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {clientProjects.map(project => (
                            <div
                              key={project.id}
                              className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg"
                            >
                              <Briefcase className="h-4 w-4 text-primary" />
                              <span className="font-medium text-sm">{project.name}</span>
                              <Badge
                                variant={project.is_active ? 'default' : 'secondary'}
                                className="ml-auto text-xs"
                              >
                                {project.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No projects yet</p>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No clients found</p>
        </div>
      )}

      <FreshSalesImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        existingFreshsalesIds={existingFreshsalesIds}
      />
    </div>
  );
}

function CrmBadge({ syncedAt }: { syncedAt: string | null }) {
  const label = syncedAt
    ? `Last synced: ${format(new Date(syncedAt), 'MMM d, yyyy')}`
    : 'Imported from FreshSales';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="gap-1 text-xs cursor-default bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800"
          >
            <RefreshCw className="h-3 w-3" /> FreshSales
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
