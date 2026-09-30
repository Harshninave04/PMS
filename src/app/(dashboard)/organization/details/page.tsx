"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Building2, MapPin, Mail, Phone, BedDouble, FileText, Edit, Save, RefreshCw, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HospitalForm {
  organizationName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  capacity: number;
}

interface SettingsForm {
  panNumber: string;
  gstin: string;
  website: string;
  emergencyHotline: string;
  letterheadHeader: string;
  letterheadFooter: string;
}

const EMPTY_HOSPITAL: HospitalForm = { organizationName: "", email: "", phone: "", address: "", city: "", state: "", pincode: "", capacity: 0 };
const EMPTY_SETTINGS: SettingsForm = { panNumber: "", gstin: "", website: "", emergencyHotline: "", letterheadHeader: "", letterheadFooter: "" };

function pick<T extends object>(source: Record<string, unknown> | null | undefined, empty: T): T {
  const out = { ...empty } as Record<string, unknown>;
  for (const key of Object.keys(empty)) {
    if (source?.[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out as T;
}

export default function HospitalProfilePage() {
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [hospital, setHospital] = useState<HospitalForm>(EMPTY_HOSPITAL);
  const [settings, setSettings] = useState<SettingsForm>(EMPTY_SETTINGS);
  const [hospitalDraft, setHospitalDraft] = useState<HospitalForm>(EMPTY_HOSPITAL);
  const [settingsDraft, setSettingsDraft] = useState<SettingsForm>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const [orgRes, settingsRes] = await Promise.all([fetch("/api/organization"), fetch("/api/organization/settings")]);
      const orgData = await orgRes.json();
      const settingsData = await settingsRes.json();

      if (orgData.success) {
        const main = orgData.data.find((o: { branchType?: string }) => o.branchType === "MAIN") || orgData.data[0];
        setHospitalId(main?._id ?? null);
        setHospital(pick(main, EMPTY_HOSPITAL));
      }
      if (settingsData.success) setSettings(pick(settingsData.data, EMPTY_SETTINGS));
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to load hospital profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const openEditor = () => {
    setHospitalDraft(hospital);
    setSettingsDraft(settings);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!hospitalId) return;
    try {
      setSaving(true);
      const [orgRes, settingsRes] = await Promise.all([
        fetch(`/api/organization/${hospitalId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hospitalDraft),
        }),
        fetch("/api/organization/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settingsDraft),
        }),
      ]);
      const [orgData, settingsData] = await Promise.all([orgRes.json(), settingsRes.json()]);
      if (orgData.success && settingsData.success) {
        toast({ title: "Saved", description: "Hospital profile updated." });
        setEditing(false);
        fetchProfile();
      } else {
        toast({ title: "Update Failed", description: orgData.message || settingsData.message, variant: "destructive" });
      }
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hospitalField = (key: keyof HospitalForm, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={hospitalDraft[key]}
        onChange={(e) =>
          setHospitalDraft({ ...hospitalDraft, [key]: type === "number" ? parseInt(e.target.value) || 0 : e.target.value })
        }
      />
    </div>
  );

  const settingsField = (key: keyof SettingsForm, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={settingsDraft[key]} onChange={(e) => setSettingsDraft({ ...settingsDraft, [key]: e.target.value })} />
    </div>
  );

  const detail = (icon: ReactNode, label: string, value: ReactNode) => (
    <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-start gap-2 text-sm font-medium text-foreground">
        {icon}
        <span>{value || "—"}</span>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl dark:bg-blue-950/50">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Hospital Profile</h1>
            <p className="text-muted-foreground text-sm">Name, contact details and billing information printed on bills and reports.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProfile} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openEditor} disabled={loading || !hospitalId}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" /> Loading...
        </div>
      ) : !hospitalId ? (
        <div className="py-16 text-center text-muted-foreground">No hospital found. Please run the database seed.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="shadow-sm border lg:col-span-2">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-xl font-bold text-foreground">{hospital.organizationName}</CardTitle>
              <CardDescription>Hospital details</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {detail(<Mail className="w-4 h-4 text-blue-600 shrink-0" />, "Email", hospital.email)}
              {detail(<Phone className="w-4 h-4 text-emerald-600 shrink-0" />, "Phone", hospital.phone)}
              <div className="md:col-span-2">
                {detail(
                  <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />,
                  "Address",
                  [hospital.address, hospital.city, hospital.state, hospital.pincode].filter(Boolean).join(", ")
                )}
              </div>
              {detail(<BedDouble className="w-4 h-4 text-purple-600 shrink-0" />, "Beds", `${hospital.capacity || 0} beds`)}
              {detail(<Phone className="w-4 h-4 text-red-600 shrink-0" />, "Emergency Helpline", settings.emergencyHotline)}
            </CardContent>
          </Card>

          <Card className="shadow-sm border">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Tax & Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div>
                <span className="text-muted-foreground">PAN</span>
                <p className="font-mono font-medium text-foreground mt-0.5">{settings.panNumber || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">GSTIN</span>
                <p className="font-mono font-medium text-foreground mt-0.5">{settings.gstin || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Website</span>
                <p className="font-medium text-foreground mt-0.5 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {settings.website || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Letterhead</span>
                <p className="font-medium text-foreground mt-0.5">{settings.letterheadHeader || "—"}</p>
                <p className="text-muted-foreground mt-0.5">{settings.letterheadFooter}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Hospital Profile</DialogTitle>
            <DialogDescription>These details appear on bills, receipts and reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3 text-sm">
            {hospitalField("organizationName", "Hospital Name")}
            <div className="grid grid-cols-2 gap-3">
              {hospitalField("email", "Email", "email")}
              {hospitalField("phone", "Phone")}
            </div>
            {hospitalField("address", "Address")}
            <div className="grid grid-cols-3 gap-3">
              {hospitalField("city", "City")}
              {hospitalField("state", "State")}
              {hospitalField("pincode", "Pincode")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {hospitalField("capacity", "Number of Beds", "number")}
              {settingsField("emergencyHotline", "Emergency Helpline")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {settingsField("panNumber", "PAN")}
              {settingsField("gstin", "GSTIN")}
            </div>
            {settingsField("website", "Website")}
            {settingsField("letterheadHeader", "Letterhead Title")}
            {settingsField("letterheadFooter", "Letterhead Footer")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
