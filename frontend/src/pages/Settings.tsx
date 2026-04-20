import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, User, Bell, Shield, Globe, CreditCard,
  FileText, Clock, Mail, Smartphone, MessageSquare,
  CheckCircle, Zap, Star, Rocket, AlertTriangle,
  Calendar, X, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface UserSettings {
  companyName:   string;
  ownerName:     string;
  email:         string;
  phone:         string;
  businessType:  string;
  city:          string;
  gstin:         string;
  pan:           string;
  whatsappPhoneNumberId: string;
  address:       string;
  currency:      string;
  language:      string;
  timezone:      string;
  dateFormat:    string;
  invoicePrefix: string;
  paymentTerms:  string;
  taxRate:       number;
  notifications: {
    emailNotifications: boolean;
    pushNotifications:  boolean;
    whatsappAlerts:     boolean;
    weeklyReports:      boolean;
    paymentAlerts:      boolean;
  };
  twoFactorEnabled: boolean;
  loginAlerts:      boolean;
}

interface PlanLimit {
  messages:    number;
  aiQueries:   number;
  invoices:    number;
  teamMembers: number;
}

interface SubscriptionData {
  plan:               string;
  planName:           string;
  price:              number;
  status:             string;
  trialDaysRemaining: number;
  trialEndDate:       string;
  currentPeriodStart: string;
  currentPeriodEnd:   string;
  usage:              { messages: number; aiQueries: number; invoices: number; teamMembers: number };
  limits:             PlanLimit;
  paymentMethod:      string | null;
  invoices:           { invoiceId: string; amount: number; status: string; date: string }[];
}

interface FullPlan {
  id:    string;
  name:  string;
  price: number;
  limits: PlanLimit;
}

