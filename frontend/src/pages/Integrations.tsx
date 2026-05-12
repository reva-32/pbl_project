import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Mail, Lock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const liveIntegrations = [
  {
    name: "WhatsApp Business API",
    desc: "Customer messages, AI classification, and outbound replies.",
    icon: MessageSquare,
    connected: true,
    accent: "text-emerald-700",
    iconBg: "bg-emerald-500/10",
  },
  {
    name: "Gmail",
    desc: "Sync email context and send professional invoices from your workspace.",
    icon: Mail,
    connected: false,
    accent: "text-primary",
    iconBg: "bg-primary/10",
  },
];

const comingSoon = [
  { name: "Facebook Messenger", desc: "Centralize Meta page conversations." },
  { name: "Instagram Direct", desc: "Story replies and DM routing." },
  { name: "Razorpay / Stripe", desc: "Collect payments with reconciliation." },
];

const Integrations = () => {
  return (
    <AppLayout title="Integrations">
      <motion.div
        className="max-w-5xl mx-auto space-y-10 pb-8"
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
            Connect the channels your business actually uses. Only live integrations can be
            configured; everything else is clearly marked as coming soon.
          </p>
        </div>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-semibold text-foreground tracking-tight">
              Available now
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {liveIntegrations.map((item, i) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassCard className="p-6 h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
                      <item.icon className={`h-6 w-6 ${item.accent}`} />
                    </div>
                    {item.connected ? (
                      <Badge className="rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 gap-1.5 pr-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-50" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full">
                        Not connected
                      </Badge>
                    )}
                  </div>
                  <h4 className="text-base font-semibold text-foreground mt-5">{item.name}</h4>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed flex-1">
                    {item.desc}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button
                      variant={item.connected ? "outline" : "default"}
                      size="sm"
                      className="rounded-xl"
                      disabled={!item.connected && item.name === "Gmail"}
                    >
                      {item.connected ? "Manage" : "Connect"}
                    </Button>
                    {!item.connected && (
                      <p className="text-xs text-muted-foreground self-center">
                        Wire up Gmail in your deployment when backend support is enabled.
                      </p>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Coming soon</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {comingSoon.map((item, i) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.05, duration: 0.35 }}
              >
                <div className="relative rounded-2xl border border-slate-200/80 bg-slate-50/60 overflow-hidden min-h-[160px]">
                  <div className="absolute inset-0 backdrop-blur-[2px] bg-white/30 pointer-events-none z-[1]" />
                  <div className="relative z-[2] p-5 flex flex-col h-full opacity-60">
                    <Badge variant="outline" className="w-fit rounded-full text-[10px] mb-3">
                      Coming soon
                    </Badge>
                    <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="absolute bottom-3 right-3 z-[3] flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    Locked
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </motion.div>
    </AppLayout>
  );
};

export default Integrations;
