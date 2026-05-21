import { Clock, Calendar, Briefcase, Users, FileText, UserCircle, ChevronLeft, ChevronRight, LogOut, LayoutDashboard, BarChart3 } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const adminNavigationItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Weekly Log', url: '/timesheet', icon: Clock },
  { title: 'History', url: '/history', icon: Calendar },
  { title: 'My Profile', url: '/profile', icon: UserCircle },
  { title: 'Projects', url: '/projects', icon: Briefcase },
  { title: 'Clients', url: '/clients', icon: Users },
  { title: 'Employees', url: '/employees', icon: UserCircle },
  { title: 'Invoices', url: '/invoices', icon: FileText },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
];

const employeeNavigationItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Weekly Log', url: '/timesheet', icon: Clock },
  { title: 'History', url: '/history', icon: Calendar },
  { title: 'My Profile', url: '/profile', icon: UserCircle },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const { isAdmin, employee, signOut } = useAuth();
  const isCollapsed = state === 'collapsed';
  const navigationItems = isAdmin ? adminNavigationItems : employeeNavigationItems;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
            <Clock className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col animate-fade-in">
              <span className="text-lg font-bold text-sidebar-foreground">Horas+</span>
              <span className="text-xs text-sidebar-muted">Time Tracking</span>
            </div>
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
            <p className="text-xs">{isAdmin ? 'Administrator' : 'Employee'}</p>
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
