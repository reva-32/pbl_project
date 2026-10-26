import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare,
  Mail,
  Facebook,
  Instagram,
  Loader2,
  RefreshCw,
  Unplug,
  ShieldCheck,
  AlertTriangle,
  Link2,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type Provider = "gmail" | "whatsapp" | "facebook" | "instagram";

interface Connection {
  id: string;
  provider: Provider;
  externalAccountId: string;
  displayName: string;
  status: "connected" | "pending" | "error" | "disconnected";
  lastError: string | null;
  connectedAt: string;
  lastEventAt: string | null;
  metadata?: {
    phoneNumber?: string | null;
    wabaId?: string | null;
    pageId?: string | null;
    username?: string | null;
  };
}

interface IntegrationStatus {
  gmail: {
    connected: boolean;
    email: string | null;
    pushConfigured: boolean;
    oauthConfigured: boolean;
  };
  connections: Connection[];
  whatsappLegacyPhoneNumberId?: string | null;
  setup: {
    encryptionConfigured: boolean;
    gmailOAuthConfigured: boolean;
    metaOAuthConfigured: boolean;
    metaWebhookConfigured: boolean;
    gmailPushConfigured: boolean;
    gmailPushVerificationConfigured: boolean;
  };
}

const CHANNEL_META: Record<Provider, {
  name: string;
  desc: string;
  icon: typeof Mail;
  accent: string;
  iconBg: string;
  identityLabel: string;
}> = {
  gmail: {
    name: "Gmail",
    desc: "Read customer email and send replies from your connected Gmail account.",
    icon: Mail,
    accent: "text-blue-600",
    iconBg: "bg-blue-500/10",
    identityLabel: "Workspace email",
  },
  whatsapp: {
    name: "WhatsApp Business",
    desc: "Receive and reply to customers through the official WhatsApp Cloud API.",
    icon: MessageSquare,
    accent: "text-emerald-600",
    iconBg: "bg-emerald-500/10",
    identityLabel: "Phone Number ID",
  },
  facebook: {
    name: "Facebook Messenger",
    desc: "Route Page conversations into the Smart Inbox and reply as your Page.",
    icon: Facebook,
    accent: "text-[#1877F2]",
    iconBg: "bg-[#1877F2]/10",
    identityLabel: "Facebook Page",
  },
  instagram: {
    name: "Instagram Direct",
    desc: "Handle Instagram DMs for your professional account from one inbox.",
    icon: Instagram,
    accent: "text-pink-600",
    iconBg: "bg-pink-500/10",
    identityLabel: "Instagram account",
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  consent_denied: "The provider consent screen was closed before access was granted.",
  missing_code_or_state: "The provider response was incomplete. Please try connecting again.",
  invalid_or_expired_state: "The connection request expired. Please start again.",
  oauth_failed: "The provider could not complete the connection. Please try again.",
  encryption_not_configured: "Server encryption is not configured. Add INTEGRATION_ENCRYPTION_KEY and restart the API.",
  server_not_configured: "This channel needs server credentials before it can be connected.",
  refresh_token_missing: "Google did not return a refresh token. Remove the app grant in your Google account and retry.",
  profile_unavailable: "Google did not return the Gmail profile. Please retry.",
  account_already_connected: "This Gmail mailbox is already connected to another business workspace.",
  no_eligible_accounts: "No eligible Facebook Page or Instagram professional account was found.",
};

const dateLabel = (value?: string | null) => {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "Unknown";
  }
};

