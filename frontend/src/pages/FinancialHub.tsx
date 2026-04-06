import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IndianRupee, FileText, AlertTriangle, Download, FileBarChart, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

// Removed mock GST arrays and widgets

const statusBadge = (status: string) => {
  if (status === "Filed" || status === "Paid") return "success";
  if (status === "Pending") return "warning";
  return "destructive";
};

const FinancialHub = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [gstReturns, setGstReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [invRes, gstRes] = await Promise.all([
        apiFetch<any[]>('/events?type=INVOICE'),
        apiFetch<any[]>('/events?type=GST_RETURN')
      ]);
      
      if (invRes.data) setInvoices(invRes.data);
      if (gstRes.data) setGstReturns(gstRes.data);
      
      setLoading(false);
    }
    loadData();
  }, []);

  // Compute dynamic widgets based on AI invoices
  const totalRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.content?.amount) || 0), 0);
  const outstandingCount = invoices.filter(inv => inv.status !== 'Paid' && inv.status !== 'Resolved').length;
  const outstandingValue = invoices
    .filter(inv => inv.status !== 'Paid' && inv.status !== 'Resolved')
    .reduce((sum, inv) => sum + (parseFloat(inv.content?.amount) || 0), 0);
  const estimatedGst = totalRevenue * 0.18; // Flat 18% estimation

  const dynamicWidgets = [
    { label: "Total Invoiced", value: `₹${totalRevenue.toLocaleString()}`, icon: IndianRupee, change: `${invoices.length} total invoices` },
    { label: "Outstanding Invoices", value: `₹${outstandingValue.toLocaleString()}`, icon: FileText, change: `${outstandingCount} pending` },
    { label: "Estimated GST Liability", value: `₹${estimatedGst.toLocaleString()}`, icon: AlertTriangle, change: "Based on 18% slab" },
  ];

  return (
  <AppLayout title="Financial Hub">
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {dynamicWidgets.map((w) => (
          <Card key={w.label} className="p-5 shadow-premium border-0 bg-card">
            <div className="flex items-center justify-between mb-3">
              <div className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                <w.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{w.label}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{w.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{w.change}</p>
          </Card>
        ))}
      </div>

      {/* GST Returns */}
      <Card className="shadow-premium border-0 bg-card">
        <div className="p-5 pb-0 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">GST Returns</h2>
          <FileBarChart className="h-5 w-5 text-muted-foreground" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                 <TableCell colSpan={4} className="text-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell>
              </TableRow>
            ) : gstReturns.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No GST records found. Sync your portal to view returns.</TableCell>
              </TableRow>
            ) : (
                gstReturns.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">{r.content?.month || new Date(r.timestamp).toLocaleDateString()}</TableCell>
                    <TableCell>{r.content?.type || "GSTR-3B"}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(r.status) as any}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">Generate Report</Button>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Invoice Ledger */}
      <Card className="shadow-premium border-0 bg-card">
        <div className="p-5 pb-0 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Invoice Ledger</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Client Name</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                 <TableCell colSpan={6} className="text-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No invoices generated yet. Ask AI to generate one.</TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv._id}>
                  <TableCell className="font-medium">INV-{inv._id?.slice(-5)}</TableCell>
                  <TableCell>{inv.content?.client || "Unknown"}</TableCell>
                  <TableCell>₹{inv.content?.amount || "0"}</TableCell>
                  <TableCell>{new Date(inv.timestamp).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadge(inv.status) as any}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  </AppLayout>
  );
};

export default FinancialHub;
