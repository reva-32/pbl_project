import { useState } from "react";
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

// ── Metrics data ────────────────────────────────────────────────────────────
const metrics = [
  {
    label: "Pending Requests",
    value: "24",
    change: "+3 today",
    icon: Clock,
    iconClass: "text-primary bg-primary/10",
  },
  {
    label: "Resolved Today",
    value: "18",
    change: "+5 vs yesterday",
    icon: CheckCircle,
    iconClass: "text-success bg-success/10",
  },
  {
    label: "Avg Response",
    value: "4.2m",
    change: "12% faster",
    icon: Timer,
    iconClass: "text-warning bg-warning/10",
  },
];

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

// ── Sample requests ─────────────────────────────────────────────────────────
const requests = [
  {
    id: 1, name: "Ravi Kumar", platform: "WhatsApp" as Platform, time: "2 min ago", initials: "RK",
    message: "Hi, I need pricing for 500 ceramic mugs with our company logo. Can you share a quote?",
    aiDraft: "Hi Ravi! Thanks for reaching out. For 500 ceramic mugs with custom logo printing, our pricing is Rs.85/unit (total Rs.42,500). This includes single-color logo printing. For multi-color, it is Rs.95/unit. Delivery in 7-10 business days. Want me to send a formal quotation?",
  },
  {
    id: 2, name: "Sneha Patel", platform: "Instagram" as Platform, time: "8 min ago", initials: "SP",
    message: "Do you have Diwali gift hampers? What's the delivery time if I order 50 sets?",
    aiDraft: "Hi Sneha! Yes, we have beautiful Diwali gift hampers starting at Rs.450/set. For 50 sets, we can deliver within 5 days via express shipping (Rs.2,000 extra) or 8 days via standard (free). Would you like to see our hamper catalog?",
  },
  {
    id: 3, name: "Arjun Mehta", platform: "Facebook" as Platform, time: "15 min ago", initials: "AM",
    message: "Need catering for a corporate event — 200 guests, vegetarian and non-veg options. What's the cost?",
    aiDraft: "Hello Arjun! For 200 guests with both veg and non-veg options, our packages start at Rs.650/plate (veg) and Rs.850/plate (non-veg). This includes appetizers, main course, desserts, and service staff. Shall I send a detailed menu and quotation?",
  },
  {
    id: 4, name: "Priya Sharma", platform: "Email" as Platform, time: "32 min ago", initials: "PS",
    message: "Following up on invoice #1042. When can I expect it? Also, do you offer NET 30 payment terms?",
    aiDraft: "Hi Priya, Invoice #1042 has been generated and is attached to this email. Regarding payment terms — yes, we do offer NET 30 for orders above Rs.50,000. Your current order qualifies. Please let me know if you need any changes to the invoice.",
  },
  {
    id: 5, name: "Deepak Verma", platform: "WhatsApp" as Platform, time: "1 hr ago", initials: "DV",
    message: "The Bluetooth speaker I bought last week has a crackling sound. What's your return policy?",
    aiDraft: "Hi Deepak, sorry to hear about the issue! All electronics come with a 15-day return/replacement policy. Since your purchase is within that window, we can arrange a free pickup and send a replacement. Would you like me to initiate the process?",
  },
];

// ── Component ───────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [editModal, setEditModal] = useState<{
    open: boolean;
    request: (typeof requests)[0] | null;
  }>({ open: false, request: null });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const user        = getStoredUser();
  const ownerName   = user?.ownerName   ?? "there";
  const companyName = user?.companyName ?? "Your Company";

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
          {metrics.map((m) => (
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
            {requests.map((req) => {
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
                        <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
                          {cfg.label}
                        </Badge>
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
