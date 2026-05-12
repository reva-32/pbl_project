import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import {
  IndianRupee,
  MessageSquare,
  Instagram,
  Facebook,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Send,
  X,
  Radio,
  Inbox,
  BarChart3,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const platformIcon = (platform: string) => {
  if (platform === "WhatsApp") return <MessageSquare className="h-4 w-4 text-emerald-600" />;
  if (platform === "Instagram") return <Instagram className="h-4 w-4 text-pink-600" />;
  if (platform === "Facebook") return <Facebook className="h-4 w-4 text-slate-600" />;
  return <MessageSquare className="h-4 w-4" />;
};

const SmartInbox = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadMessages = async () => {
    setLoading(true);
    const { data, error } = await apiFetch<any[]>("/events?type=CUSTOMER_MSG");
    if (error) {
      toast.error(error);
    } else {
      const sorted = (data || []).sort((a, b) => {
        if (a.status === "PENDING" && b.status !== "PENDING") return -1;
        if (a.status !== "PENDING" && b.status === "PENDING") return 1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      setMessages(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleReply = async (eventId: string) => {
    if (!replyText.trim()) return;

    setIsSending(true);
    const { error } = await apiFetch("/messages/reply", {
      method: "POST",
      body: JSON.stringify({ eventId, message: replyText }),
    });

    if (error) {
      toast.error(`Failed to send reply: ${error}`);
    } else {
      toast.success("Reply sent successfully via WhatsApp!");
      setReplyText("");
      setReplyingTo(null);
      loadMessages();
    }
    setIsSending(false);
  };

  const markAsRead = async (id: string) => {
    setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, status: "RESOLVED" } : m)));
    toast.success("Message marked as resolved");
  };

  const analytics = useMemo(() => {
    const pending = messages.filter((m) => m.status === "PENDING").length;
    const urgent = messages.filter(
      (m) => m.status === "PENDING" && m.content?.category === "URGENT",
    ).length;
    const payment = messages.filter(
      (m) => m.status === "PENDING" && m.content?.category === "PAYMENT",
    ).length;
    return { pending, urgent, payment, total: messages.length };
  }, [messages]);

  return (
    <AppLayout title="Smart Inbox">
      <motion.div
        className="max-w-6xl mx-auto space-y-8 pb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-2">
              Unified inbox
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Smart Inbox
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
              AI is monitoring your business channels in real time. Messages are classified, summarized,
              and ready for a calm review workflow.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl shrink-0 border-slate-200/90 bg-white/80 backdrop-blur-sm hover:shadow-md transition-all duration-300"
            onClick={() => loadMessages()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Open threads",
              value: loading ? "—" : String(analytics.pending),
              sub: "Awaiting action",
              icon: Inbox,
            },
            {
              label: "Urgent signals",
              value: loading ? "—" : String(analytics.urgent),
              sub: "High priority (pending)",
              icon: AlertCircle,
            },
            {
              label: "Payment-related",
              value: loading ? "—" : String(analytics.payment),
              sub: "Tagged by AI",
              icon: BarChart3,
            },
          ].map((card) => (
            <GlassCard key={card.label} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary/80" />
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-2">{card.sub}</p>
            </GlassCard>
          ))}
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-2xl" />
                ))}
              </motion.div>
            ) : messages.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassCard hover={false} className="p-10 sm:p-14 text-center border-dashed border-slate-200/90">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/10 shadow-inner">
                    <Radio className="h-10 w-10 text-primary animate-pulse" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Channels quiet — for now</h3>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
                    When WhatsApp or other connected channels receive traffic, threads appear here with
                    AI summaries and suggested replies. Nothing to triage yet.
                  </p>
                  <div className="mt-8 flex justify-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Monitoring active · inbox healthy
                  </div>
                </GlassCard>
              </motion.div>
            ) : (
              messages.map((msg, idx) => (
                <motion.div
                  key={msg._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard
                    className={`p-0 overflow-hidden ${
                      msg.content?.priority === "HIGH" && msg.status === "PENDING"
                        ? "ring-1 ring-destructive/15 shadow-destructive/5"
                        : ""
                    } ${msg.status === "RESOLVED" ? "opacity-75" : ""}`}
                  >
                    <div className="flex flex-col sm:flex-row">
                      <div
                        className={`w-full h-1 sm:w-1.5 sm:h-auto shrink-0 ${
                          msg.status === "RESOLVED"
                            ? "bg-slate-200"
                            : msg.content?.category === "URGENT"
                              ? "bg-destructive"
                              : msg.content?.category === "PAYMENT"
                                ? "bg-primary"
                                : "bg-slate-200/80"
                        }`}
                      />

                      <div className="flex-1 p-5 sm:p-6 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase font-bold py-0 h-6 rounded-lg border-slate-200/90"
                              >
                                {platformIcon(msg.content?.platform)}
                                <span className="ml-1">{msg.content?.platform}</span>
                              </Badge>
                              {msg.status === "RESOLVED" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 text-[10px] uppercase font-bold py-0 h-6 rounded-lg">
                                  Resolved
                                </Badge>
                              ) : (
                                <>
                                  {msg.content?.category === "URGENT" && (
                                    <Badge
                                      variant="destructive"
                                      className="text-[10px] uppercase font-bold py-0 h-6 rounded-lg gap-1"
                                    >
                                      <AlertCircle className="h-3 w-3" /> Urgent
                                    </Badge>
                                  )}
                                  {msg.content?.category === "PAYMENT" && (
                                    <Badge className="bg-primary/10 text-primary border border-primary/15 text-[10px] uppercase font-bold py-0 h-6 rounded-lg gap-1">
                                      <IndianRupee className="h-3 w-3" /> Payment
                                    </Badge>
                                  )}
                                </>
                              )}
                              <span className="text-[11px] text-muted-foreground ml-auto">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            <div className="flex flex-col">
                              <p className="font-semibold text-foreground">
                                Message from {msg.content?.sender}
                              </p>
                              <p className="text-sm text-foreground/85 mt-1 leading-relaxed">
                                &ldquo;{msg.content?.text}&rdquo;
                              </p>
                            </div>

                            <div className="rounded-xl bg-primary/[0.06] border border-primary/10 p-3.5">
                              <p className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                AI summary
                              </p>
                              <p className="text-xs text-foreground/90 leading-relaxed">
                                {msg.content?.summary}
                              </p>
                            </div>
                          </div>

                          {msg.status !== "RESOLVED" && (
                            <div className="flex sm:flex-col gap-2 justify-end sm:justify-center border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
                              <Button
                                size="sm"
                                className="h-9 rounded-xl"
                                onClick={() => markAsRead(msg._id)}
                              >
                                Resolve
                              </Button>
                              <Button
                                variant={replyingTo === msg._id ? "secondary" : "outline"}
                                size="sm"
                                className="h-9 rounded-xl"
                                onClick={() => setReplyingTo(replyingTo === msg._id ? null : msg._id)}
                              >
                                {replyingTo === msg._id ? "Cancel" : "Reply"}
                              </Button>
                            </div>
                          )}
                        </div>

                        {replyingTo === msg._id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="pt-4 border-t border-slate-100"
                          >
                            <div className="flex gap-2 flex-col sm:flex-row">
                              <Input
                                placeholder="Type your WhatsApp reply…"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleReply(msg._id)}
                                className="rounded-xl bg-white/80 border-slate-200/90 focus-visible:ring-primary/25"
                                disabled={isSending}
                              />
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  size="icon"
                                  className="rounded-xl shrink-0"
                                  onClick={() => handleReply(msg._id)}
                                  disabled={isSending || !replyText.trim()}
                                >
                                  {isSending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-xl shrink-0"
                                  onClick={() => setReplyingTo(null)}
                                  disabled={isSending}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 italic">
                              Replying to {msg.content?.sender} via WhatsApp Business API
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AppLayout>
  );
};

export default SmartInbox;
