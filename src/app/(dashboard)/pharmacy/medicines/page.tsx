"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Pill,
  Plus,
  Search,
  Filter,
  Download,
  Sparkles,
  Edit2,
  Trash2,
  AlertTriangle,
  Boxes,
  MapPin,
  Calendar,
  IndianRupee,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dosageFilter, setDosageFilter] = useState("ALL");
  const [isOpen, setIsOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(
    null,
  );
  const [detailTab, setDetailTab] = useState("Details");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    category: "Antibiotics",
    genericName: "",
    dosageForm: "TABLET",
    manufacturer: "",
    batchNumber: "",
    rackLocation: "Rack A-01",
    shelfNumber: "Shelf 1",
    hsnCode: "30049099",
    gstRate: 12,
    expiryDate: "",
    unitPrice: 0,
    stockQuantity: 0,
    reorderLevel: 10,
    description: "",
  });

  const fetchMedicines = async () => {
    try {
      setLoading(true);
      const [medRes, catRes] = await Promise.all([
        fetch("/api/pharmacy/medicines"),
        fetch("/api/pharmacy/categories"),
      ]);
      const medData = await medRes.json();
      if (medData.success) setMedicines(medData.data || []);

      const catData = await catRes.json();
      if (catData.success) setCategories(catData.data || []);

      try {
        const sugRes = await fetch("/api/pharmacy/suggestions");
        const sugData = await sugRes.json();
        setSuggestions(
          sugRes.ok && sugData.success ? sugData.data || [] : [],
        );
      } catch {
        // Suggestions are supplementary.
        setSuggestions([]);
      }
    } catch (err) {
      console.error(err);
      toast("Failed to load medicines", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const matchesSearch =
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.genericName?.toLowerCase().includes(search.toLowerCase()) ||
        m.batchNumber?.toLowerCase().includes(search.toLowerCase()) ||
        m.rackLocation?.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "ALL" || m.category === categoryFilter;

      const matchesDosage =
        dosageFilter === "ALL" || m.dosageForm === dosageFilter;

      return matchesSearch && matchesCategory && matchesDosage;
    });
  }, [medicines, search, categoryFilter, dosageFilter]);

  const levocetirizine = medicines.find((m) =>
    m.name?.toLowerCase().includes("levocetirizine"),
  );
  const selectedMedicine =
    medicines.find((m) => m._id === selectedMedicineId) ||
    levocetirizine ||
    filteredMedicines[0] ||
    medicines[0];
  const displayedMedicines = [...filteredMedicines].sort((a, b) => {
    const aIsLevocetirizine = a.name?.toLowerCase().includes("levocetirizine");
    const bIsLevocetirizine = b.name?.toLowerCase().includes("levocetirizine");
    return Number(bIsLevocetirizine) - Number(aIsLevocetirizine);
  });
  const totalPages = Math.max(1, Math.ceil(displayedMedicines.length / pageSize));
  const pageMedicines = displayedMedicines.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, dosageFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const lowStockCount = medicines.filter(
    (m) => Number(m.stockQuantity || 0) <= Number(m.reorderLevel || 10),
  ).length;
  const expiringSoonCount = medicines.filter((m) => {
    if (!m.expiryDate) return false;
    const days = (new Date(m.expiryDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  }).length;

  const handleOpenCreate = () => {
    openCreatePrefilled("");
  };

  const openCreatePrefilled = (name: string) => {
    setEditingMedicine(null);
    setFormData({
      name,
      category: categories[0]?.name || "Antibiotics",
      genericName: "",
      dosageForm: "TABLET",
      manufacturer: "",
      batchNumber: `BAT-${Math.floor(1000 + Math.random() * 9000)}`,
      rackLocation: "Rack A-01",
      shelfNumber: "Shelf 1",
      hsnCode: "30049099",
      gstRate: 12,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      unitPrice: 50,
      stockQuantity: 100,
      reorderLevel: 20,
      description: "",
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (med: any) => {
    setEditingMedicine(med);
    setFormData({
      name: med.name || "",
      category: med.category || "Antibiotics",
      genericName: med.genericName || "",
      dosageForm: med.dosageForm || "TABLET",
      manufacturer: med.manufacturer || "",
      batchNumber: med.batchNumber || "",
      rackLocation: med.rackLocation || "Rack A-01",
      shelfNumber: med.shelfNumber || "Shelf 1",
      hsnCode: med.hsnCode || "30049099",
      gstRate: med.gstRate || 12,
      expiryDate: med.expiryDate
        ? new Date(med.expiryDate).toISOString().slice(0, 10)
        : "",
      unitPrice: med.unitPrice || 0,
      stockQuantity: med.stockQuantity || 0,
      reorderLevel: med.reorderLevel || 10,
      description: med.description || "",
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const url = editingMedicine
        ? `/api/pharmacy/medicines/${editingMedicine._id}`
        : "/api/pharmacy/medicines";
      const method = editingMedicine ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          editingMedicine
            ? "Medicine updated successfully"
            : "Medicine added successfully",
          "success",
        );
        setIsOpen(false);
        fetchMedicines();
      } else {
        toast(data.message || "Failed to save medicine", "error");
      }
    } catch (err) {
      toast("Error submitting medicine", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/pharmacy/medicines/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast("Medicine deleted", "success");
        fetchMedicines();
      } else {
        toast(data.message || "Delete failed", "error");
      }
    } catch (err) {
      toast("Failed to delete medicine", "error");
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Name",
      "Generic Name",
      "Category",
      "Dosage Form",
      "Batch Number",
      "Rack Location",
      "Unit Price (INR)",
      "Stock Quantity",
      "Reorder Level",
      "Expiry Date",
    ];
    const rows = filteredMedicines.map((m) => [
      `"${m.name}"`,
      `"${m.genericName || ""}"`,
      `"${m.category}"`,
      m.dosageForm || "TABLET",
      m.batchNumber || "",
      `"${m.rackLocation || ""}"`,
      m.unitPrice || 0,
      m.stockQuantity || 0,
      m.reorderLevel || 10,
      m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `medistra_medicines_catalog_${Date.now()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Medicines catalog exported as CSV", "success");
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.55fr_1fr_1fr_1fr]">
        <div className="relative flex min-h-[112px] items-center overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-white px-6 py-5 shadow-sm dark:border-emerald-900 dark:from-emerald-950/50 dark:to-slate-900">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
              Pharmacy
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Medicines Catalog
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Manage formulations, pricing, stock and expiry in one place.
            </p>
          </div>
          <div
            aria-hidden="true"
            className="absolute -right-3 -top-8 h-40 w-40 rounded-full bg-emerald-200/40 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="absolute right-9 top-7 hidden h-12 w-24 rotate-[-32deg] rounded-full border border-white/80 bg-gradient-to-br from-emerald-300 to-emerald-600 shadow-lg sm:block"
          >
            <span className="absolute left-1/2 h-full border-l border-white/60" />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] text-slate-500">Total medicines</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {medicines.length}
            </p>
            <p className="text-[10px] text-emerald-600">Catalog items</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] text-slate-500">Low stock</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {lowStockCount}
            </p>
            <p className="text-[10px] text-amber-600">Needs attention</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
            <Calendar className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] text-slate-500">Expiring soon</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {expiringSoonCount}
            </p>
            <p className="text-[10px] text-rose-600">Within 30 days</p>
          </div>
        </div>
      </div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Pill className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Medicines Catalog
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Formulations, batch serials, unit pricing in ₹, shelf locations, and
            stock reorder thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMedicines}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4" />
            Add Medicine
          </Button>
        </div>
      </div>

      {/* Doctor requests: prescribed on rounds but missing from stock */}
      {suggestions.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Requested by doctors — not in stock ({suggestions.length})
            </p>
            <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
              Add these to stock so ward orders can be dispensed.
            </p>
            <div className="mt-3 space-y-2">
              {suggestions.slice(0, 8).map((s: any) => (
                <div key={s.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white dark:bg-slate-900 px-3 py-2">
                  <div className="text-xs">
                    <span className="font-semibold">{s.name}</span>
                    {s.exampleDosage && <span className="text-slate-500"> e.g. {s.exampleDosage}</span>}
                    <span className="ml-2 text-[11px] text-amber-700">
                      ordered {s.timesOrdered}x{s.lastOrderedAt ? `, last ${new Date(s.lastOrderedAt).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => openCreatePrefilled(s.name)}>
                    <Plus className="h-3 w-3 mr-1" /> Add to stock
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Toolbar */}      <Card className="border shadow-sm bg-white dark:bg-slate-900">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by drug name, generic, batch or rack..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>

            <div>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories ({medicines.length})</option>
                {categories.map((c: any) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={dosageFilter}
                onChange={(e) => setDosageFilter(e.target.value)}
              >
                <option value="ALL">All Formulations</option>
                <option value="TABLET">Tablet</option>
                <option value="CAPSULE">Capsule</option>
                <option value="SYRUP">Syrup</option>
                <option value="INJECTION">Injection</option>
                <option value="IV_FLUID">IV Fluid</option>
                <option value="INHALER">Inhaler</option>
                <option value="OINTMENT">Ointment / Gel</option>
                <option value="DROPS">Drops</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
        {/* Medicines Table */}
        <Card className="border shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Boxes className="h-4 w-4 text-emerald-600" />
              Catalog Directory ({filteredMedicines.length} Formulations)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead>Medicine Name</TableHead>
                  <TableHead>Formulation</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Batch &amp; Rack</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Unit Price (₹)</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageMedicines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-slate-400"
                    >
                      No medicines match the search criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageMedicines.map((med) => {
                    const isLow = med.stockQuantity <= (med.reorderLevel || 10);
                    const isNil = med.stockQuantity === 0;
                    const isExpired =
                      med.expiryDate && new Date(med.expiryDate) < new Date();

                    return (
                      <TableRow
                        key={med._id}
                        onClick={() => setSelectedMedicineId(med._id)}
                        className={`cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-slate-800/40 ${selectedMedicine?._id === med._id ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
                      >
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {med.name}
                          </div>
                          {med.genericName && (
                            <div className="text-[11px] text-slate-500 italic">
                              {med.genericName}
                            </div>
                          )}
                          {med.manufacturer && (
                            <div className="text-[10px] text-slate-400">
                              Mfg: {med.manufacturer}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            {med.dosageForm || "TABLET"}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {med.category}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                            {med.batchNumber || "N/A"}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {med.rackLocation || "Rack A-01"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div
                            className={`text-[11px] ${isExpired ? "text-rose-600 font-bold" : "text-slate-600 dark:text-slate-300"}`}
                          >
                            {med.expiryDate
                              ? new Date(med.expiryDate).toLocaleDateString()
                              : "N/A"}
                          </div>
                          {isExpired && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] px-1 py-0"
                            >
                              EXPIRED
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-bold text-slate-900 dark:text-white">
                          ₹{(med.unitPrice || 0).toLocaleString("en-IN")}
                        </TableCell>

                        <TableCell className="text-right">
                          <Badge
                            className={`text-[10px] ${
                              isNil
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                : isLow
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            }`}
                          >
                            {med.stockQuantity} in stock
                          </Badge>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            Min: {med.reorderLevel || 10}
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleOpenEdit(med)}
                              title="Edit Medicine"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                              onClick={() => handleDelete(med._id, med.name)}
                              title="Delete Medicine"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {displayedMedicines.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, displayedMedicines.length)} of {displayedMedicines.length} medicines
          </span>
          <div className="flex items-center gap-1 self-end sm:self-auto">
            <Button variant="outline" size="sm" className="h-8 px-2" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Previous page">‹</Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .slice(Math.max(0, Math.min(currentPage - 2, totalPages - 3)), Math.max(3, Math.min(currentPage + 1, totalPages)))
              .map((page) => <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" className={`h-8 min-w-8 px-2 ${currentPage === page ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`} onClick={() => setCurrentPage(page)}>{page}</Button>)}
            <Button variant="outline" size="sm" className="h-8 px-2" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} aria-label="Next page">›</Button>
          </div>
        </div>
        </Card>

        {selectedMedicine && (
          <Card className="overflow-hidden border-slate-200 shadow-sm xl:sticky xl:top-4 dark:border-slate-800">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">
                    {selectedMedicine.name}
                  </CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedMedicine.genericName || selectedMedicine.name}
                  </p>
                  <Badge className="mt-2 bg-emerald-50 text-emerald-700">
                    {Number(selectedMedicine.stockQuantity || 0) <= Number(selectedMedicine.reorderLevel || 10) ? "Low Stock" : "In Stock"}
                  </Badge>
                </div>
                <div
                  aria-label={`${selectedMedicine.name} tablet`}
                  className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <span className="block h-7 w-12 rotate-[-42deg] rounded-full border border-amber-200 bg-gradient-to-br from-white via-orange-50 to-amber-200 shadow-[0_3px_7px_rgba(120,80,30,0.22)]" />
                </div>
              </div>
            </CardHeader>
            <div className="grid grid-cols-4 border-b border-slate-200 px-2 dark:border-slate-800">
              {["Details", "Stock", "Pricing", "History"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`border-b-2 px-1 py-2.5 text-[11px] font-medium transition-colors ${detailTab === tab ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <CardContent className="min-h-[292px] p-4 text-xs">
              {detailTab === "Details" && (
                <div className="space-y-0">
                  {[
                    ["Category", selectedMedicine.category],
                    ["Formulation", selectedMedicine.dosageForm || "Tablet"],
                    ["Batch No.", selectedMedicine.batchNumber || "—"],
                    ["Rack Location", selectedMedicine.rackLocation || "—"],
                    [
                      "Expiry Date",
                      selectedMedicine.expiryDate
                        ? new Date(
                            selectedMedicine.expiryDate,
                          ).toLocaleDateString("en-IN")
                        : "—",
                    ],
                    [
                      "Unit Price",
                      `₹${Number(selectedMedicine.unitPrice || 0).toLocaleString("en-IN")}`,
                    ],
                    ["Current Stock", `${selectedMedicine.stockQuantity ?? 0}`],
                    ["Minimum Stock", `${selectedMedicine.reorderLevel ?? 10}`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 dark:border-slate-800"
                    >
                      <p className="text-slate-500">{label}</p>
                      <p className="text-right font-medium text-slate-800 dark:text-slate-100">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {detailTab === "Stock" && (
                <div className="space-y-3 pt-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Stock overview
                  </p>
                  <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                    <p className="text-slate-500">Available units</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                      {selectedMedicine.stockQuantity ?? 0}
                    </p>
                  </div>
                  <p className="text-slate-500">
                    Minimum stock level{" "}
                    <span className="float-right font-medium text-slate-800 dark:text-slate-100">
                      {selectedMedicine.reorderLevel ?? 10} units
                    </span>
                  </p>
                  <p className="text-slate-500">
                    Storage location{" "}
                    <span className="float-right font-medium text-slate-800 dark:text-slate-100">
                      {selectedMedicine.rackLocation || "—"}
                    </span>
                  </p>
                </div>
              )}
              {detailTab === "Pricing" && (
                <div className="space-y-3 pt-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Pricing information
                  </p>
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                    <p className="text-slate-500">Unit price</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                      ₹
                      {Number(selectedMedicine.unitPrice || 0).toLocaleString(
                        "en-IN",
                      )}
                    </p>
                  </div>
                  <p className="text-slate-500">
                    GST rate{" "}
                    <span className="float-right font-medium text-slate-800 dark:text-slate-100">
                      {selectedMedicine.gstRate ?? 0}%
                    </span>
                  </p>
                </div>
              )}
              {detailTab === "History" && (
                <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                  <Calendar className="mb-2 h-5 w-5 text-slate-400" />
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    No stock history available
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Stock movement records will appear here.
                  </p>
                </div>
              )}
            </CardContent>
            <div className="flex gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => handleOpenEdit(selectedMedicine)}
              >
                <Edit2 className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => handleOpenEdit(selectedMedicine)}
              >
                <Boxes className="mr-2 h-3.5 w-3.5" />
                Update Stock
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Add / Edit Dialog Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-emerald-600" />
              {editingMedicine
                ? "Edit Medicine Formulation"
                : "Add New Medicine"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="name" className="text-xs">
                  Brand / Trade Name *
                </Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g. Paracetamol 650mg (Dolo)"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="genericName" className="text-xs">
                  Generic Chemical Name
                </Label>
                <Input
                  id="genericName"
                  placeholder="e.g. Paracetamol"
                  value={formData.genericName}
                  onChange={(e) =>
                    setFormData({ ...formData, genericName: e.target.value })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dosageForm" className="text-xs">
                  Dosage Form *
                </Label>
                <select
                  id="dosageForm"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={formData.dosageForm}
                  onChange={(e) =>
                    setFormData({ ...formData, dosageForm: e.target.value })
                  }
                >
                  <option value="TABLET">Tablet</option>
                  <option value="CAPSULE">Capsule</option>
                  <option value="SYRUP">Syrup</option>
                  <option value="INJECTION">Injection</option>
                  <option value="IV_FLUID">IV Fluid</option>
                  <option value="INHALER">Inhaler</option>
                  <option value="OINTMENT">Ointment / Gel</option>
                  <option value="DROPS">Drops</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="category" className="text-xs">
                  Therapeutic Category *
                </Label>
                <select
                  id="category"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                >
                  {categories.map((c: any) => (
                    <option key={c._id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="manufacturer" className="text-xs">
                  Manufacturer
                </Label>
                <Input
                  id="manufacturer"
                  placeholder="e.g. Micro Labs, GSK, Cipla"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer: e.target.value })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="batchNumber" className="text-xs">
                  Batch / Lot Number *
                </Label>
                <Input
                  id="batchNumber"
                  required
                  placeholder="e.g. ML-PAR-2401"
                  value={formData.batchNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, batchNumber: e.target.value })
                  }
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="expiryDate" className="text-xs">
                  Expiry Date *
                </Label>
                <Input
                  id="expiryDate"
                  type="date"
                  required
                  value={formData.expiryDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expiryDate: e.target.value })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rackLocation" className="text-xs">
                  Storage Rack Location
                </Label>
                <Input
                  id="rackLocation"
                  placeholder="e.g. Rack A-01, Shelf 2"
                  value={formData.rackLocation}
                  onChange={(e) =>
                    setFormData({ ...formData, rackLocation: e.target.value })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="unitPrice" className="text-xs">
                  Unit Retail Price (₹) *
                </Label>
                <Input
                  id="unitPrice"
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={formData.unitPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      unitPrice: Number(e.target.value),
                    })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="stockQuantity" className="text-xs">
                  Initial Stock Quantity *
                </Label>
                <Input
                  id="stockQuantity"
                  type="number"
                  min="0"
                  required
                  value={formData.stockQuantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      stockQuantity: Number(e.target.value),
                    })
                  }
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="reorderLevel" className="text-xs">
                  Reorder Level Alert Threshold *
                </Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  min="0"
                  required
                  value={formData.reorderLevel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reorderLevel: Number(e.target.value),
                    })
                  }
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting
                  ? "Saving..."
                  : editingMedicine
                    ? "Update Medicine"
                    : "Save Medicine"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
