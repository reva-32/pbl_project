import {
  LayoutDashboard,
  Bot,
  Wallet,
  Plug,
  Settings,
  ChevronLeft,
  Users,
  MessageSquare,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
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
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
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

  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  const companyName = user?.companyName || "MSME 360";
  const initials = companyName.substring(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/90 bg-white/90 backdrop-blur-md">
      <SidebarHeader className="p-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <motion.div
              initial={false}
              className="flex items-center gap-2 min-w-0"
            >
              <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-sm ring-1 ring-primary/10">
                <span className="text-sm font-bold text-primary-foreground">{initials}</span>
              </div>
              <span className="font-semibold text-foreground text-sm truncate mr-2 tracking-tight">
                {companyName}
              </span>
            </motion.div>
          )}
          {collapsed && (
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center mx-auto shadow-sm ring-1 ring-primary/10">
              <span className="text-sm font-bold text-primary-foreground">{initials}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                      <NavLink
                        to={item.url}
                        end
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground",
                          "transition-all duration-300 ease-out",
                          "hover:bg-slate-50/90 hover:text-foreground hover:translate-x-0.5 hover:shadow-sm",
                        )}
                        activeClassName="!bg-primary/[0.11] !text-primary !font-semibold shadow-sm ring-1 ring-primary/15"
                      >
                        <item.icon className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                        {!collapsed && <span className="truncate">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-slate-100/80">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full h-9 rounded-xl text-muted-foreground hover:bg-slate-50 hover:text-foreground transition-all duration-300"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
