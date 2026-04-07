import { Inbox, Bot, Wallet, Plug, Settings, ChevronLeft, Users, MessageSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: Inbox },
  { title: "Smart Inbox", url: "/inbox", icon: MessageSquare },
  { title: "AI Command Center", url: "/ai", icon: Bot },

  { title: "Financial Hub", url: "/finance", icon: Wallet },
  { title: "Integrations", url: "/integrations", icon: Plug },
  { title: "Directory", url: "/directory", icon: Users },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  // ── Dynamic branding ────────────────────────────────────────────────────────
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  const companyName = user?.companyName || "MSME 360";
  const initials = companyName.substring(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary-foreground">{initials}</span>
              </div>
              <span className="font-semibold text-foreground text-sm truncate mr-2">{companyName}</span>
            </div>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center mx-auto">
              <span className="text-sm font-bold text-primary-foreground">{initials}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full h-9 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
