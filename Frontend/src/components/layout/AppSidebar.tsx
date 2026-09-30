import { Clock, Calendar, Briefcase, Users, FileText, UserCircle, ChevronLeft, ChevronRight, LogOut, LayoutDashboard, BarChart3, Users2 } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { SectionKey } from '@/types';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

// One list for everyone — each item's visibility is resolved per employee via
// hasView(section) (role default, or an Admin's per-employee override; see
// Backend/utils/section_access.py and the Access tab on an employee's
// profile), not a fixed role-based array like before.
const NAVIGATION_ITEMS: { title: string; url: string; icon: typeof LayoutDashboard; section: SectionKey }[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, section: 'dashboard' },
  { title: 'Weekly Log', url: '/timesheet', icon: Clock, section: 'timesheet' },
  { title: 'History', url: '/history', icon: Calendar, section: 'history' },
  { title: 'My Profile', url: '/profile', icon: UserCircle, section: 'profile' },
  { title: 'Projects', url: '/projects', icon: Briefcase, section: 'projects' },
  { title: 'Clients', url: '/clients', icon: Users, section: 'clients' },
  { title: 'Employees', url: '/employees', icon: UserCircle, section: 'employees' },
  { title: 'Staffing', url: '/staffing', icon: Users2, section: 'staffing' },
  { title: 'Invoices', url: '/invoices', icon: FileText, section: 'invoices' },
  { title: 'Reports', url: '/reports', icon: BarChart3, section: 'reports' },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const { isAdmin, isManager, employee, signOut, hasView } = useAuth();
  const isCollapsed = state === 'collapsed';
  const navigationItems = NAVIGATION_ITEMS.filter(item => hasView(item.section));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-center">
          {isCollapsed ? (
            <img
              src="/small_logo.jpg"
              alt="Impact Hours Tracker"
              className="h-10 w-10 rounded-xl object-cover"
            />
          ) : (
            <img
              src="/logo_ipc.png"
              alt="Impact Hours Tracker"
              className="h-10 w-auto animate-fade-in"
            />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider px-3 mb-2">Navigation</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-11">
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground shadow-md"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!isCollapsed && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-2">
        {!isCollapsed && employee && (
          <div className="px-3 py-2 text-sm text-sidebar-muted">
            <p className="font-medium text-sidebar-foreground">{employee.name}</p>
            <p className="text-xs">{isAdmin ? 'Administrator' : isManager ? 'Manager' : 'Employee'}</p>
          </div>
        )}
        <Button variant="ghost" size={isCollapsed ? 'icon' : 'default'} onClick={signOut} className="w-full text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent">
          <LogOut className="h-5 w-5" />
          {!isCollapsed && <span className="ml-2">Sign Out</span>}
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="w-full h-10 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent">
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
