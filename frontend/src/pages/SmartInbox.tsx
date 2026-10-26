import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  IndianRupee,
  MessageSquare,
  Instagram,
  Facebook,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Send,
  Radio,
  Inbox,
  BarChart3,
  Mail,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  CheckCheck,
  Clock3,
  CircleAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type Provider = "gmail" | "whatsapp" | "facebook" | "instagram";

interface InboxMessage {
  _id: string;
  status: string;
  timestamp: string;
  content: {
    provider?: Provider;
    platform?: string;
    direction?: "inbound" | "outbound";
    sender?: string;
    senderName?: string;
    senderEmail?: string;
    senderPhone?: string;
    senderId?: string;
    recipient?: string;
    text?: string;
    subject?: string;
    summary?: string;
    category?: string;
    priority?: string;
    deliveryStatus?: string;
    error?: string | null;
    conversationId?: string;
    accountId?: string;
  };
}

interface Conversation {
  id: string;
  provider: Provider | null;
  platform: string;
  accountId: string | null;
  customer: { id: string | null; name: string; email: string; phone: string };
  lastMessage: {
    id: string;
    text: string;
    timestamp: string;
    direction: "inbound" | "outbound";
    deliveryStatus: string | null;
  } | null;
  unreadCount: number;
  status: "PENDING" | "RESOLVED";
  messages: InboxMessage[];
}

interface IntegrationStatus {
  connections: Array<{ provider: Provider; status: string }>;
  gmail: { connected: boolean };
}

