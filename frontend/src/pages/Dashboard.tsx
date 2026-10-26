import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { GlassCard } from "@/components/ui/glass-card";
import { EditDraftModal } from "@/components/EditDraftModal";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle,
  Timer,
  Check,
  Pencil,
  Trash2,
  TrendingUp,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  ArrowUpRight,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
} from "recharts";

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type Platform = "WhatsApp" | "Instagram" | "Facebook" | "Email";

const platformConfig: Record<
  Platform,
  { variant: "whatsapp" | "instagram" | "facebook" | "email"; label: string }
> = {
  WhatsApp: { variant: "whatsapp", label: "WhatsApp" },
  Instagram: { variant: "instagram", label: "Instagram" },
  Facebook: { variant: "facebook", label: "Facebook" },
  Email: { variant: "email", label: "Email" },
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

const Dashboard = () => {
  const [editModal, setEditModal] = useState<{
    open: boolean;
    request: any | null;
  }>({ open: false, request: null });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [aiProcessedToday, setAiProcessedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const pendingCount = requests.length;

  async function sendReply(eventId: string, text: string) {
    setSendingId(eventId);
    try {
      const { error } = await apiFetch<{ success: boolean }>("/messages/reply", {
        method: "POST",
        body: JSON.stringify({ eventId, message: text }),
      });
      if (error) {
        toast.error(error);
        throw new Error(error);
      }
      toast.success("Reply sent");
      setRequests((prev) => prev.filter((request) => request.id !== eventId));
      setResolvedCount((count) => count + 1);
      setEditModal({ open: false, request: null });
    } finally {
      setSendingId(null);
    }
  }

  async function dismissRequest(eventId: string) {
    setDismissingId(eventId);
    const { error } = await apiFetch(`/events/${eventId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    setDismissingId(null);
    if (error) {
      toast.error(error);
      return;
    }
    setRequests((prev) => prev.filter((request) => request.id !== eventId));
    toast.success("Dismissed from the dashboard");
  }

  const efficiencyScore = useMemo(() => {
    const base = 82;
    const bump = Math.min(16, pendingCount * 2 + resolvedCount);
    return Math.min(98, base + bump);
  }, [pendingCount, resolvedCount]);

  const chartData = useMemo(() => {
    const out: { label: string; activity: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = startOfDay(d);
      const end = start + 86400000;
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      const activity = events.filter((e) => {
        if (!e.timestamp) return false;
        const t = new Date(e.timestamp).getTime();
        return t >= start && t < end;
      }).length;
      const revenue = events
        .filter((e) => {
          if (e.type !== "INVOICE" || !e.timestamp) return false;
          const t = new Date(e.timestamp).getTime();
          return t >= start && t < end;
        })
        .reduce((sum, e) => sum + (parseFloat(e.content?.amount) || 0), 0);
      out.push({ label, activity, revenue });
    }
    return out;
  }, [events]);

  const invoiceStats = useMemo(() => {
    const inv = events.filter((e) => e.type === "INVOICE");
    const total = inv.length;
    const paid = inv.filter((e) =>
      ["PAID", "APPROVED"].includes(String(e.status || "").toUpperCase()),
    ).length;
    const outstanding = total - paid;
    const recovery = total === 0 ? 0 : Math.round((paid / total) * 100);
    return { total, paid, outstanding, recovery };
  }, [events]);

  const activityFeed = useMemo(() => {
    return [...events]
      .filter((e) => e.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8)
      .map((e) => ({
        id: e._id,
        type: e.type || "EVENT",
        title:
          e.type === "CUSTOMER_MSG"
            ? e.content?.sender || e.content?.name || "Customer message"
            : e.type === "INVOICE"
              ? `Invoice · ${e.content?.client || "Client"}`
              : String(e.type || "Update").replace(/_/g, " "),
        sub:
          e.type === "CUSTOMER_MSG"
            ? (e.content?.text || "").slice(0, 72)
            : e.type === "INVOICE"
              ? `₹${e.content?.amount ?? "—"} · ${e.status || "—"}`
              : "",
        time: new Date(e.timestamp).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
  }, [events]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const { data, error } = await apiFetch<any[]>("/events?limit=200");

        if (error) {
          console.warn("⚠️ Dashboard partial load error:", error);
          setLoading(false);
          return;
        }

        if (data && Array.isArray(data)) {
          setEvents(data);

          const msgs = data
            .filter(
              (d: any) =>
                d.type === "CUSTOMER_MSG" &&
                String(d.status || "PENDING").toUpperCase() === "PENDING" &&
                d.content?.direction !== "outbound",
            )
            .map((d: any) => ({
              id: d._id,
              name: d.content?.name || "Customer",
              platform: (d.content?.platform || "WhatsApp") as Platform,
              time: d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "Recent",
              initials: (d.content?.name || "CC").substring(0, 2).toUpperCase(),
              message: d.content?.message || d.content?.text || "New message received",
              aiDraft: d.content?.aiDraft || "",
            }));
          setRequests(msgs);

          const today = startOfDay(new Date());
          const resolved = data.filter((d: any) => {
            if (!d.timestamp) return false;
            const dDate = startOfDay(new Date(d.timestamp));
            const s = d.status?.toUpperCase();
            return dDate === today && (s === "PAID" || s === "APPROVED" || s === "EXECUTED");
          });
          setResolvedCount(resolved.length);

          const aiToday = data.filter((d: any) => {
            if (d.type !== "CUSTOMER_MSG" || !d.timestamp) return false;
            return startOfDay(new Date(d.timestamp)) === today;
          }).length;
          setAiProcessedToday(aiToday);
        }
      } catch (err) {
        console.error("🔥 Dashboard crash prevented:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const user = getStoredUser();
  const ownerName = user?.ownerName ?? "there";
  const companyName = user?.companyName ?? "Your Company";

  const recommendations = [
    {
      title: "Triage high-priority threads first",
      body: "Resolve urgent customer messages before end of day to protect SLA.",
      icon: Zap,
    },
    {
      title: "Invoice recovery trend",
      body:
        invoiceStats.total === 0
          ? "Generate your first invoice from AI Command Center to unlock recovery tracking."
          : `${invoiceStats.recovery}% of recent invoices are marked paid — keep following up on open items.`,
      icon: TrendingUp,
    },
    {
      title: "Weekly business health",
      body: "Review Financial Hub GST and invoice status before your filing window.",
      icon: BarChart3,
    },
  ];

  return (
    <AppLayout title="Dashboard">
      <motion.div
        className="max-w-7xl mx-auto space-y-8 md:space-y-10 pb-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-primary/80 mb-2">
              Overview
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {getGreeting()}, {ownerName}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
              Operating view for{" "}
              <span className="font-medium text-foreground">{companyName}</span> — customer
              signals, cash posture, and AI workload in one calm workspace.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-xs font-medium border-primary/20 bg-primary/[0.06] text-primary"
            >
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              AI workspace
            </Badge>
          </div>
        </motion.div>

        {/* KPI row */}
        <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              label: "Pending requests",
              value: pendingCount,
              sub: `${pendingCount} active threads`,
              icon: Clock,
              tone: "text-primary bg-primary/10",
            },
            {
              label: "Resolved today",
              value: resolvedCount,
              sub: "Completed items today",
              icon: CheckCircle,
              tone: "text-emerald-700 bg-emerald-500/10",
            },
            {
              label: "AI processed today",
              value: aiProcessedToday,
              sub: "Conversations classified",
              icon: Sparkles,
              tone: "text-sky-800 bg-sky-500/10",
            },
            {
              label: "Response efficiency",
              value: efficiencyScore,
              sub: "Estimated from recent activity",
              icon: Timer,
              tone: "text-amber-800 bg-amber-500/10",
              suffix: "%",
            },
          ].map((m) => (
            <GlassCard key={m.label} className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold text-foreground mt-2 tabular-nums tracking-tight">
                    {loading ? (
                      <Skeleton className="h-10 w-20 rounded-lg" />
                    ) : (
                      <AnimatedCounter
                        value={m.value}
                        suffix={"suffix" in m ? (m as { suffix: string }).suffix : ""}
                      />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    {m.sub}
                  </p>
                </div>
                <div
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${m.tone}`}
                >
                  <m.icon className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>
          ))}
        </motion.div>

        {/* Charts + AI insights */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <motion.div variants={item} className="xl:col-span-2 space-y-6">
            <GlassCard className="p-5 sm:p-6 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground tracking-tight">
                    Revenue & activity
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Seven-day pulse from your workspace events and invoices.
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit rounded-full text-xs">
                  Live blend
                </Badge>
              </div>
              <div className="h-[260px] w-full min-h-[220px] -mx-1">
                {loading ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillAct" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(225 84% 55%)" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="hsl(225 84% 55%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} width={32} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid hsl(220 13% 91%)",
                          boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
                        }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="activity"
                        name="Activity"
                        stroke="hsl(225 84% 55%)"
                        fill="url(#fillAct)"
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="revenue"
                        name="Invoiced (₹)"
                        stroke="hsl(213 72% 48%)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground tracking-tight">
                    Pending customer requests
                  </h3>
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {requests.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : requests.length === 0 ? (
                  <GlassCard hover={false} className="p-10 text-center border-dashed">
                    <MessageSquare className="h-10 w-10 mx-auto text-primary/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">Inbox is clear</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      When new customer messages arrive, they will surface here with AI drafts ready
                      to review.
                    </p>
                  </GlassCard>
                ) : (
                  requests.map((req) => {
                    const expanded = expandedId === req.id;
                    const cfg = platformConfig[req.platform];

                    return (
                      <Card
                        key={req.id}
                        className="rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-sm shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
                      >
                        <div className="flex items-start gap-4 p-4 sm:p-5">
                          <div className="shrink-0 h-10 w-10 rounded-full gradient-primary flex items-center justify-center ring-2 ring-white shadow-sm">
                            <span className="text-xs font-bold text-primary-foreground">{req.initials}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{req.name}</span>
                              {cfg ? (
                                <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0 rounded-md">
                                  {cfg.label}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-md">
                                  Message
                                </Badge>
                              )}
                              <span className="text-[11px] text-muted-foreground ml-auto">{req.time}</span>
                            </div>

                            <p className="text-sm text-foreground mt-1.5 leading-relaxed">
                              &ldquo;{req.message}&rdquo;
                            </p>

                            <div className="mt-3 p-3 rounded-xl bg-primary/[0.06] border border-primary/10">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span className="text-[11px] font-semibold text-primary">AI draft reply</span>
                              </div>
                              <p
                                className={`text-sm text-muted-foreground leading-relaxed ${
                                  expanded ? "" : "line-clamp-2"
                                }`}
                              >
                                {req.aiDraft || "No AI draft is available for this message. Use Edit draft to write a reply."}
                              </p>
                              {req.aiDraft ? (
                                <button
                                  type="button"
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
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 px-4 sm:px-5 pb-4 pt-0 flex-wrap">
                          <Button
                            variant="success"
                            size="sm"
                            className="h-8 text-xs rounded-lg"
                            disabled={sendingId === req.id || !String(req.aiDraft || "").trim()}
                            onClick={() => {
                              const draft = String(req.aiDraft || "").trim();
                              if (!draft || /generating draft/i.test(draft)) {
                                toast.error("No AI draft is available yet. Edit the reply to write one.");
                                return;
                              }
                              sendReply(req.id, draft).catch(() => {});
                            }}
                          >
                            {sendingId === req.id ? (
                              <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            {sendingId === req.id ? "Sending…" : "Approve & Send"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs rounded-lg"
                            disabled={sendingId === req.id}
                            onClick={() => setEditModal({ open: true, request: req })}
                          >
                            <Pencil className="h-3 w-3" /> Edit draft
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Dismiss message from ${req.name}`}
                            title="Dismiss from dashboard"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive ml-auto"
                            disabled={dismissingId === req.id || sendingId === req.id}
                            onClick={() => dismissRequest(req.id)}
                          >
                            {dismissingId === req.id ? (
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </GlassCard>
          </motion.div>

          <motion.div variants={item} className="space-y-6">
            <GlassCard className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground tracking-tight">AI insights</h3>
              </div>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>
                    <span className="text-foreground font-medium">Workload:</span>{" "}
                    {loading ? "…" : `${aiProcessedToday} customer conversations touched by AI today.`}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>
                    <span className="text-foreground font-medium">Invoice recovery:</span>{" "}
                    {loading
                      ? "…"
                      : invoiceStats.total === 0
                        ? "No invoice events yet — ask AI to generate one."
                        : `${invoiceStats.recovery}% marked paid across ${invoiceStats.total} tracked invoices.`}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>
                    <span className="text-foreground font-medium">Response efficiency:</span>{" "}
                    {loading ? "…" : `${efficiencyScore}% — drafts ready under a minute for most threads.`}
                  </span>
                </li>
              </ul>
              <div className="mt-6 pt-5 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Invoice recovery trend
                </p>
                {loading ? (
                  <Skeleton className="h-2 w-full rounded-full" />
                ) : (
                  <Progress value={invoiceStats.recovery} className="h-2 rounded-full bg-slate-100" />
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  Paid vs total invoices in your recent event stream.
                </p>
              </div>
            </GlassCard>

            <GlassCard className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground tracking-tight">Recent activity</h3>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : activityFeed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No recent events yet.</p>
              ) : (
                <ul className="space-y-3 max-h-[320px] overflow-y-auto pr-1 scrollbar-hide">
                  {activityFeed.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 hover:bg-white hover:border-slate-200/90 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground truncate">{row.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{row.time}</span>
                      </div>
                      {row.sub ? (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{row.sub}</p>
                      ) : null}
                      <Badge variant="outline" className="mt-2 text-[10px] rounded-md">
                        {row.type}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* Smart recommendations */}
        <motion.div variants={item}>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Smart recommendations</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.map((rec, idx) => (
              <GlassCard key={rec.title} className="p-5 sm:p-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <rec.icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{rec.body}</p>
                <p className="text-[10px] text-muted-foreground/80 mt-4">Tip {idx + 1} of 3</p>
              </GlassCard>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {editModal.request && (
        <EditDraftModal
          open={editModal.open}
          onClose={() => setEditModal({ open: false, request: null })}
          platform={editModal.request.platform}
          customerName={editModal.request.name}
          initialDraft={editModal.request.aiDraft}
          onSend={(text) => sendReply(editModal.request.id, text)}
        />
      )}
    </AppLayout>
  );
};

export default Dashboard;
