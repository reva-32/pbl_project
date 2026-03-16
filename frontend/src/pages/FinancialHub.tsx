import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IndianRupee, FileText, AlertTriangle, Download, FileBarChart } from "lucide-react";

const widgets = [
  { label: "Monthly Revenue", value: "₹8,40,000", icon: IndianRupee, change: "+12% vs last month" },
  { label: "Outstanding Invoices", value: "₹1,85,000", icon: FileText, change: "7 invoices pending" },
  { label: "Estimated GST Liability", value: "₹62,400", icon: AlertTriangle, change: "Due by 20th March" },
];

const gstReturns = [
  { month: "January 2026", status: "Filed", type: "GSTR-3B" },
  { month: "February 2026", status: "Pending", type: "GSTR-3B" },
  { month: "March 2026", status: "Overdue", type: "GSTR-1" },
  { month: "December 2025", status: "Filed", type: "GSTR-3B" },
];

const invoices = [
  { id: "INV-1048", client: "Tata Steel Ltd", amount: "₹2,40,000", date: "Feb 15, 2026", status: "Paid" },
  { id: "INV-1047", client: "Reliance Retail", amount: "₹1,85,000", date: "Feb 10, 2026", status: "Unpaid" },
  { id: "INV-1046", client: "Mahindra Corp", amount: "₹95,000", date: "Feb 02, 2026", status: "Paid" },
  { id: "INV-1045", client: "Infosys BPM", amount: "₹3,20,000", date: "Jan 28, 2026", status: "Paid" },
  { id: "INV-1044", client: "Wipro Technologies", amount: "₹78,500", date: "Jan 20, 2026", status: "Unpaid" },
];

const statusBadge = (status: string) => {
  if (status === "Filed" || status === "Paid") return "success";
  if (status === "Pending") return "warning";
  return "destructive";
};

const FinancialHub = () => (
  <AppLayout title="Financial Hub">
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {widgets.map((w) => (
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
            {gstReturns.map((r) => (
              <TableRow key={r.month + r.type}>
                <TableCell className="font-medium">{r.month}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>
                  <Badge variant={statusBadge(r.status) as any}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm">Generate Report</Button>
                </TableCell>
              </TableRow>
            ))}
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
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.id}</TableCell>
                <TableCell>{inv.client}</TableCell>
                <TableCell>{inv.amount}</TableCell>
                <TableCell>{inv.date}</TableCell>
                <TableCell>
                  <Badge variant={statusBadge(inv.status) as any}>{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  </AppLayout>
);

export default FinancialHub;
