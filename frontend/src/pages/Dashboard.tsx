import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditDraftModal } from "@/components/EditDraftModal";
import {
  Clock, CheckCircle, Timer, Check, Pencil, Trash2,
  TrendingUp, MessageSquare, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Helper: read stored user ────────────────────────────────────────────────
function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw) as {
      ownerName: string;
      companyName: string;
      businessType?: string;
    };
  } catch {
    return null;
  }
}

// ── Time-based greeting ─────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Removed mock metrics array
// ── Platform config (no emojis — using text labels) ─────────────────────────
type Platform = "WhatsApp" | "Instagram" | "Facebook" | "Email";

const platformConfig: Record<
  Platform,
  { variant: "whatsapp" | "instagram" | "facebook" | "email"; label: string }
> = {
  WhatsApp:  { variant: "whatsapp",  label: "WhatsApp"  },
  Instagram: { variant: "instagram", label: "Instagram" },
  Facebook:  { variant: "facebook",  label: "Facebook"  },
  Email:     { variant: "email",     label: "Email"     },
};

// Removed mock requests

// ── Component ───────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [editModal, setEditModal] = useState<{
    open: boolean;
    request: any | null;
  }>({ open: false, request: null });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  const [requests, setRequests] = useState<any[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch recent events to calculate metrics
        const { data, error } = await apiFetch<any[]>('/events?limit=200');
        
        if (error) {
          console.warn('⚠️ Dashboard partial load error:', error);
          setLoading(false);
          return;
        }

        if (data && Array.isArray(data)) {
          // Filter messages for the list
          const msgs = data.filter((d: any) => d.type === 'CUSTOMER_MSG').map((d: any) => ({
            id: d._id,
            name: d.content?.name || "Customer",
            platform: (d.content?.platform || "WhatsApp") as Platform,
            time: d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "Recent",
            initials: (d.content?.name || "CC").substring(0, 2).toUpperCase(),
            message: d.content?.message || d.content?.text || "New message received",
            aiDraft: d.content?.aiDraft || "Generating draft...",
          }));
          setRequests(msgs);

          // Count resolved today (Invoices + Completed as a proxy)
          const today = new Date().setHours(0,0,0,0);
          const resolved = data.filter((d: any) => {
            if (!d.timestamp) return false;
            const dDate = new Date(d.timestamp).setHours(0,0,0,0);
            const s = d.status?.toUpperCase();
            return dDate === today && (s === 'PAID' || s === 'APPROVED' || s === 'EXECUTED');
          });
          setResolvedCount(resolved.length);
        }
      } catch (err) {
        console.error('🔥 Dashboard crash prevented:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const user        = getStoredUser();
  const ownerName   = user?.ownerName   ?? "there";
  const companyName = user?.companyName ?? "Your Company";

  const pendingCount = requests.length;
  const dynamicMetrics = [
    {
      label: "Pending Requests",
      value: pendingCount.toString(),
      change: `${pendingCount} active`,
      icon: Clock,
      iconClass: "text-primary bg-primary/10",
    },
    {
      label: "Resolved Today",
      value: resolvedCount.toString(),
      change: "Tracking active",
      icon: CheckCircle,
      iconClass: "text-success bg-success/10",
    },
    {
      label: "Avg Response",
      value: "< 1m",
      change: "AI Powered",
      icon: Timer,
      iconClass: "text-warning bg-warning/10",
    },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* ── Greeting ── */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {ownerName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what needs your attention at{" "}
            <span className="font-medium text-foreground">{companyName}</span> today.
          </p>
        </div>

        {/* ── Metrics ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {dynamicMetrics.map((m) => (
            <Card key={m.label} className="p-5 border-0 shadow-premium bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {m.label}
                  </p>
                  <p className="text-3xl font-bold text-foreground mt-1">{m.value}</p>
                </div>
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${m.iconClass}`}>
                  <m.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-success" /> {m.change}
              </p>
            </Card>
          ))}
        </div>

        {/* ── Customer Requests ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Customer Requests</h2>
            <Badge variant="secondary" className="text-xs">
              {requests.length}
            </Badge>
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="text-muted-foreground text-sm text-center py-10">Loading requests...</p>
            ) : requests.length === 0 ? (
            ) : requests.map((req) => {
              const expanded = expandedId === req.id;
              const cfg      = platformConfig[req.platform];

              return (
                <Card
                  key={req.id}
                  className="border-0 shadow-premium bg-card hover:shadow-elevated transition-all duration-200 overflow-hidden"
                >
                  {/* Main row */}
                  <div className="flex items-start gap-4 p-4 sm:p-5">
                    <div className="shrink-0 h-10 w-10 rounded-full gradient-primary flex items-center justify-center">
                      <span className="text-xs font-bold text-primary-foreground">
                        {req.initials}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{req.name}</span>
                        {cfg ? (
                          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
                            {cfg.label}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Message
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          {req.time}
                        </span>
                      </div>

                      <p className="text-sm text-foreground mt-1.5 leading-relaxed">
                        "{req.message}"
                      </p>

                      {/* AI Draft */}
                      <div className="mt-3 p-3 rounded-lg bg-accent/50 border border-accent">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[11px] font-semibold text-primary">
                            AI Draft Reply
                          </span>
                        </div>
                        <p
                          className={`text-sm text-muted-foreground leading-relaxed ${
                            expanded ? "" : "line-clamp-2"
                          }`}
                        >
                          {req.aiDraft}
                        </p>
                        <button
                          onClick={() => setExpandedId(expanded ? null : req.id)}
                          className="text-[11px] text-primary font-medium mt-1 flex items-center gap-0.5 hover:underline"
                        >
                          {expanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Read full reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 px-4 sm:px-5 pb-4 pt-0">
                    <Button variant="success" size="sm" className="h-8 text-xs rounded-lg">
                      <Check className="h-3 w-3" /> Approve & Send
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs rounded-lg"
                      onClick={() => setEditModal({ open: true, request: req })}
                    >
                      <Pencil className="h-3 w-3" /> Edit Draft
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {editModal.request && (
        <EditDraftModal
          open={editModal.open}
          onClose={() => setEditModal({ open: false, request: null })}
          platform={editModal.request.platform}
          customerName={editModal.request.name}
          initialDraft={editModal.request.aiDraft}
        />
      )}
    </AppLayout>
  );
};

export default Dashboard;
