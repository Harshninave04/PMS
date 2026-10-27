"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { PlusCircle, Search, Pencil, Trash2, Loader2, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { usePermissions } from "@/components/permissions/permission-context";
import { fmtMoney } from "@/lib/money";

interface ServiceItem {
  _id: string;
  name: string;
  category: string;
  defaultRate: number;
  active: boolean;
}

interface ServiceForm {
  name: string;
  category: string;
  defaultRate: number | "";
  active: boolean;
}

const CATEGORY_SUGGESTIONS = [
  "Consultation",
  "Lab",
  "Radiology",
  "Procedure",
  "Room",
  "Nursing",
  "Consumables",
  "Transport",
  "Pharmacy",
  "Other"
];

export default function BillingRatesPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canCreate = can("billing.rates:create");
  const canUpdate = can("billing.rates:update");
  const canDelete = can("billing.rates:delete");

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState<ServiceForm>({ name: "", category: "General", defaultRate: "", active: true });
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/service");
      const json = await res.json();
      if (json.success) {
        setServices(json.data || []);
      } else {
        toast(json.message || "Failed to load services", "error");
      }
    } catch {
      toast("Failed to load services", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load is async; every setState happens after the fetch awaits
    fetchServices();
  }, [fetchServices]);

  const filtered = services.filter((s) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setSaveError("");
    setEditingService(null);
    setForm({ name: "", category: "General", defaultRate: "", active: true });
    setDialogOpen(true);
  };

  const openEdit = (service: ServiceItem) => {
    setSaveError("");
    setEditingService(service);
    setForm({
      name: service.name,
      category: service.category || "General",
      defaultRate: service.defaultRate,
      active: service.active !== false
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingService(null);
  };

  const setField = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError("");
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const rate = Number(form.defaultRate);
    if (!name) { setSaveError("Service name is required."); return; }
    if (name.length > 100) { setSaveError("Service name must be 100 characters or fewer."); return; }
    if (form.defaultRate === "" || !Number.isFinite(rate) || rate < 0) {
      setSaveError("Default rate must be zero or a positive number.");
      return;
    }
    const category = (form.category.trim() || "General").slice(0, 60);

    setSaveLoading(true);
    try {
      const payload = { name, category, defaultRate: rate, active: form.active };
      const res = editingService
        ? await fetch(`/api/service/${editingService._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        : await fetch("/api/service", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.message || "Could not save the service.");
        return;
      }
      toast(editingService ? "Service updated" : "Service created", "success");
      closeDialog();
      await fetchServices();
    } catch {
      setSaveError("Could not save the service. Check your connection and retry.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/service/${deleteTarget._id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        toast(json.message || "Delete failed", "error");
        return;
      }
      toast("Service deleted", "success");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchServices();
    } catch {
      toast("Delete failed", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Service Rates</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Price list for the billing autocomplete — bills snapshot name and rate, so changes only affect future bills
          </p>
        </div>
        <Button onClick={openCreate} disabled={!canCreate} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20">
          <PlusCircle className="h-4 w-4" />
          Add Service
        </Button>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Tag className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">All Services</CardTitle>
                <CardDescription className="text-xs font-semibold">{filtered.length} service{filtered.length !== 1 ? "s" : ""} found</CardDescription>
              </div>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Default Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No services yet. Add the ones your billing team prices most often.
                  </TableCell>
                </TableRow>
              ) : (                filtered.map((service) => (
                  <TableRow key={service._id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>{service.category}</TableCell>
                    <TableCell>{fmtMoney(service.defaultRate)}</TableCell>
                    <TableCell>
                      {service.active !== false ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(service)}
                        disabled={!canUpdate}
                        title={canUpdate ? "Edit service" : "You need billing rates update permission"}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setDeleteTarget(service); setDeleteOpen(true); }}
                        disabled={!canDelete}
                        title={canDelete ? "Delete service" : "You need billing rates delete permission"}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              {editingService
                ? "Only future bills use the new rate; existing rows keep their snapshot."
                : "The rate here is pre-filled when the service is picked on Create Bill."}
            </DialogDescription>
          </DialogHeader>
          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
          )}
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="service-name">Service name</Label>
              <Input
                id="service-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Nursing charge"
                maxLength={100}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="service-category">Category</Label>
              <Input
                id="service-category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="e.g. Nursing"
                maxLength={60}
              />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setField("category", suggestion)}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="service-rate">Default rate (₹)</Label>
              <Input
                id="service-rate"
                type="number"
                min={0}
                step="0.01"
                value={form.defaultRate}
                onChange={(e) => setField("defaultRate", e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              {form.active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
              <input
                type="checkbox"
                className="sr-only"
                checked={form.active}
                onChange={(e) => setField("active", e.target.checked)}
              />
              Offer this service in billing autocomplete
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saveLoading}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveLoading}>
              {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingService ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete service</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{deleteTarget?.name}&rdquo; from the list? Bills already issued keep their snapshot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteTarget(null); }} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