const Integrations = () => {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showWhatsAppForm, setShowWhatsAppForm] = useState(false);
  const [waForm, setWaForm] = useState({ phoneNumberId: "", wabaId: "", accessToken: "" });

  const loadStatus = useCallback(async () => {
    const { data, error } = await apiFetch<IntegrationStatus>("/integrations/status");
    if (error) {
      toast.error(`Could not load integrations: ${error}`);
    } else {
      setStatus(data);
    }
    setLoading(false);
  }, []);

  const handleCallbackMessages = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (params.get("gmail_connected") === "true") {
      toast.success("Gmail connected successfully.");
      changed = true;
    }
    const gmailError = params.get("gmail_error");
    if (gmailError) {
      toast.error(ERROR_MESSAGES[gmailError] || "Gmail connection failed.");
      changed = true;
    }
    const metaConnected = params.get("meta_connected");
    if (metaConnected) {
      const count = params.get("meta_count") || "1";
      toast.success(`${metaConnected === "instagram" ? "Instagram" : "Facebook"} connected (${count} account${count === "1" ? "" : "s"}).`);
      changed = true;
    }
    const metaSkipped = params.get("meta_skipped");
    if (metaSkipped) {
      toast.info(`${metaSkipped} account(s) were skipped because they are already linked to another business.`);
    }
    const metaError = params.get("meta_error");
    if (metaError) {
      toast.error(ERROR_MESSAGES[metaError] || "Meta connection failed.");
      changed = true;
    }

    if (changed || metaSkipped) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    handleCallbackMessages();
    loadStatus();
  }, [handleCallbackMessages, loadStatus]);

  const connectionsByProvider = useMemo(() => {
    const grouped: Record<Provider, Connection[]> = {
      gmail: [],
      whatsapp: [],
      facebook: [],
      instagram: [],
    };
    (status?.connections || []).forEach((connection) => {
      if (grouped[connection.provider]) grouped[connection.provider].push(connection);
    });
    return grouped;
  }, [status]);

  const connectGmail = async () => {
    setBusy("gmail-connect");
    const { data, error } = await apiFetch<{ url: string }>("/webhook/gmail/auth/url");
    if (error || !data?.url) {
      toast.error(error || "Could not start Gmail connection.");
      setBusy(null);
      return;
    }
    window.location.href = data.url;
  };

  const disconnectGmail = async () => {
    if (!window.confirm("Disconnect Gmail? Synced messages stay in your inbox, but new email will stop arriving.")) return;
    setBusy("gmail-disconnect");
    const { error } = await apiFetch("/webhook/gmail/auth", { method: "DELETE" });
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Gmail disconnected.");
    loadStatus();
  };

  const syncGmail = async () => {
    setBusy("gmail-sync");
    const { data, error } = await apiFetch<{ synced: number; skipped: number }>(
      "/webhook/gmail/auth/sync?limit=20",
      { method: "POST" }
    );
    setBusy(null);
    if (error) {
      toast.error(`Gmail sync failed: ${error}`);
      return;
    }
    if ((data?.synced || 0) > 0) toast.success(`Synced ${data!.synced} new email(s).`);
    else toast.info("Gmail is up to date.");
  };

  const connectMeta = async (channel: "facebook" | "instagram") => {
    setBusy(`${channel}-connect`);
    const { data, error } = await apiFetch<{ url: string }>(`/integrations/meta/connect?channel=${channel}`);
    if (error || !data?.url) {
      toast.error(error || `Could not start ${channel} connection.`);
      setBusy(null);
      return;
    }
    window.location.href = data.url;
  };

  const connectWhatsApp = async () => {
    if (!waForm.phoneNumberId.trim() || !waForm.accessToken.trim()) {
      toast.error("Enter the Phone Number ID and access token.");
      return;
    }
    setBusy("whatsapp-connect");
    const { error } = await apiFetch("/integrations/whatsapp", {
      method: "POST",
      body: JSON.stringify({
        phoneNumberId: waForm.phoneNumberId.trim(),
        wabaId: waForm.wabaId.trim(),
        accessToken: waForm.accessToken.trim(),
      }),
    });
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("WhatsApp connected. Send a test message from another phone to verify delivery.");
    setWaForm({ phoneNumberId: "", wabaId: "", accessToken: "" });
    setShowWhatsAppForm(false);
    loadStatus();
  };

  const disconnectConnection = async (connection: Connection) => {
    if (!window.confirm(`Disconnect ${connection.displayName || connection.externalAccountId}?`)) return;
    setBusy(`disconnect-${connection.id}`);
    const { error } = await apiFetch(`/integrations/${connection.provider}/${connection.id}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Channel disconnected.");
    loadStatus();
  };

  const setupWarnings = useMemo(() => {
    if (!status) return [];
    const setup = status.setup;
    const warnings: string[] = [];
    if (!setup.encryptionConfigured) warnings.push("Add INTEGRATION_ENCRYPTION_KEY to the backend environment to store channel tokens securely.");
    if (!setup.gmailOAuthConfigured) warnings.push("Gmail needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.");
    if (!setup.metaOAuthConfigured) warnings.push("Facebook and Instagram need META_APP_ID, META_APP_SECRET and META_OAUTH_REDIRECT_URI.");
    if (!setup.metaWebhookConfigured) warnings.push("Meta webhooks need META_VERIFY_TOKEN and META_APP_SECRET.");
    if (!setup.gmailPushConfigured) warnings.push("Gmail push notifications need GOOGLE_PUBSUB_TOPIC. Manual sync still works.");
    return warnings;
  }, [status]);

  const renderConnection = (connection: Connection) => {
    const meta = CHANNEL_META[connection.provider];
    return (
      <div
        key={connection.id}
        className="rounded-xl border border-slate-200/90 bg-white/70 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">
              {connection.displayName || connection.externalAccountId}
            </p>
            <Badge
              variant="outline"
              className={`text-[10px] h-5 rounded-full ${
                connection.status === "connected"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700"
              }`}
            >
              {connection.status === "connected" ? "Connected" : connection.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {meta.identityLabel}: {connection.metadata?.phoneNumber || connection.metadata?.username || connection.externalAccountId}
            <span className="mx-1.5">·</span>
            Last message: {dateLabel(connection.lastEventAt)}
          </p>
          {connection.lastError && (
            <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {connection.lastError}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => disconnectConnection(connection)}
          disabled={busy === `disconnect-${connection.id}`}
        >
          {busy === `disconnect-${connection.id}` ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Unplug className="h-4 w-4 mr-1.5" />
          )}
          Disconnect
        </Button>
      </div>
    );
  };

  const renderCard = (provider: Provider) => {
    const meta = CHANNEL_META[provider];
    const connections = connectionsByProvider[provider];
    const isGmail = provider === "gmail";
    const gmailConnected = status?.gmail.connected;
    const connected = isGmail ? gmailConnected : connections.length > 0;
    const actionDisabled =
      busy === `${provider}-connect` || (isGmail ? !status?.gmail.oauthConfigured : !status?.setup.metaOAuthConfigured);

    return (
      <motion.div
        key={provider}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <GlassCard className="p-6 h-full flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${meta.iconBg}`}>
              <meta.icon className={`h-6 w-6 ${meta.accent}`} />
            </div>
            {connected ? (
              <Badge className="rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 gap-1.5 pr-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="rounded-full">
                Not connected
              </Badge>
            )}
          </div>

          <h4 className="text-base font-semibold text-foreground mt-5">{meta.name}</h4>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed flex-1">{meta.desc}</p>

          {isGmail && gmailConnected && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
              <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {status?.gmail.email}
              </p>
              <p className="text-[11px] text-emerald-700/80 mt-1">
                {status?.gmail.pushConfigured ? "Push notifications enabled" : "Push not configured · manual sync available"}
              </p>
            </div>
          )}

          {connections.length > 0 && (
            <div className="mt-4 space-y-2">
              {connections.map(renderConnection)}
            </div>
          )}

          {provider === "whatsapp" && showWhatsAppForm && (
            <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wa-phone-id" className="text-xs">Phone Number ID</Label>
                <Input
                  id="wa-phone-id"
                  value={waForm.phoneNumberId}
                  onChange={(e) => setWaForm((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                  placeholder="e.g. 1064227266775850"
                  className="font-mono text-sm bg-white"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-waba-id" className="text-xs">WhatsApp Business Account ID (optional)</Label>
                <Input
                  id="wa-waba-id"
                  value={waForm.wabaId}
                  onChange={(e) => setWaForm((prev) => ({ ...prev, wabaId: e.target.value }))}
                  placeholder="WABA ID"
                  className="font-mono text-sm bg-white"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-token" className="text-xs">Permanent access token</Label>
                <Input
                  id="wa-token"
                  type="password"
                  value={waForm.accessToken}
                  onChange={(e) => setWaForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                  placeholder="System user access token"
                  className="font-mono text-sm bg-white"
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Stored encrypted on the server and never returned to the browser. Use a System User token with
                  whatsapp_business_messaging permission.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl" onClick={connectWhatsApp} disabled={busy === "whatsapp-connect"}>
                  {busy === "whatsapp-connect" && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Verify &amp; connect
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => setShowWhatsAppForm(false)}
                  disabled={busy === "whatsapp-connect"}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {isGmail ? (
              gmailConnected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={syncGmail}
                    disabled={busy === "gmail-sync"}
                  >
                    {busy === "gmail-sync" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    Sync now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl text-muted-foreground hover:text-destructive"
                    onClick={disconnectGmail}
                    disabled={busy === "gmail-disconnect"}
                  >
                    {busy === "gmail-disconnect" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Unplug className="h-4 w-4 mr-1.5" />
                    )}
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={connectGmail}
                  disabled={actionDisabled}
                >
                  {busy === "gmail-connect" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-1.5" />
                  )}
                  Connect Gmail
                </Button>
              )
            ) : provider === "whatsapp" ? (
              <Button
                size="sm"
                className="rounded-xl"
                onClick={() => setShowWhatsAppForm((value) => !value)}
                disabled={busy === "whatsapp-connect"}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {showWhatsAppForm ? "Hide form" : connections.length ? "Add another number" : "Connect number"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="rounded-xl"
                onClick={() => connectMeta(provider)}
                disabled={actionDisabled}
              >
                {busy === `${provider}-connect` ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1.5" />
                )}
                {connections.length ? "Connect another" : `Connect ${provider === "facebook" ? "Messenger" : "Instagram"}`}
              </Button>
            )}
          </div>
        </GlassCard>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <AppLayout title="Integrations">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Integrations">
      <motion.div
        className="max-w-5xl mx-auto space-y-8 pb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-2">
            Connections
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Integrations
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Connect the channels your business uses. Each account is isolated to this business and tokens are
            encrypted at rest.
          </p>
        </div>

        {setupWarnings.length > 0 && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-50/80 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">Some server credentials are still needed</p>
                <ul className="mt-2 space-y-1.5 text-xs text-amber-800/90 leading-relaxed">
                  {setupWarnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-600 shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700 mt-3">
                  See backend/.env.example for the full list. Values are never shown in this app.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Tenant-scoped delivery · signatures verified where the provider supports them
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(["gmail", "whatsapp", "facebook", "instagram"] as Provider[]).map(renderCard)}
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white/60 p-5 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground text-sm">Provider setup checklist</p>
          <ul className="mt-2 space-y-1.5">
            <li>• Gmail: enable the Gmail API and create an OAuth web client with the callback URL shown in your deployment config.</li>
            <li>• WhatsApp: add a Meta app, a WhatsApp Business Account and a permanent System User token.</li>
            <li>• Messenger / Instagram: link the Page or professional account to the Meta app, configure the webhook and subscribe to message events.</li>
            <li>• Webhooks must point to <span className="font-mono text-[11px] text-foreground">/api/webhook/meta</span> and, for Gmail, <span className="font-mono text-[11px] text-foreground">/api/webhook/gmail</span>.</li>
          </ul>
        </div>
      </motion.div>
    </AppLayout>
  );
};

export default Integrations;
