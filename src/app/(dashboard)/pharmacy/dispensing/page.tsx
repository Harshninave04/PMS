"use client";

import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Search,
  User,
  FileText,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  CreditCard,
  Banknote,
  QrCode,
  Building2,
  AlertTriangle,
  RefreshCw,
  Clock
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
  TableRow
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";

interface CartItem {
  medicineId: string;
  medicineName: string;
  genericName?: string;
  dosageForm?: string;
  batchNumber?: string;
  expiryDate?: string;
  mrp?: number;
  hsnCode?: string;
  availableStock: number;
  unitPrice: number;
  quantity: number;
  gstPercent: number;
  discountPercent: number;
  totalAmount: number;
}

const formatINR = (amount: number | string = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const titleCase = (value?: string) =>
  (value || "—").trim().toLocaleLowerCase().replace(/(^|\s)(\S)/g, (_match, space: string, letter: string) => `${space}${letter.toLocaleUpperCase()}`);

const formatBillDate = (value: string | Date | undefined, timeZone: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date).replace(/ /g, "-");
  const timePart = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date).toLocaleLowerCase();
  return `${datePart}, ${timePart}`;
};

const formatExpiry = (value?: string | Date) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
};

const numberToWords = (value: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowThousand = (number: number): string => {
    const words: string[] = [];
    if (number >= 100) words.push(`${ones[Math.floor(number / 100)]} Hundred`);
    number %= 100;
    if (number >= 20) words.push(tens[Math.floor(number / 10)], ones[number % 10]);
    else if (number > 0) words.push(ones[number]);
    return words.filter(Boolean).join(" ");
  };

  let amount = Math.max(0, Math.floor(Math.abs(value)));
  if (amount === 0) return "Zero Rupees Only";
  const groups: [number, string][] = [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"], [1, ""]];
  const words: string[] = [];
  for (const [size, label] of groups) {
    const group = Math.floor(amount / size);
    if (group) {
      words.push(`${belowThousand(group)}${label ? ` ${label}` : ""}`);
      amount %= size;
    }
  }
  return `Rupees ${words.join(" ")} Only`;
};

function PharmacyDispenseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hospital = useHospitalProfile();
  const preselectedPrescriptionId = searchParams.get("prescriptionId");

  const [medicines, setMedicines] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);

  // Patient Info
  const [patientName, setPatientName] = useState("Walk-in Patient");
  const [patientPhone, setPatientPhone] = useState("");
  const [uhid, setUhid] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);

  // Cart & POS
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedMedId, setSelectedMedId] = useState("");
  const [medSearch, setMedSearch] = useState("");
  const [discountOverall, setDiscountOverall] = useState(0); // in percent
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT_HOSPITAL">("CASH");
  const [pharmacistNotes, setPharmacistNotes] = useState("");

  // Completed Receipt Modal
  const [completedBill, setCompletedBill] = useState<any | null>(null);
  const [completedPrescriptionDispense, setCompletedPrescriptionDispense] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [medRes, presRes] = await Promise.all([
        fetch("/api/pharmacy/medicines"),
        fetch("/api/pharmacy/prescriptions")
      ]);

      const medData = await medRes.json();
      const allMeds = medData.data || [];
      setMedicines(allMeds);

      const presData = await presRes.json();
      const allPres = presData.data || [];
      setPrescriptions(allPres);

      // If prescription ID was provided in URL, auto-select it
      if (preselectedPrescriptionId) {
        const target = allPres.find((p: any) => p._id === preselectedPrescriptionId);
        if (target) {
          handleSelectPrescription(target, allMeds);
        }
      }
    } catch (err) {
      console.error(err);
      toast("Failed to load dispensing data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [preselectedPrescriptionId]);

  const handleSelectPrescription = (pres: any, currentMeds: any[] = medicines) => {
    setSelectedPrescription(pres);
    setPatientName(pres.patientId?.name || "Patient");
    setPatientPhone(pres.patientId?.contact || pres.patientId?.phone || "");
    setUhid(pres.patientId?.uhid || "");
    setPatientId(pres.patientId?._id || null);

    // Match prescribed medications with available medicines in stock
    const newItems: CartItem[] = [];
    if (pres.medications && Array.isArray(pres.medications)) {
      for (const rxItem of pres.medications) {
        const found = currentMeds.find((m) =>
          m.name.toLowerCase().includes(rxItem.name.toLowerCase()) ||
          rxItem.name.toLowerCase().includes(m.name.toLowerCase())
        );

        if (found) {
          const qty = 10; // default dosage count or 1 strip
          const unitPrice = found.unitPrice || 0;
          const gst = found.gstRate || 12;
          const lineTotal = Math.round(qty * unitPrice * (1 + gst / 100));

          newItems.push({
            medicineId: found._id,
            medicineName: found.name,
            genericName: found.genericName,
            dosageForm: found.dosageForm || "TABLET",
            batchNumber: found.batchNumber || "BAT-DEF",
            expiryDate: found.expiryDate,
            mrp: found.mrp,
            hsnCode: found.hsnCode || "",
            availableStock: found.stockQuantity || 0,
            unitPrice: unitPrice,
            quantity: Math.min(qty, found.stockQuantity || 1),
            gstPercent: gst,
            discountPercent: 0,
            totalAmount: lineTotal
          });
        }
      }
    }

    if (newItems.length > 0) {
      setCart(newItems);
      toast(`Loaded prescription & matched ${newItems.length} drugs from inventory`, "success");
    } else {
      toast("Loaded prescription details. Add required drugs to cart.", "info");
    }
  };

  const handleAddToCart = (med: any) => {
    if (med.stockQuantity <= 0) {
      toast(`${med.name} is currently OUT OF STOCK!`, "error");
      return;
    }

    const existingIndex = cart.findIndex((i) => i.medicineId === med._id);
    if (existingIndex > -1) {
      const updated = [...cart];
      const cur = updated[existingIndex];
      if (cur.quantity >= med.stockQuantity) {
        toast(`Maximum stock reached (${med.stockQuantity} available)`, "error");
        return;
      }
      cur.quantity += 1;
      const gst = cur.gstPercent || 12;
      cur.totalAmount = Math.round(cur.quantity * cur.unitPrice * (1 + gst / 100));
      setCart(updated);
    } else {
      const gst = med.gstRate || 12;
      const initialQty = 1;
      const total = Math.round(initialQty * (med.unitPrice || 0) * (1 + gst / 100));

      setCart([
        ...cart,
        {
          medicineId: med._id,
          medicineName: med.name,
          genericName: med.genericName,
          dosageForm: med.dosageForm || "TABLET",
          batchNumber: med.batchNumber || "BAT-DEF",
          expiryDate: med.expiryDate,
          mrp: med.mrp,
          hsnCode: med.hsnCode || "",
          availableStock: med.stockQuantity || 0,
          unitPrice: med.unitPrice || 0,
          quantity: initialQty,
          gstPercent: gst,
          discountPercent: 0,
          totalAmount: total
        }
      ]);
    }
  };

  const handleUpdateQuantity = (idx: number, qty: number) => {
    const updated = [...cart];
    const item = updated[idx];
    const safeQty = Math.max(1, Math.min(qty, item.availableStock));
    item.quantity = safeQty;
    const gst = item.gstPercent || 12;
    item.totalAmount = Math.round(safeQty * item.unitPrice * (1 + gst / 100));
    setCart(updated);
  };

  const handleRemoveFromCart = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Totals calculation
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }, [cart]);

  const taxAmount = useMemo(() => {
    return cart.reduce(
      (acc, item) =>
        acc + (item.quantity * item.unitPrice * (item.gstPercent || 12)) / 100,
      0
    );
  }, [cart]);

  const discountAmount = useMemo(() => {
    return (subtotal * discountOverall) / 100;
  }, [subtotal, discountOverall]);

  const netPayable = useMemo(() => {
    return Math.round(subtotal + taxAmount - discountAmount);
  }, [subtotal, taxAmount, discountAmount]);

  // Filtered medicine search results
  const filteredMeds = useMemo(() => {
    if (!medSearch) return medicines.slice(0, 8);
    return medicines
      .filter(
        (m) =>
          m.name?.toLowerCase().includes(medSearch.toLowerCase()) ||
          m.genericName?.toLowerCase().includes(medSearch.toLowerCase()) ||
          m.category?.toLowerCase().includes(medSearch.toLowerCase())
      )
      .slice(0, 10);
  }, [medicines, medSearch]);

  const handleCompleteDispense = async () => {
    if (cart.length === 0) {
      toast("Cart is empty. Add medicines to dispense.", "error");
      return;
    }
    if (!patientName.trim()) {
      toast("Patient name is required", "error");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        prescriptionId: selectedPrescription?._id || undefined,
        patientId: patientId || undefined,
        patientName,
        patientPhone,
        uhid,
        items: cart.map((i) => ({
          medicineId: i.medicineId,
          medicineName: i.medicineName,
          batchNumber: i.batchNumber,
          dosageForm: i.dosageForm,
          expiryDate: i.expiryDate,
          mrp: i.mrp,
          hsnCode: i.hsnCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          gstPercent: i.gstPercent,
          discountPercent: i.discountPercent,
          totalAmount: i.totalAmount
        })),
        subtotal: Math.round(subtotal),
        discountAmount: Math.round(discountAmount),
        taxAmount: Math.round(taxAmount),
        totalAmount: netPayable,
        paymentMode,
        paymentStatus: "PAID",
        notes: pharmacistNotes
      };

      const res = await fetch("/api/pharmacy/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        const isPrescriptionDispense = Boolean(selectedPrescription?._id);
        toast("Medications dispensed and inventory updated!", "success");
        setCompletedPrescriptionDispense(isPrescriptionDispense);
        setCompletedBill(data.data);
        // Reset POS
        setCart([]);
        setSelectedPrescription(null);
        setPatientName("Walk-in Patient");
        setPatientPhone("");
        setUhid("");
        if (!isPrescriptionDispense) loadData();
      } else {
        toast(data.message || "Dispense transaction failed", "error");
      }
    } catch (err) {
      toast("Error processing dispense", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintReceipt = useCallback(() => {
    if (completedPrescriptionDispense) {
      window.addEventListener("afterprint", () => router.push("/pharmacy/prescriptions"), { once: true });
    }
    window.print();
  }, [completedPrescriptionDispense, router]);

  useEffect(() => {
    if (!completedBill) return;
    const printTimer = window.setTimeout(handlePrintReceipt, 350);
    return () => window.clearTimeout(printTimer);
  }, [completedBill, handlePrintReceipt]);

  const addressParts = (hospital.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const hospitalAddress = [...new Map(addressParts.map((part) => [part.toLocaleLowerCase(), part])).values()].join(", ");
  const billSubtotal = Number(completedBill?.subtotal) || 0;
  const billDiscount = Number(completedBill?.discountAmount) || 0;
  const billTax = Number(completedBill?.taxAmount) || 0;
  const billTotal = Number(completedBill?.totalAmount) || 0;
  const cgstAmount = billTax / 2;
  const sgstAmount = billTax / 2;
  const roundOff = billTotal - (billSubtotal - billDiscount + billTax);
  const ageSex = [completedBill?.patientAge != null ? `${completedBill.patientAge} years` : "", completedBill?.patientGender || ""]
    .filter(Boolean)
    .join(" / ") || "—";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Point-of-Sale &amp; Dispensing Counter
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time prescription dispensing, OTC drug sales, automatic inventory deduction, and tax invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {selectedPrescription && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedPrescription(null);
                setPatientName("Walk-in Patient");
                setUhid("");
                setCart([]);
              }}
              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              Clear Prescription
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient & Medicine Search (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Prescription & Patient Info Card */}
          <Card className="border shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-4 pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600" />
                Customer &amp; Prescription Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              {/* Prescription Picker */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">
                  Select Pending Prescription (Optional)
                </Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedPrescription?._id || ""}
                  onChange={(e) => {
                    const pres = prescriptions.find((p) => p._id === e.target.value);
                    if (pres) handleSelectPrescription(pres);
                    else {
                      setSelectedPrescription(null);
                      setPatientName("Walk-in Patient");
                    }
                  }}
                >
                  <option value="">-- Direct OTC Walk-in Sale --</option>
                  {prescriptions
                    .filter((p) => p.dispenseStatus !== "DISPENSED")
                    .map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.patientId?.name || "Patient"} (UHID: {p.patientId?.uhid || "N/A"}) - Dr. {p.doctorId?.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Patient Name *</Label>
                  <Input
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Patient full name"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone Number</Label>
                  <Input
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="+91 98765..."
                    className="text-xs"
                  />
                </div>
              </div>

              {selectedPrescription && (
                <div className="p-2.5 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-300">
                  <div className="font-bold flex items-center justify-between">
                    <span>Active Rx: Dr. {selectedPrescription.doctorId?.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(selectedPrescription.visitDate).toLocaleDateString()}
                    </Badge>
                  </div>
                  {selectedPrescription.diagnosis && (
                    <div className="text-[11px] mt-0.5">
                      Dx: {selectedPrescription.diagnosis}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Drug Lookup & Add */}
          <Card className="border shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-4 pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Search className="h-4 w-4 text-emerald-600" />
                Drug Search &amp; Fast Add
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search medicine brand, generic or category..."
                  value={medSearch}
                  onChange={(e) => setMedSearch(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>

              <div className="divide-y max-h-[360px] overflow-y-auto border rounded-lg">
                {filteredMeds.map((med) => {
                  const out = med.stockQuantity <= 0;
                  return (
                    <div
                      key={med._id}
                      className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{med.name}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {med.dosageForm || "TABLET"}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {med.genericName || med.category} • Batch: {med.batchNumber || "N/A"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="text-right">
                          <div className="font-bold text-slate-900 dark:text-white">
                            ₹{med.unitPrice || 0}
                          </div>
                          <div className={`text-[9px] ${out ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                            {out ? "Out of stock" : `${med.stockQuantity} left`}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          disabled={out}
                          onClick={() => handleAddToCart(med)}
                          className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Cart, Bill Summary & Payment (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-emerald-600" />
                  Itemized Dispensing Cart ({cart.length} Medicines)
                </CardTitle>
              </div>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCart([])}
                  className="h-7 text-xs text-rose-600"
                >
                  Clear Cart
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {cart.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  <ShoppingCart className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  Your dispensing counter is empty. Pick a prescription or add medicines from the left search panel.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-center w-[90px]">Qty</TableHead>
                        <TableHead className="text-right">Total (₹)</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {item.medicineName}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              GST {item.gstPercent}%
                            </div>
                          </TableCell>

                          <TableCell className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {item.batchNumber}
                          </TableCell>

                          <TableCell className="text-right font-medium">
                            ₹{item.unitPrice}
                          </TableCell>

                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="1"
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(idx, Number(e.target.value))}
                              className="h-7 w-16 text-center text-xs mx-auto"
                            />
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              max {item.availableStock}
                            </div>
                          </TableCell>

                          <TableCell className="text-right font-bold text-slate-900 dark:text-white">
                            ₹{item.totalAmount}
                          </TableCell>

                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-500"
                              onClick={() => handleRemoveFromCart(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment & Checkout Summary */}
          {cart.length > 0 && (
            <Card className="border shadow-sm bg-white dark:bg-slate-900">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-bold">
                  Payment Mode &amp; Bill Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Payment Mode Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Settlement Method *
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button
                      type="button"
                      variant={paymentMode === "CASH" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMode("CASH")}
                      className={`text-xs flex items-center justify-center gap-1.5 h-9 ${
                        paymentMode === "CASH" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      }`}
                    >
                      <Banknote className="h-4 w-4" /> Cash
                    </Button>

                    <Button
                      type="button"
                      variant={paymentMode === "UPI" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMode("UPI")}
                      className={`text-xs flex items-center justify-center gap-1.5 h-9 ${
                        paymentMode === "UPI" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      }`}
                    >
                      <QrCode className="h-4 w-4" /> UPI / QR
                    </Button>

                    <Button
                      type="button"
                      variant={paymentMode === "CARD" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMode("CARD")}
                      className={`text-xs flex items-center justify-center gap-1.5 h-9 ${
                        paymentMode === "CARD" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      }`}
                    >
                      <CreditCard className="h-4 w-4" /> Card
                    </Button>

                    <Button
                      type="button"
                      variant={paymentMode === "CREDIT_HOSPITAL" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMode("CREDIT_HOSPITAL")}
                      className={`text-xs flex items-center justify-center gap-1.5 h-9 ${
                        paymentMode === "CREDIT_HOSPITAL" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      }`}
                    >
                      <Building2 className="h-4 w-4" /> IP Credit
                    </Button>
                  </div>
                </div>

                {/* Discount and Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Overall Concession / Discount (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discountOverall}
                      onChange={(e) => setDiscountOverall(Number(e.target.value))}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pharmacist Notes / Batch remarks</Label>
                    <Input
                      placeholder="Special instructions or batch remarks"
                      value={pharmacistNotes}
                      onChange={(e) => setPharmacistNotes(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Financial Summary Table */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Gross Subtotal:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{subtotal.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Taxes &amp; GST (Inclusive):</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      +₹{Math.round(taxAmount).toLocaleString("en-IN")}
                    </span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Discount ({discountOverall}%):</span>
                      <span>-₹{Math.round(discountAmount).toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                    <span>Net Total Payable:</span>
                    <span className="text-emerald-600 text-lg">
                      ₹{netPayable.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Submit Dispense Button */}
                <Button
                  size="lg"
                  disabled={submitting}
                  onClick={handleCompleteDispense}
                  className="w-full text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 h-11"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {submitting ? "Processing..." : `Complete Dispense & Print Receipt (₹${netPayable.toLocaleString("en-IN")})`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Completed Dispense Receipt Modal */}
      <Dialog open={!!completedBill} onOpenChange={(open) => !open && setCompletedBill(null)}>
        <DialogContent id="print-area" className="pharmacy-bill-print-shell sm:max-w-[550px]">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Dispense Successful &amp; Invoiced
            </DialogTitle>
          </DialogHeader>

          {completedBill && (
            <div className="pharmacy-receipt-print-area space-y-3 text-[10px]">
              <header className="border-b border-slate-300 pb-2 text-center">
                {hospital.logo && <img src={hospital.logo} alt="" className="mx-auto mb-1 h-10 w-10 object-contain" />}
                <h1 className="text-base font-bold">{hospital.name || "Hospital"}</h1>
                {hospitalAddress && <p>{hospitalAddress}</p>}
                <p className="flex flex-wrap justify-center gap-x-3">
                  {hospital.phone && <span>Phone: {hospital.phone}</span>}
                  {hospital.gstin && <span>GSTIN: {hospital.gstin}</span>}
                  <span>Drug Licence No.: {hospital.drugLicenseNo || "—"}</span>
                </p>
              </header>

              <div className="text-center text-[11px] font-bold tracking-wide">PHARMACY TAX INVOICE</div>

              <section className="grid grid-cols-2 gap-x-4 gap-y-1 border-y border-slate-300 py-2">
                <p><strong>Bill No:</strong> {completedBill.billNumber || "—"}</p>
                <p><strong>Date:</strong> {formatBillDate(completedBill.createdAt, hospital.timeZone)}</p>
                <p><strong>Patient:</strong> {titleCase(completedBill.patientName)}</p>
                <p><strong>Age / Sex:</strong> {ageSex}</p>
                <p><strong>UHID:</strong> {completedBill.uhid || "—"}</p>
                <p><strong>Doctor:</strong> {completedBill.doctorName ? `Dr. ${titleCase(completedBill.doctorName)}` : "—"}</p>
                <p className="break-all"><strong>Prescription ID:</strong> {completedBill.prescriptionId || "—"}</p>
                <p><strong>Payment Mode:</strong> {(completedBill.paymentMode || "—").replace(/_/g, " ")}</p>
              </section>

              <div className="overflow-visible">
                <Table className="pharmacy-bill-table text-[9px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch + Expiry</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Discount %</TableHead>
                      <TableHead className="text-right">GST %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedBill.items?.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {item.medicineName}
                          <span className="block text-[8px] font-normal">{item.dosageForm || "—"} · HSN {item.hsnCode || "—"}</span>
                        </TableCell>
                        <TableCell>{item.batchNumber || "—"}<span className="block text-[8px]">Exp: {formatExpiry(item.expiryDate)}</span></TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{item.mrp != null ? formatINR(item.mrp) : "—"}</TableCell>
                        <TableCell className="text-right">{formatINR(item.unitPrice)}</TableCell>
                        <TableCell className="text-right">{Number(item.discountPercent) || 0}%</TableCell>
                        <TableCell className="text-right">{Number(item.gstPercent) || 0}%</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(item.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="ml-auto max-w-[18rem] space-y-0.5 text-right text-[10px]">
                <div className="flex justify-between gap-4"><span>Subtotal</span><span>{formatINR(billSubtotal)}</span></div>
                <div className="flex justify-between gap-4"><span>Discount</span><span>−{formatINR(billDiscount)}</span></div>
                <div className="flex justify-between gap-4"><span>CGST 6%</span><span>{formatINR(cgstAmount)}</span></div>
                <div className="flex justify-between gap-4"><span>SGST 6%</span><span>{formatINR(sgstAmount)}</span></div>
                <div className="flex justify-between gap-4"><span>Round off</span><span>{roundOff >= 0 ? "+" : "−"}{formatINR(Math.abs(roundOff))}</span></div>
                <div className="flex justify-between gap-4 border-t border-slate-400 pt-1 text-xs font-bold"><span>Total paid</span><span>{formatINR(billTotal)}</span></div>
              </div>

              <p className="border-t border-slate-300 pt-1"><strong>Amount in words:</strong> {numberToWords(billTotal)}</p>
              {completedBill.notes && <p><strong>Notes:</strong> {completedBill.notes}</p>}

              <footer className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-t border-slate-300 pt-2 text-[8px]">
                <div className="space-y-1">
                  <p>Return policy: Please retain this bill and contact the pharmacy for return eligibility.</p>
                  <p className="font-semibold">Keep out of reach of children.</p>
                </div>
                <div className="flex h-14 w-14 flex-col items-center justify-center border border-dashed border-slate-500 text-[7px]">
                  <QrCode className="h-7 w-7" />
                  <span>QR PLACEHOLDER</span>
                </div>
                <div className="text-center">
                  <div className="mb-1 h-7 border-b border-slate-500" />
                  <p className="font-semibold">{completedBill.pharmacistName || "Pharmacist"}</p>
                  <p>Pharmacist Signature</p>
                  <p>Reg. No.: {completedBill.pharmacistRegistrationNo || hospital.pharmacistRegistrationNo || "—"}</p>
                </div>
              </footer>

              <div className="no-print flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompletedBill(null)}
                  className="text-xs"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={handlePrintReceipt}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Tax Invoice
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PharmacyDispensingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[400px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      }
    >
      <PharmacyDispenseContent />
    </Suspense>
  );
}
