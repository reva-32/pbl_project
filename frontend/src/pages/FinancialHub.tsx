import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  IndianRupee,
  FileText,
  AlertTriangle,
  Download,
  FileBarChart,
  Loader2,
  ChevronDown,
  PieChart as PieChartIcon,
} from "lucide-react";
import { apiFetch, resolveInvoicePdfUrl } from "@/lib/api";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const statusBadge = (status: string) => {
  const s = status.toUpperCase();
  if (s === "FILED" || s === "PAID" || s === "APPROVED") return "success";
  if (s === "PENDING") return "warning";
  if (s === "DISCARDED" || s === "REJECTED") return "destructive";
  return "secondary";
};

const COLORS = ["hsl(225 84% 55%)", "hsl(213 72% 48%)", "hsl(199 89% 48%)", "hsl(220 14% 84%)"];

const FinancialHub = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [gstReturns, setGstReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [invRes, gstRes] = await Promise.all([
      apiFetch<any[]>("/events?type=INVOICE"),
      apiFetch<any[]>("/events?type=GST_RETURN"),
    ]);

    if (invRes.data) setInvoices(invRes.data);
    if (gstRes.data) setGstReturns(gstRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await apiFetch(`/events/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(`Status updated to ${newStatus}`);

    setInvoices((prev) =>
      prev.map((inv) => (inv._id === id ? { ...inv, status: newStatus.toUpperCase() } : inv)),
    );
  };

  const totalRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.content?.amount) || 0), 0);
  const outstandingCount = invoices.filter(
    (inv) => inv.status !== "PAID" && inv.status !== "APPROVED",
  ).length;
  const outstandingValue = invoices
    .filter((inv) => inv.status !== "PAID" && inv.status !== "APPROVED")
    .reduce((sum, inv) => sum + (parseFloat(inv.content?.amount) || 0), 0);
  const estimatedGst = totalRevenue * 0.18;

  const paidCount = invoices.filter((inv) =>
    ["PAID", "APPROVED"].includes(String(inv.status || "").toUpperCase()),
  ).length;
  const completion =
    invoices.length === 0 ? 0 : Math.round((paidCount / invoices.length) * 100);

  const revenueTrend = useMemo(() => {
    const pts: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const amount = invoices
        .filter((inv) => {
          if (!inv.timestamp) return false;
          const t = new Date(inv.timestamp).getTime();
          return t >= start.getTime() && t < end.getTime();
        })
        .reduce((s, inv) => s + (parseFloat(inv.content?.amount) || 0), 0);
      pts.push({ label, amount });
    }
    return pts;
  }, [invoices]);

  const gstDonut = useMemo(() => {
    if (!gstReturns.length) return [];
    const map = new Map<string, number>();
    gstReturns.forEach((r) => {
      const k = String(r.status || "UNKNOWN").toUpperCase();
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [gstReturns]);

  const paymentBars = useMemo(() => {
    return [
      { label: "Paid", value: paidCount },
      { label: "Outstanding", value: outstandingCount },
    ];
  }, [paidCount, outstandingCount]);

  const dynamicWidgets = [
    {
      label: "Total invoiced",
      value: `₹${totalRevenue.toLocaleString()}`,
      icon: IndianRupee,
      change: `${invoices.length} total invoices`,
    },
    {
      label: "Outstanding invoices",
      value: `₹${outstandingValue.toLocaleString()}`,
      icon: FileText,
      change: `${outstandingCount} pending`,
    },
    {
      label: "Estimated GST liability",
      value: `₹${estimatedGst.toLocaleString()}`,
      icon: AlertTriangle,
      change: "Based on 18% slab",
    },
  ];

  return (
    <AppLayout title="Financial Hub">
      <motion.div
        className="max-w-7xl mx-auto space-y-8 pb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-2">
            Finance
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Financial Hub
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Revenue, GST posture, and invoice completion — composed from your existing ledger data.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {dynamicWidgets.map((w) => (
            <GlassCard key={w.label} className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <w.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{w.label}</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{w.value}</p>
              <p className="text-xs text-muted-foreground mt-2">{w.change}</p>
            </GlassCard>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <GlassCard className="p-5 sm:p-6 xl:col-span-2">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Revenue trend</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Weekly buckets from invoice timestamps in your ledger.
            </p>
            <div className="h-[240px] w-full min-h-[200px]">
              {loading ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(220 13% 91%)",
                        boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      name="Invoiced (₹)"
                      stroke="hsl(225 84% 55%)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(225 84% 55%)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground tracking-tight">GST mix</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Status distribution from GST return events.</p>
            {loading ? (
              <Skeleton className="h-52 w-full rounded-xl flex-1" />
            ) : gstDonut.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <FileBarChart className="h-8 w-8 text-primary/60" />
                </div>
                <p className="text-sm font-medium text-foreground">No GST records yet</p>
                <p className="text-xs text-muted-foreground mt-2 max-w-[220px] leading-relaxed">
                  When GSTR events sync into your workspace, a soft donut breakdown appears here.
                </p>
              </div>
            ) : (
              <div className="h-52 w-full min-h-[200px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gstDonut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {gstDonut.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Payment completion</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Paid vs outstanding invoice counts.</p>
            <div className="h-[200px]">
              {loading ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(225 84% 55% / 0.06)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(220 13% 91%)" }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="hsl(225 84% 55%)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Outstanding progress</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Recovery indicator from paid share of all invoices.
            </p>
            {loading ? (
              <Skeleton className="h-3 w-full rounded-full" />
            ) : (
              <>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-semibold text-foreground tabular-nums">{completion}%</span>
                </div>
                <Progress value={completion} className="h-3 rounded-full bg-slate-100" />
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {invoices.length === 0
                    ? "Generate invoices from AI Command Center to populate this view."
                    : `${paidCount} paid · ${outstandingCount} open · ₹${outstandingValue.toLocaleString()} outstanding.`}
                </p>
              </>
            )}
          </GlassCard>
        </div>

        <GlassCard hover={false} className="overflow-hidden p-0">
          <div className="p-5 pb-0 flex items-center justify-between border-b border-slate-100 bg-white/60">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">GST returns</h3>
            <FileBarChart className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead>Month</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : gstReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                      No GST records found. Sync your portal to view returns.
                    </TableCell>
                  </TableRow>
                ) : (
                  gstReturns.map((r) => (
                    <TableRow
                      key={r._id}
                      className="border-slate-100 transition-colors duration-200 hover:bg-primary/[0.03]"
                    >
                      <TableCell className="font-medium">
                        {r.content?.month || new Date(r.timestamp).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{r.content?.type || "GSTR-3B"}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge(r.status) as any} className="rounded-md">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="rounded-xl">
                          Generate report
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="overflow-hidden p-0">
          <div className="p-5 pb-0 border-b border-slate-100 bg-white/60">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Invoice ledger</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      No invoices generated yet. Ask AI to generate one.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv._id}
                      className="border-slate-100 transition-all duration-200 hover:bg-primary/[0.04] hover:shadow-sm"
                    >
                      <TableCell className="font-medium">INV-{inv._id?.slice(-5)}</TableCell>
                      <TableCell>{inv.content?.client || "Unknown"}</TableCell>
                      <TableCell className="tabular-nums">₹{inv.content?.amount || "0"}</TableCell>
                      <TableCell>{new Date(inv.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg hover:bg-transparent">
                              <Badge
                                variant={statusBadge(inv.status) as any}
                                className="cursor-pointer flex items-center gap-1 rounded-md group"
                              >
                                {inv.status}
                                <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                              </Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="rounded-xl">
                            <DropdownMenuItem onClick={() => handleStatusChange(inv._id, "PAID")}>
                              Mark as paid
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(inv._id, "PENDING")}>
                              Mark as pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(inv._id, "DISCARDED")}>
                              Discard deal
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl gap-1.5"
                          onClick={() => {
                            const href = resolveInvoicePdfUrl(inv.content?.downloadUrl);
                            if (href) window.open(href, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </GlassCard>
      </motion.div>
    </AppLayout>
  );
};

export default FinancialHub;
