import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import {
  Bell,
  ChevronDown,
  LogOut,
  Building2,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Plug,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
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

// ── Notifications are derived from real tenant data, never hard-coded ─────
interface ConversationSummary {
  id: string;
  provider: string | null;
  platform: string;
  customer: { name: string };
  lastMessage: {
    text: string;
    timestamp: string;
    direction: string;
    deliveryStatus: string | null;
  } | null;
  unreadCount: number;
  status: string;
}

interface ConnectionSummary {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  lastError: string | null;
}

interface IntegrationStatusLite {
  connections?: ConnectionSummary[];
}

interface Notice {
  id: string;
  kind: "failed" | "unread" | "connection";
  title: string;
  description: string;
  time: string;
  ts: number;
  href: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  whatsapp: "WhatsApp",
  facebook: "Messenger",
  instagram: "Instagram",
};

function providerLabel(value?: string | null) {
  if (!value) return "Channel";
  return PROVIDER_LABELS[value] || value;
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(value: string | undefined, max = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState<string | null>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    let cancelled = false;

    async function loadNotices() {
      setNoticesLoading(true);
      setNoticesError(null);
      const [conversationResult, statusResult] = await Promise.all([
        apiFetch<{ conversations: ConversationSummary[] }>("/messages/conversations?limit=100"),
        apiFetch<IntegrationStatusLite>("/integrations/status"),
      ]);
      if (cancelled) return;

      const found: Notice[] = [];

      if (conversationResult.data?.conversations) {
        for (const conversation of conversationResult.data.conversations) {
          const ts = new Date(conversation.lastMessage?.timestamp || 0).getTime();

          if (conversation.lastMessage?.deliveryStatus === "failed") {
            found.push({
              id: `failed:${conversation.id}`,
              kind: "failed",
              title: `${providerLabel(conversation.provider)} reply failed`,
              description: truncate(conversation.lastMessage.text) || "Open the inbox to review and retry.",
              time: relativeTime(conversation.lastMessage.timestamp),
              ts: Number.isFinite(ts) ? ts : 0,
              href: "/inbox",
            });
          } else if (conversation.unreadCount > 0) {
            found.push({
              id: `unread:${conversation.id}`,
              kind: "unread",
              title: `${conversation.customer?.name || "A customer"} is waiting`,
              description: `${conversation.unreadCount} unread ${
                conversation.unreadCount === 1 ? "message" : "messages"
              } on ${providerLabel(conversation.provider) || conversation.platform}.`,
              time: relativeTime(conversation.lastMessage?.timestamp),
              ts: Number.isFinite(ts) ? ts : 0,
              href: "/inbox",
            });
          }
        }
      }

      if (statusResult.data?.connections) {
        for (const connection of statusResult.data.connections) {
          if (connection.status === "connected" && !connection.lastError) continue;
          found.push({
            id: `connection:${connection.id}`,
            kind: "connection",
            title: `${providerLabel(connection.provider)} needs attention`,
            description:
              connection.lastError ||
              `${connection.displayName || "This account"} is ${connection.status}. Reconnect it in Integrations.`,
            time: "",
            ts: 0,
            href: "/integrations",
          });
        }
      }

      if (conversationResult.error && statusResult.error) {
        setNoticesError("Could not load notifications right now.");
      } else {
        const order: Record<Notice["kind"], number> = { failed: 0, connection: 1, unread: 2 };
        found.sort((a, b) => order[a.kind] - order[b.kind] || b.ts - a.ts);
        setNotices(found.slice(0, 8));
      }
      setNoticesLoading(false);
    }

    loadNotices();
    return () => {
      cancelled = true;
    };
  }, [notificationsOpen]);

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
              {/* Notification bell — backed by real inbox and connection data */}
              <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-xl hover:bg-primary/5"
                    aria-label="Open notifications"
                  >
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    {!noticesLoading && notices.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[9px] font-semibold text-primary-foreground flex items-center justify-center ring-2 ring-white">
                        {notices.length > 9 ? "9+" : notices.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-0 shadow-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                    <p className="text-sm font-semibold text-foreground">Notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {noticesLoading
                        ? "Checking your workspace…"
                        : notices.length > 0
                          ? `${notices.length} item${notices.length === 1 ? "" : "s"} need attention`
                          : "Customer messages and channel health"}
                    </p>
                  </div>

                  <div className="max-h-80 overflow-y-auto py-1">
                    {noticesLoading ? (
                      <div className="px-4 py-3 space-y-3" aria-busy="true">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex gap-3">
                            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <Skeleton className="h-3.5 w-2/3" />
                              <Skeleton className="h-3 w-full" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : noticesError ? (
                      <div className="px-4 py-8 text-center">
                        <AlertTriangle className="h-8 w-8 mx-auto text-amber-500/70 mb-2" />
                        <p className="text-sm text-muted-foreground">{noticesError}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-xs"
                          onClick={() => setNotificationsOpen(false)}
                        >
                          Close
                        </Button>
                      </div>
                    ) : notices.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/70 mb-2" />
                        <p className="text-sm font-medium text-foreground">You&apos;re all caught up</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          No unread threads or channel issues right now.
                        </p>
                      </div>
                    ) : (
                      notices.map((notice) => {
                        const Icon =
                          notice.kind === "failed"
                            ? AlertTriangle
                            : notice.kind === "connection"
                              ? Plug
                              : MessageSquare;
                        const tone =
                          notice.kind === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : notice.kind === "connection"
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-primary/10 text-primary";

                        return (
                          <button
                            key={notice.id}
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false);
                              navigate(notice.href);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-primary/[0.04] transition-colors flex gap-3 border-b border-slate-50 last:border-0 focus-visible:outline-none focus-visible:bg-primary/[0.06]"
                          >
                            <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{notice.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notice.description}
                              </p>
                              {notice.time ? (
                                <p className="text-[10px] text-muted-foreground mt-1">{notice.time}</p>
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {!noticesLoading && notices.length > 0 && (
                    <div className="border-t border-slate-100 p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs justify-center"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate("/inbox");
                        }}
                      >
                        Open Smart Inbox
                      </Button>
                    </div>
                  )}
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