// ── Plan icon map ──────────────────────────────────────────────────────────
const planIcons: Record<string, typeof Zap> = {
  free_trial:   Zap,
  starter:      Star,
  professional: Rocket,
  enterprise:   CheckCircle,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtLimit(v: number) {
  return v === -1 ? "Unlimited" : v.toLocaleString();
}

function fmtDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(dateStr: string) {
  if (!dateStr) return 0;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function FieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────
interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  plan: FullPlan | null;
  onConfirm: () => Promise<void>;
  loading: boolean;
}

const PaymentModal = ({ open, onClose, plan, onConfirm, loading }: PaymentModalProps) => {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  if (!open || !plan) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-elevated bg-card">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Complete Payment</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Plan Summary */}
        <div className="p-6 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plan</span>
            <span className="font-semibold text-foreground">{plan.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="font-semibold text-foreground">Rs. {plan.price.toLocaleString()}/month</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold text-primary">Rs. {plan.price.toLocaleString()}</span>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <Label className="text-sm">Card Number</Label>
            <Input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
              placeholder="4242 4242 4242 4242"
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Expiry (MM/YY)</Label>
              <Input
                value={expiry}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
                  setExpiry(v);
                }}
                placeholder="12/25"
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label className="text-sm">CVV</Label>
              <Input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="123"
                type="password"
                className="mt-1.5 font-mono"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground bg-accent/50 p-3 rounded-lg">
            💡 <strong>Demo Mode:</strong> Use any card details above. In production, this would redirect to Razorpay.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-6 border-t border-border">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="hero"
            className="flex-1"
            disabled={loading || !cardNumber || !expiry || !cvv}
            onClick={onConfirm}
          >
            {loading ? "Processing..." : "Pay & Activate"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
const Settings = () => {
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Form states
  const [companyName,   setCompanyName]   = useState("");
  const [address,       setAddress]       = useState("");
  const [gstin,         setGstin]         = useState("");
  const [pan,           setPan]           = useState("");
  const [businessType,  setBusinessType]  = useState("");
  const [city,          setCity]          = useState("");
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");

  const [currency,      setCurrency]      = useState("inr");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [paymentTerms,  setPaymentTerms]  = useState("net30");
  const [taxRate,       setTaxRate]       = useState(18);

  const [language,   setLanguage]   = useState("en");
  const [timezone,   setTimezone]   = useState("ist");
  const [dateFormat, setDateFormat] = useState("dd-mm");

  const [ownerName,  setOwnerName]  = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  const [notifs, setNotifs] = useState({
    emailNotifications: true,
    pushNotifications:  true,
    whatsappAlerts:     false,
    weeklyReports:      true,
    paymentAlerts:      true,
  });

  const [twoFactor,    setTwoFactor]    = useState(false);
  const [loginAlerts,  setLoginAlerts]  = useState(true);
  const [currentPass,  setCurrentPass]  = useState("");
  const [newPass,      setNewPass]      = useState("");

  // Subscription state
  const [subscription,  setSubscription]  = useState<SubscriptionData | null>(null);
  const [allPlans,      setAllPlans]      = useState<FullPlan[]>([]);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState({
    open: false,
    selectedPlan: null as FullPlan | null,
    processing: false,
  });

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiFetch<{ user: UserSettings }>('/settings');
    if (error) { toast.error(error); setLoading(false); return; }

    const u = data!.user;
    setCompanyName(u.companyName ?? "");
    setAddress(u.address ?? "");
    setGstin(u.gstin ?? "");
    setPan(u.pan ?? "");
    setBusinessType(u.businessType ?? "");
    setCity(u.city ?? "");
    setWhatsappPhoneNumberId(u.whatsappPhoneNumberId ?? "");
    setCurrency(u.currency ?? "inr");
    setInvoicePrefix(u.invoicePrefix ?? "INV-");
    setPaymentTerms(u.paymentTerms ?? "net30");
    setTaxRate(u.taxRate ?? 18);
    setLanguage(u.language ?? "en");
    setTimezone(u.timezone ?? "ist");
    setDateFormat(u.dateFormat ?? "dd-mm");
    setOwnerName(u.ownerName ?? "");
    setOwnerEmail(u.email ?? "");
    setOwnerPhone(u.phone ?? "");
    if (u.notifications) setNotifs(u.notifications);
    setTwoFactor(u.twoFactorEnabled ?? false);
    setLoginAlerts(u.loginAlerts ?? true);
    setLoading(false);
  }, []);

  // Fetch billing
  const fetchBilling = useCallback(async () => {
    setSubLoading(true);
    const { data, error } = await apiFetch<{ subscription: SubscriptionData; allPlans: FullPlan[] }>('/billing');
    if (error) { toast.error(error); setSubLoading(false); return; }
    setSubscription(data!.subscription);
    setAllPlans(data!.allPlans.filter(p => p.id !== 'free_trial'));
    setSubLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); fetchBilling(); }, [fetchSettings, fetchBilling]);

  // Save handler
  async function save(section: string, body: object) {
    setSaving(section);
    const { error, data } = await apiFetch<{ message: string; user?: UserSettings }>(
      `/settings/${section}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    setSaving(null);
    if (error) { toast.error(error); return; }
    toast.success((data as { message: string }).message);

    if (section === 'account' && (data as { user?: UserSettings }).user) {
      const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
      const updated = { ...stored, ...(data as { user: UserSettings }).user };
      localStorage.setItem('user', JSON.stringify(updated));
    }

    if (section === 'business' && (data as { user?: UserSettings }).user) {
      const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
      localStorage.setItem('user', JSON.stringify({
        ...stored,
        companyName: (data as { user: UserSettings }).user.companyName,
      }));
    }
  }

  // Activate plan handler
  async function handleActivatePlan() {
    if (!paymentModal.selectedPlan) return;

    setPaymentModal(prev => ({ ...prev, processing: true }));
    const { error } = await apiFetch('/billing/activate-plan', {
      method: 'POST',
      body: JSON.stringify({ planId: paymentModal.selectedPlan!.id }),
    });
    setPaymentModal(prev => ({ ...prev, processing: false }));

    if (error) { toast.error(error); return; }
    toast.success(`Subscription activated! Welcome to ${paymentModal.selectedPlan.name}`);
    setPaymentModal({ open: false, selectedPlan: null, processing: false });
    fetchBilling();
  }

  // Cancel subscription handler
  async function handleCancelSubscription() {
    if (!confirm('Are you sure? This will immediately cancel your subscription.')) return;

    setCancelling(true);
    const { error } = await apiFetch('/billing/cancel', { method: 'POST' });
    setCancelling(false);

    if (error) { toast.error(error); return; }
    toast.success("Subscription cancelled. Your access will end on the billing date.");
    fetchBilling();
  }

  // Status variant
  function statusVariant(status: string): "default" | "secondary" | "destructive" {
    if (status === 'active') return 'default';
    if (status === 'trial')  return 'secondary';
    return 'destructive';
  }

  // ════════════════════════════════════════════════════════════════════════
  return (
    <AppLayout title="Settings">
      <div className="max-w-4xl mx-auto animate-fade-in">
        <Tabs defaultValue="business">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="business"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Business</TabsTrigger>
            <TabsTrigger value="account"><User className="h-3.5 w-3.5 mr-1.5" /> Account</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" /> Notifications</TabsTrigger>
            <TabsTrigger value="billing"><CreditCard className="h-3.5 w-3.5 mr-1.5" /> Billing</TabsTrigger>
            <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" /> Security</TabsTrigger>
          </TabsList>

          {/* ── BUSINESS TAB ── */}
          <TabsContent value="business">
            <div className="space-y-6">
              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Business Information
                </h3>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array(6).fill(0).map((_, i) => <FieldSkeleton key={i} />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Business Name</Label>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Business Type</Label>
                      <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="mt-1.5" placeholder="e.g. Retail, Catering" />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5" placeholder="Mumbai" />
                    </div>
                    <div>
                      <Label>Address</Label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>GST Number</Label>
                      <Input value={gstin} onChange={(e) => setGstin(e.target.value)} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>PAN Number</Label>
                      <Input value={pan} onChange={(e) => setPan(e.target.value)} className="mt-1.5" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="flex items-center gap-1.5">
                        WhatsApp Phone Number ID
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal">REQUIRED FOR WEBHOOKS</Badge>
                      </Label>
                      <Input 
                        value={whatsappPhoneNumberId} 
                        onChange={(e) => setWhatsappPhoneNumberId(e.target.value)} 
                        className="mt-1.5 font-mono text-sm" 
                        placeholder="e.g. 1064227266775850"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                        Found in Meta Developer Portal → WhatsApp → API Setup. Messages received on this ID will be routed to your inbox.
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  variant="hero"
                  className="mt-5"
                  disabled={saving === 'business' || loading}
                  onClick={() => save('business', { companyName, address, gstin, pan, businessType, city, whatsappPhoneNumberId })}
                >
                  {saving === 'business' ? 'Saving...' : 'Save Business Info'}
                </Button>
              </Card>

              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Invoice Defaults
                </h3>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array(4).fill(0).map((_, i) => <FieldSkeleton key={i} />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Default Currency</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inr">INR — Indian Rupee</SelectItem>
                          <SelectItem value="usd">USD — US Dollar</SelectItem>
                          <SelectItem value="eur">EUR — Euro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Invoice Prefix</Label>
                      <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Default Payment Terms</Label>
                      <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="due">Due on Receipt</SelectItem>
                          <SelectItem value="net15">Net 15</SelectItem>
                          <SelectItem value="net30">Net 30</SelectItem>
                          <SelectItem value="net60">Net 60</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tax Rate (%)</Label>
                      <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="mt-1.5" />
                    </div>
                  </div>
                )}
                <Button
                  variant="hero"
                  className="mt-5"
                  disabled={saving === 'invoice' || loading}
                  onClick={() => save('invoice', { currency, invoicePrefix, paymentTerms, taxRate })}
                >
                  {saving === 'invoice' ? 'Saving...' : 'Save Invoice Settings'}
                </Button>
              </Card>

              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Localization
                </h3>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Array(3).fill(0).map((_, i) => <FieldSkeleton key={i} />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Language</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="hi">Hindi</SelectItem>
                          <SelectItem value="mr">Marathi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ist">IST (UTC+5:30)</SelectItem>
                          <SelectItem value="utc">UTC</SelectItem>
                          <SelectItem value="est">EST (UTC-5)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Date Format</Label>
                      <Select value={dateFormat} onValueChange={setDateFormat}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dd-mm">DD/MM/YYYY</SelectItem>
                          <SelectItem value="mm-dd">MM/DD/YYYY</SelectItem>
                          <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <Button
                  variant="hero"
                  className="mt-5"
                  disabled={saving === 'localization' || loading}
                  onClick={() => save('localization', { language, timezone, dateFormat })}
                >
                  {saving === 'localization' ? 'Saving...' : 'Save Preferences'}
                </Button>
              </Card>
            </div>
          </TabsContent>

          {/* ── ACCOUNT TAB ── */}
          <TabsContent value="account">
            <Card className="p-6 border-0 shadow-premium bg-card">
              <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Personal Information
              </h3>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array(4).fill(0).map((_, i) => <FieldSkeleton key={i} />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input value="Owner / Admin" readOnly className="mt-1.5 bg-muted" />
                  </div>
                </div>
              )}
              <Button
                variant="hero"
                className="mt-5"
                disabled={saving === 'account' || loading}
                onClick={() => save('account', { ownerName, email: ownerEmail, phone: ownerPhone })}
              >
                {saving === 'account' ? 'Saving...' : 'Save Account'}
              </Button>
            </Card>
          </TabsContent>

          {/* ── NOTIFICATIONS TAB ── */}
          <TabsContent value="notifications">
            <Card className="p-6 border-0 shadow-premium bg-card">
              <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" /> Notification Preferences
              </h3>
              <div className="space-y-5">
                {([
                  { key: "emailNotifications" as const, icon: Mail,         label: "Email Notifications", desc: "Daily digest and important alerts" },
                  { key: "pushNotifications"  as const, icon: Smartphone,   label: "Push Notifications",  desc: "Instant alerts for new messages" },
                  { key: "whatsappAlerts"     as const, icon: MessageSquare,label: "WhatsApp Alerts",      desc: "New customer inquiries on WhatsApp" },
                  { key: "weeklyReports"      as const, icon: Clock,         label: "Weekly Reports",       desc: "Automated weekly business summaries" },
                  { key: "paymentAlerts"      as const, icon: CreditCard,    label: "Payment Alerts",       desc: "Invoices paid or overdue" },
                ]).map((n) => (
                  <div key={n.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                        <n.icon className="h-4 w-4 text-accent-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{n.label}</p>
                        <p className="text-xs text-muted-foreground">{n.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={notifs[n.key]}
                      onCheckedChange={(v) => setNotifs(prev => ({ ...prev, [n.key]: v }))}
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="hero"
                className="mt-6"
                disabled={saving === 'notifications'}
                onClick={() => save('notifications', { notifications: notifs })}
              >
                {saving === 'notifications' ? 'Saving...' : 'Save Notifications'}
              </Button>
            </Card>
          </TabsContent>

          {/* ── BILLING TAB ── */}
          <TabsContent value="billing">
            <div className="space-y-6">

              {/* Trial banner */}
              {subscription?.status === 'trial' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} left in your free trial
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Choose a plan below before your trial ends to keep access to all features.
                    </p>
                  </div>
                </div>
              )}

              {/* Expired banner */}
              {subscription?.status === 'expired' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Your trial has expired</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select a plan below to reactivate your account.
                    </p>
                  </div>
                </div>
              )}

              {/* Current plan card */}
              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Current Plan
                </h3>
                {subLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <div className="grid grid-cols-4 gap-3">
                      {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                    </div>
                  </div>
                ) : subscription ? (
                  <>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-accent/50 border border-accent mb-4">
                      <div>
                        <p className="font-semibold text-foreground">{subscription.planName}</p>
                        <p className="text-sm text-muted-foreground">
                          {subscription.price === 0
                            ? `Free Trial — ${subscription.trialDaysRemaining} days remaining`
                            : `Rs. ${subscription.price.toLocaleString()}/month`}
                        </p>
                      </div>
                      <Badge variant={statusVariant(subscription.status)} className="capitalize">
                        {subscription.status === 'trial' ? 'Trial Active' : subscription.status}
                      </Badge>
                    </div>

                    {/* Billing Cycle (Netflix style) */}
                    {subscription.status === 'active' && subscription.currentPeriodEnd && (
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-4">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span className="font-medium">
                            Billing Cycle: {fmtDate(subscription.currentPeriodStart)} – {fmtDate(subscription.currentPeriodEnd)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Next billing date: <strong>{fmtDate(subscription.currentPeriodEnd)}</strong>
                        </p>
                        <div className="mt-3 w-full bg-primary/20 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-primary h-full transition-all"
                            style={{
                              width: `${Math.max(0, 100 - (daysUntil(subscription.currentPeriodEnd) / 30) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {daysUntil(subscription.currentPeriodEnd)} days remaining
                        </p>
                      </div>
                    )}

                    {/* Usage meters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {([
                        { label: "Messages",    used: subscription.usage.messages,    limit: subscription.limits.messages },
                        { label: "AI Queries",  used: subscription.usage.aiQueries,   limit: subscription.limits.aiQueries },
                        { label: "Invoices",    used: subscription.usage.invoices,    limit: subscription.limits.invoices },
                        { label: "Team",        used: subscription.usage.teamMembers, limit: subscription.limits.teamMembers },
                      ]).map((u) => (
                        <div key={u.label} className="p-3 rounded-lg bg-muted/50 text-center">
                          <p className="text-xs text-muted-foreground">{u.label}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">
                            {u.used} / {fmtLimit(u.limit)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Cancel button */}
                    {subscription.status === 'active' && (
                      <Button
                        variant="destructive"
                        className="w-full mt-4"
                        disabled={cancelling}
                        onClick={handleCancelSubscription}
                      >
                        {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscription found.</p>
                )}
              </Card>

              {/* Plan selection cards */}
              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-5">
                  {subscription?.status === 'active' ? 'Change or Upgrade Plan' : 'Choose a Plan'}
                </h3>
                {subLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {allPlans.map((plan) => {
                      const Icon = planIcons[plan.id] ?? Zap;
                      const isCurrent = subscription?.plan === plan.id;
                      const isPopular = plan.id === 'professional';

                      return (
                        <div
                          key={plan.id}
                          className={`relative rounded-xl border-2 p-5 flex flex-col gap-4 transition-all cursor-pointer hover:shadow-lg ${
                            isCurrent
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50 bg-muted/30'
                          }`}
                        >
                          {isPopular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                              MOST POPULAR
                            </span>
                          )}

                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-semibold text-foreground">{plan.name}</span>
                          </div>

                          <div>
                            <p className="text-3xl font-bold text-foreground">
                              Rs. {plan.price}
                              <span className="text-sm font-normal text-muted-foreground">/month</span>
                            </p>
                          </div>

                          <ul className="space-y-2 text-xs text-muted-foreground flex-1">
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-success shrink-0" />
                              {fmtLimit(plan.limits.messages)} messages
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-success shrink-0" />
                              {fmtLimit(plan.limits.aiQueries)} AI queries
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-success shrink-0" />
                              {fmtLimit(plan.limits.invoices)} invoices
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-success shrink-0" />
                              {fmtLimit(plan.limits.teamMembers)} team members
                            </li>
                          </ul>

                          {isCurrent ? (
                            <Badge variant="default" className="w-full justify-center">
                              ✓ Current Plan
                            </Badge>
                          ) : (
                            <Button
                              variant={isPopular ? 'hero' : 'outline'}
                              size="sm"
                              className="w-full"
                              onClick={() => setPaymentModal({ open: true, selectedPlan: plan, processing: false })}
                            >
                              <ArrowRight className="h-3.5 w-3.5 mr-1" />
                              Get Started
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Payment method */}
              <Card className="p-6 border-0 shadow-premium bg-card">
                <h3 className="text-base font-semibold text-foreground mb-4">Payment Method</h3>
                {subscription?.paymentMethod ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{subscription.paymentMethod}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                    No payment method on file. Add one after selecting a plan.
                  </p>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* ── SECURITY TAB ── */}
          <TabsContent value="security">
            <Card className="p-6 border-0 shadow-premium bg-card">
              <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Security Settings
              </h3>
              <div className="space-y-5">
                <div>
                  <Label>Change Password</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                    <Input
                      type="password"
                      placeholder="Current password"
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="New password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={saving === 'security' || !currentPass || !newPass}
                    onClick={async () => {
                      await save('security', { currentPassword: currentPass, newPassword: newPass });
                      setCurrentPass(''); setNewPass('');
                    }}
                  >
                    {saving === 'security' ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Extra layer of security on login</p>
                  </div>
                  <Switch
                    checked={twoFactor}
                    onCheckedChange={async (v) => {
                      setTwoFactor(v);
                      await save('security', { twoFactorEnabled: v });
                    }}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Login Alerts</p>
                    <p className="text-xs text-muted-foreground">Notify me of new sign-ins</p>
                  </div>
                  <Switch
                    checked={loginAlerts}
                    onCheckedChange={async (v) => {
                      setLoginAlerts(v);
                      await save('security', { loginAlerts: v });
                    }}
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, selectedPlan: null, processing: false })}
        plan={paymentModal.selectedPlan}
        onConfirm={handleActivatePlan}
        loading={paymentModal.processing}
      />
    </AppLayout>
  );
};

export default Settings;
