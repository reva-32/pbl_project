import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { Bell, ChevronDown, LogOut, Building2, Sparkles, FileText, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}


// ── Helper: read user from localStorage ───────────────────────────────────
function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw) as {
      email: string;
      companyName: string;
      ownerName: string;
      phone: string;
      businessType?: string;
      city?: string;
    };
  } catch {
    return null;
  }
}

// ── Helper: initials from owner name ──────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const navigate = useNavigate();
  const user = getStoredUser();

  const companyName = user?.companyName ?? "My Company";
  const ownerName   = user?.ownerName   ?? "User";
  const initials    = getInitials(ownerName);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[hsl(220_18%_95%)] bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,hsl(225_84%_55%/0.08),transparent)]">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Header ── */}
          <header className="h-14 flex items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-3 sm:px-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <SidebarTrigger className="text-muted-foreground shrink-0" />
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground truncate min-w-0 max-w-[38vw] sm:max-w-none md:max-w-[220px] lg:max-w-xs">
                {title}
              </h1>
              <div className="ml-auto md:ml-4 flex-1 max-w-md flex justify-end">
                <CommandPalette />
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-xl hover:bg-primary/5"
                aria-label="Open search"
                onClick={() => window.dispatchEvent(new Event("msme:command-palette"))}
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </Button>
              {/* Notification bell */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-xl hover:bg-primary/5">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary pulse-ring" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-0 shadow-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                    <p className="text-sm font-semibold text-foreground">Notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI and business updates (demo)</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    <button type="button" className="w-full text-left px-4 py-3 hover:bg-primary/[0.04] transition-colors flex gap-3 border-b border-slate-50 last:border-0">
                      <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">AI summary ready</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Your weekly business digest was generated.</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Just now</p>
                      </div>
                    </button>
                    <button type="button" className="w-full text-left px-4 py-3 hover:bg-primary/[0.04] transition-colors flex gap-3 border-b border-slate-50 last:border-0">
                      <div className="mt-0.5 h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Invoice reminder</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Follow up on outstanding invoices from Financial Hub.</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Today</p>
                      </div>
                    </button>
                    <button type="button" className="w-full text-left px-4 py-3 hover:bg-primary/[0.04] transition-colors flex gap-3">
                      <div className="mt-0.5 h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Inbox health</p>
                        <p className="text-xs text-muted-foreground mt-0.5">No urgent threads detected in the last hour.</p>
                        <p className="text-[10px] text-muted-foreground mt-1">1h ago</p>
                      </div>
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User / Company Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center">
                      <span className="text-xs font-medium text-primary-foreground">
                        {initials}
                      </span>
                    </div>
                    <div className="hidden sm:flex flex-col items-start leading-none">
                      <span className="text-xs font-semibold text-foreground">
                        {ownerName}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {companyName}
                      </span>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-lg">
                  {/* Company info header */}
                  <DropdownMenuLabel className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {companyName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {ownerName}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* ── Page content ── */}
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
