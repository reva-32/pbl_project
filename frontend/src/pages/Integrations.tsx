import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Instagram, Facebook, Mail, CreditCard, ExternalLink } from "lucide-react";

const integrations = [
  { name: "WhatsApp Business API", desc: "Auto-reply to customer inquiries", icon: MessageSquare, color: "bg-success/10 text-success", connected: true },
  { name: "Facebook Messenger", desc: "Manage FB page messages", icon: Facebook, color: "bg-facebook/10 text-facebook", connected: true },
  { name: "Instagram Direct", desc: "Handle DMs & story replies", icon: Instagram, color: "bg-instagram/10 text-instagram", connected: false },
  { name: "Gmail", desc: "Sync emails & send invoices", icon: Mail, color: "bg-muted text-muted-foreground", connected: false },
  { name: "Razorpay / Stripe", desc: "Accept online payments", icon: CreditCard, color: "bg-primary/10 text-primary", connected: true },
];

const Integrations = () => {
  return (
    <AppLayout title="Integrations">
      <div className="max-w-4xl mx-auto animate-fade-in">
        <p className="text-sm text-muted-foreground mb-6">Connect your business tools to automate workflows and centralize communications.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((item) => (
            <Card key={item.name} className="p-5 border-0 shadow-premium bg-card flex flex-col items-center text-center gap-3 hover:shadow-elevated transition-shadow">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${item.color}`}>
                <item.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{item.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                <Badge variant={item.connected ? "success" : "secondary"} className="mt-2">
                  {item.connected ? "Connected" : "Not Connected"}
                </Badge>
              </div>
              <Button variant={item.connected ? "outline" : "hero"} size="sm" className="w-full">
                {item.connected ? "Manage" : "Connect"}
                {!item.connected && <ExternalLink className="h-3 w-3 ml-1" />}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Integrations;
