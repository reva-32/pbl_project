import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, ChevronDown, LogOut, Building2 } from "lucide-react";
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
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Header ── */}
          <header className="h-14 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground hidden sm:block">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Notification bell */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              </Button>

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

                <DropdownMenuContent align="end" className="w-56">
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
