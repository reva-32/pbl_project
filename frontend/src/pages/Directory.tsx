import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Loader2, Plus, Users, ShieldCheck } from "lucide-react";

const Directory = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", email: "", phone: "" });

  const loadVendors = async () => {
    const { data } = await apiFetch<any[]>('/vendors');
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
    
    // Attempt dual sync
    const loadingToast = toast.loading("Adding vendor and syncing to Google Sheets...");
    const { data, error } = await apiFetch<any>('/vendors', {
      method: "POST",
      body: JSON.stringify({ ...newVendor, reliabilityScore: 100 })
    });
    
    setIsCreating(false);
    if (error) {
      toast.dismiss(loadingToast);
      toast.error(error || "Failed to create vendor");
    } else {
      toast.dismiss(loadingToast);
      toast.success("Vendor added & synced successfully!");
      setNewVendor({ name: "", email: "", phone: "" });
      loadVendors();
    }
  };

  return (
    <AppLayout title="Business Directory">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Vendor Directory
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your vendors. Changes are automatically dual-synced to your Google Wallet / Sheets.
            </p>
          </div>
        </div>

        {/* Add new vendor form */}
        <Card className="p-5 shadow-premium border-0 bg-card">
          <h3 className="text-md font-semibold mb-4">Add New Vendor</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Vendor Name *</label>
              <Input 
                placeholder="e.g. Acme Corp" 
                value={newVendor.name} 
                onChange={(e) => setNewVendor({...newVendor, name: e.target.value})} 
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input 
                placeholder="vendor@example.com" 
                value={newVendor.email} 
                onChange={(e) => setNewVendor({...newVendor, email: e.target.value})} 
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Phone</label>
              <Input 
                placeholder="Optional" 
                value={newVendor.phone} 
                onChange={(e) => setNewVendor({...newVendor, phone: e.target.value})} 
              />
            </div>
            <Button onClick={handleCreate} disabled={isCreating} variant="hero">
              {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Save & Sync
            </Button>
          </div>
        </Card>

        {/* Vendor Table */}
        <Card className="shadow-premium border-0 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Contact Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Reliability Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    No vendors found. Add one above.
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((v) => (
                  <TableRow key={v._id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.email || "—"}</TableCell>
                    <TableCell>{v.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-success">
                        <ShieldCheck className="h-4 w-4" /> {v.reliabilityScore}/100
                      </div>
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

export default Directory;