const FILTERS: Array<{ id: "all" | Provider; label: string }> = [
  { id: "all", label: "All" },
  { id: "gmail", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
];

const providerOf = (message: InboxMessage): Provider | null => {
  if (message.content.provider) return message.content.provider;
  const platform = (message.content.platform || "").toLowerCase();
  if (platform === "whatsapp") return "whatsapp";
  if (platform === "instagram") return "instagram";
  if (platform === "facebook" || platform === "messenger") return "facebook";
  if (platform === "email" || platform === "gmail") return "gmail";
  return null;
};

const channelLabel = (provider: Provider | null) => {
  if (provider === "gmail") return "Email";
  if (provider === "whatsapp") return "WhatsApp";
  if (provider === "facebook") return "Messenger";
  if (provider === "instagram") return "Instagram";
  return "Message";
};

const PlatformIcon = ({ provider, className = "h-4 w-4" }: { provider: Provider | null; className?: string }) => {
  if (provider === "whatsapp") return <MessageSquare className={`${className} text-emerald-600`} />;
  if (provider === "instagram") return <Instagram className={`${className} text-pink-600`} />;
  if (provider === "facebook") return <Facebook className={`${className} text-[#1877F2]`} />;
  if (provider === "gmail") return <Mail className={`${className} text-blue-500`} />;
  return <MessageSquare className={className} />;
};

const formatTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const formatDate = (value: string) => {
  try {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return formatTime(value);
    return date.toLocaleDateString([], { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
};

const deliveryBadge = (message: InboxMessage) => {
  if (message.content.direction !== "outbound") return null;
  const status = message.content.deliveryStatus;
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
        <CircleAlert className="h-3 w-3" /> Failed
      </span>
    );
  }
  if (status === "read") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600">
        <CheckCheck className="h-3 w-3" /> Read
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
        <CheckCheck className="h-3 w-3" /> Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
      <CheckCheck className="h-3 w-3" /> Sent
    </span>
  );
};

const SmartInbox = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Provider>("all");
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadConversations = async (preferredId?: string | null) => {
    setLoading(true);
    const { data, error } = await apiFetch<{ conversations: Conversation[] }>("/messages/conversations?limit=500");
    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }
    const next = data?.conversations || [];
    setConversations(next);
    setSelectedId((current) => {
      const wanted = preferredId ?? current;
      if (wanted && next.some((conversation) => conversation.id === wanted)) return wanted;
      return next[0]?.id || null;
    });
    setLoading(false);
  };

  const loadIntegrationStatus = async () => {
    const { data } = await apiFetch<IntegrationStatus>("/integrations/status");
    if (data) setIntegrationStatus(data);
  };

  useEffect(() => {
    loadConversations();
    loadIntegrationStatus();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? conversations : conversations.filter((c) => c.provider === filter)),
    [conversations, filter]
  );

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId]
  );

  const analytics = useMemo(() => {
    const messages = conversations.flatMap((conversation) => conversation.messages);
    const pendingInbound = messages.filter(
      (message) => message.content.direction !== "outbound" && message.status === "PENDING"
    );
    return {
      pending: pendingInbound.length,
      urgent: pendingInbound.filter((message) => message.content.category === "URGENT").length,
      payment: pendingInbound.filter((message) => message.content.category === "PAYMENT").length,
      total: conversations.length,
    };
  }, [conversations]);

  const replyTarget = useMemo(() => {
    if (!selected) return null;
    return [...selected.messages].reverse().find((message) => message.content.direction !== "outbound") || null;
  }, [selected]);

  const channelConnected = useMemo(() => {
    if (!selected?.provider) return true;
    if (selected.provider === "gmail") return Boolean(integrationStatus?.gmail.connected);
    return Boolean(integrationStatus?.connections.some(
      (connection) => connection.provider === selected.provider && connection.status === "connected"
    ));
  }, [integrationStatus, selected]);

  const syncGmail = async () => {
    setIsSyncing(true);
    const { data, error } = await apiFetch<{ synced: number; skipped: number }>(
      "/webhook/gmail/auth/sync?limit=20",
      { method: "POST" }
    );
    if (error) {
      toast.error(`Gmail sync failed: ${error}`);
    } else if ((data?.synced || 0) > 0) {
      toast.success(`Synced ${data!.synced} new email(s).`);
      loadConversations(selectedId);
    } else {
      toast.info("Inbox is up to date.");
    }
    setIsSyncing(false);
  };

  const handleReply = async () => {
    if (!selected || !replyTarget || !replyText.trim()) return;

    setIsSending(true);
    const { error } = await apiFetch("/messages/reply", {
      method: "POST",
      body: JSON.stringify({ eventId: replyTarget._id, message: replyText.trim() }),
    });
    setIsSending(false);

    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Reply sent via ${channelLabel(selected.provider)}.`);
    setReplyText("");
    loadConversations(selected.id);
  };

  const resolveThread = async () => {
    if (!selected) return;
    const target = replyTarget;
    if (!target) {
      toast.info("There is no open inbound message to resolve.");
      return;
    }

    setResolvingId(target._id);
    const { error } = await apiFetch(`/events/${target._id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    setResolvingId(null);

    if (error) {
      toast.error(`Could not resolve message: ${error}`);
      return;
    }
    toast.success("Conversation resolved.");
    loadConversations(selected.id);
  };

  const renderConversationRow = (conversation: Conversation) => {
    const active = conversation.id === selectedId;
    return (
      <button
        key={conversation.id}
        type="button"
        onClick={() => setSelectedId(conversation.id)}
        className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          active
            ? "border-primary/30 bg-primary/[0.06] shadow-sm"
            : "border-slate-200/80 bg-white/60 hover:bg-white hover:border-slate-300"
        }`}
        aria-current={active ? "true" : undefined}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
            <PlatformIcon provider={conversation.provider} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">
                {conversation.customer.name}
              </p>
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                {conversation.lastMessage ? formatDate(conversation.lastMessage.timestamp) : ""}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {channelLabel(conversation.provider)}
              {conversation.customer.email ? ` · ${conversation.customer.email}` : ""}
              {!conversation.customer.email && conversation.customer.phone ? ` · ${conversation.customer.phone}` : ""}
            </p>
            <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${conversation.unreadCount ? "text-foreground/90" : "text-muted-foreground"}`}>
              {conversation.lastMessage?.direction === "outbound" ? "You: " : ""}
              {conversation.lastMessage?.text || "No message preview"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {conversation.unreadCount > 0 && (
                <Badge className="h-5 rounded-full px-1.5 text-[10px] bg-primary text-primary-foreground">
                  {conversation.unreadCount} open
                </Badge>
              )}
              {conversation.status === "RESOLVED" && (
                <span className="text-[10px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Resolved
                </span>
              )}
              {conversation.lastMessage?.direction === "outbound" && conversation.lastMessage.deliveryStatus === "failed" && (
                <span className="text-[10px] text-destructive flex items-center gap-1">
                  <CircleAlert className="h-3 w-3" /> Last reply failed
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const renderMessageBubble = (message: InboxMessage) => {
    const outbound = message.content.direction === "outbound";
    return (
      <div key={message._id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[88%] sm:max-w-[76%] ${outbound ? "items-end" : "items-start"} flex flex-col gap-1`}>
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              outbound
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-white border border-slate-200/90 text-foreground rounded-bl-md shadow-sm"
            }`}
          >
            {message.content.text}
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-muted-foreground">
              {formatDate(message.timestamp)} · {formatTime(message.timestamp)}
            </span>
            {deliveryBadge(message)}
          </div>
          {outbound && message.content.error && (
            <p className="text-[10px] text-destructive px-1">{message.content.error}</p>
          )}
          {!outbound && message.content.summary && (
            <div className="rounded-lg bg-primary/[0.05] border border-primary/10 px-2.5 py-1.5 max-w-full">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">AI summary</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed mt-0.5">{message.content.summary}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="Smart Inbox">
      <motion.div
        className="max-w-7xl mx-auto space-y-6 pb-8"
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
              Every channel in one calm workspace. Messages are classified, grouped by customer, and replies go
              back through the channel they came from.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-blue-200/90 bg-blue-50/80 text-blue-700 hover:bg-blue-100"
              onClick={syncGmail}
              disabled={isSyncing || loading}
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {isSyncing ? "Syncing…" : "Sync Gmail"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => loadConversations(selectedId)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { label: "Conversations", value: analytics.total, icon: Inbox },
            { label: "Open threads", value: analytics.pending, icon: Radio },
            { label: "Urgent", value: analytics.urgent, icon: AlertCircle },
            { label: "Payment", value: analytics.payment, icon: IndianRupee },
          ].map((card) => (
            <GlassCard key={card.label} className="p-4">
              <div className="flex items-center justify-between">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {loading ? "—" : card.value}
                </p>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2">
                {card.label}
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter conversations by channel">
          {FILTERS.map((item) => {
            const count = item.id === "all"
              ? conversations.length
              : conversations.filter((conversation) => conversation.provider === item.id).length;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 h-8 text-xs font-medium transition-colors ${
                  filter === item.id
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white/70 text-muted-foreground hover:text-foreground hover:bg-white"
                }`}
              >
                {item.label}
                <span className={`ml-1.5 ${filter === item.id ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                  {loading ? "" : count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-[520px] rounded-2xl hidden lg:block" />
          </div>
        ) : conversations.length === 0 ? (
          <GlassCard hover={false} className="p-10 sm:p-14 text-center border-dashed border-slate-200/90">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/10">
              <Radio className="h-9 w-9 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No conversations yet</h3>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
              Connect a channel and send a test message from a customer account. New messages will appear here
              grouped by customer.
            </p>
            <Button asChild className="mt-6 rounded-xl">
              <Link to="/integrations">
                <ExternalLink className="h-4 w-4 mr-2" /> Open Integrations
              </Link>
            </Button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
            <GlassCard
              hover={false}
              className={`p-2.5 ${selectedId ? "hidden lg:block" : "block"} max-h-[640px] overflow-y-auto`}
            >
              <div className="space-y-2" role="list" aria-label="Conversations">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No conversations on this channel.
                  </div>
                ) : (
                  filtered.map(renderConversationRow)
                )}
              </div>
            </GlassCard>

            <GlassCard hover={false} className={`${selectedId ? "block" : "hidden lg:block"} overflow-hidden`}>
              {selected ? (
                <div className="flex flex-col min-h-[520px] max-h-[640px]">
                  <div className="border-b border-slate-100 px-4 sm:px-5 py-4 bg-white/60">
                    <div className="flex items-start gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden -ml-2 shrink-0"
                        onClick={() => setSelectedId(null)}
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <PlatformIcon provider={selected.provider} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                            {selected.customer.name}
                          </h3>
                          <Badge variant="outline" className="text-[10px] h-5 rounded-full">
                            {channelLabel(selected.provider)}
                          </Badge>
                          {selected.status === "PENDING" ? (
                            <Badge className="text-[10px] h-5 rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/20">
                              Open
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] h-5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          {[selected.customer.email, selected.customer.phone].filter(Boolean).join(" · ") || channelLabel(selected.provider)}
                          {selected.accountId ? ` · via ${selected.accountId}` : ""}
                        </p>
                      </div>
                      {selected.status === "PENDING" && replyTarget && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl shrink-0 hidden sm:inline-flex"
                          onClick={resolveThread}
                          disabled={resolvingId === replyTarget._id}
                        >
                          {resolvingId === replyTarget._id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          )}
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-50/60 px-3 sm:px-5 py-4 space-y-4">
                    <AnimatePresence initial={false}>
                      {selected.messages.map((message) => (
                        <motion.div
                          key={message._id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          {renderMessageBubble(message)}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="border-t border-slate-100 bg-white/80 px-3 sm:px-5 py-4">
                    {!channelConnected && (
                      <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        This channel is not connected. Reconnect it before sending a reply.
                        <Link to="/integrations" className="ml-auto underline font-medium">Fix</Link>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleReply();
                          }
                        }}
                        placeholder={`Reply to ${selected.customer.name} via ${channelLabel(selected.provider)}…`}
                        className="min-h-[46px] max-h-32 rounded-xl bg-white resize-none"
                        rows={1}
                        disabled={isSending || !channelConnected}
                        aria-label={`Reply via ${channelLabel(selected.provider)}`}
                      />
                      <Button
                        size="icon"
                        className="h-[46px] w-[46px] rounded-xl shrink-0"
                        onClick={handleReply}
                        disabled={isSending || !replyText.trim() || !replyTarget || !channelConnected}
                        aria-label="Send reply"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <p className="text-[10px] text-muted-foreground">
                        <Clock3 className="inline h-3 w-3 mr-1" />
                        Enter to send · Shift+Enter for a new line
                      </p>
                      {selected.status === "PENDING" && replyTarget && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg h-7 text-[11px] text-muted-foreground sm:hidden"
                          onClick={resolveThread}
                          disabled={resolvingId === replyTarget._id}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[520px] p-10 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Inbox className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground mt-4">Select a conversation</p>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
                    Choose a thread to see the full history, customer details and channel-aware reply box.
                  </p>
                </div>
              )}
            </GlassCard>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
};

export default SmartInbox;
