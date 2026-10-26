import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Loader2, Plus, Users, ShieldCheck, Building2 } from "lucide-react";
import { motion } from "framer-motion";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "V";
}

const Directory = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", email: "", phone: "" });

  const loadVendors = async () => {
    const { data } = await apiFetch<any[]>("/vendors");
    if (data) setVendors(data);
    setLoading(false);
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const handleCreate = async () => {
    if (!newVendor.name) {
      toast.error("Vendor name is required");
      return;
    }
    setIsCreating(true);

    const loadingToast = toast.loading("Adding vendor…");
    const { error } = await apiFetch<any>("/vendors", {
      method: "POST",
      body: JSON.stringify({ ...newVendor, reliabilityScore: 100 }),
    });

    setIsCreating(false);
    if (error) {
      toast.dismiss(loadingToast);
      toast.error(error || "Failed to create vendor");
    } else {
      toast.dismiss(loadingToast);
      toast.success("Vendor added");
      setNewVendor({ name: "", email: "", phone: "" });
      loadVendors();
    }
  };

  return (
    <AppLayout title="Business Directory">
      <motion.div
        className="max-w-5xl mx-auto space-y-8 pb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-2">
            Network
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex flex-wrap items-center gap-2">
            <Users className="h-7 w-7 text-primary shrink-0" />
            Vendor directory
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Manage your vendors. Records are also synced to Google Sheets when that integration is connected.
          </p>
        </div>

        <GlassCard className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-foreground mb-5 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Add new vendor
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-1 xl:col-span-1">
              <label className="text-xs text-muted-foreground font-medium">Vendor name *</label>
              <Input
                placeholder="e.g. Acme Corp"
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                className="rounded-xl border-slate-200/90 bg-white/80 focus-visible:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input
                placeholder="vendor@example.com"
                value={newVendor.email}
                onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                className="rounded-xl border-slate-200/90 bg-white/80 focus-visible:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Phone</label>
              <Input
                placeholder="Optional"
                value={newVendor.phone}
                onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                className="rounded-xl border-slate-200/90 bg-white/80 focus-visible:ring-primary/20"
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              variant="hero"
              className="rounded-xl h-11 w-full md:w-auto xl:w-full"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Save &amp; sync
            </Button>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent bg-white/50">
                  <TableHead className="w-14" />
                  <TableHead>Vendor name</TableHead>
                  <TableHead>Contact email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reliability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : vendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 px-4">
                      <div className="max-w-sm mx-auto">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                          <Users className="h-8 w-8 text-primary/70" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No vendors yet</p>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          Add your first supplier or partner above. They will appear here with a reliability
                          score after sync.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  vendors.map((v) => (
                    <TableRow
                      key={v._id}
                      className="border-slate-100 transition-colors duration-200 hover:bg-primary/[0.03]"
                    >
                      <TableCell>
                        <Avatar className="h-9 w-9 rounded-xl ring-1 ring-slate-100">
                          <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-xs font-semibold">
                            {initials(v.name || "V")}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-muted-foreground">{v.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{v.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium text-sm">
                          <ShieldCheck className="h-4 w-4" /> {v.reliabilityScore}/100
                        </div>
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

export default Directory;
