"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Can } from "@/components/permissions/can";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Palette,
  Pencil,
  RefreshCw,
  Save,
  Upload,
  Globe,
  User,
  Tag,
  Info,
  Copyright,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import {
  DEFAULT_SOFTWARE_BRANDING,
  SOFTWARE_BRANDING_LIMITS,
  splitBrandName,
  type SoftwareBranding,
} from "@/lib/software-branding";

const EMPTY: SoftwareBranding = { ...DEFAULT_SOFTWARE_BRANDING };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function SoftwareMetadataPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [branding, setBranding] = useState<SoftwareBranding>(EMPTY);
  const [draft, setDraft] = useState<SoftwareBranding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoFilePreview, setLogoFilePreview] = useState("");
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoPreviewRef = useRef("");

  useEffect(() => {
    const preview = logoPreviewRef;
    return () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    };
  }, []);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/software");
      const json = await res.json();
      if (json.success) {
        setBranding({ ...EMPTY, ...json.data });
      } else {
        toast({ title: "Error", description: json.message, variant: "destructive" });
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load software metadata",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load is async; all setState happens after await
    fetchBranding();
  }, [fetchBranding]);

  const brandName = splitBrandName(branding.softwareName);
  const logoPreview = logoFile ? logoFilePreview : removingLogo ? "" : draft.logoUrl;

  const setPickedLogo = (file: File | null) => {
    if (logoPreviewRef.current) {
      URL.revokeObjectURL(logoPreviewRef.current);
      logoPreviewRef.current = "";
    }
    if (file) {
      logoPreviewRef.current = URL.createObjectURL(file);
      setLogoFilePreview(logoPreviewRef.current);
    } else {
      setLogoFilePreview("");
    }
    setLogoFile(file);
  };

  const openEditor = () => {
    setDraft(branding);
    setPickedLogo(null);
    setRemovingLogo(false);
    setEditing(true);
  };

  const pickLogo = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Choose a PNG, JPEG, WebP, SVG or ICO image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: "File too large", description: "The logo must be 2 MB or smaller.", variant: "destructive" });
      return;
    }
    setPickedLogo(file);
    setRemovingLogo(false);
  };

  const handleSave = async () => {
    const name = draft.softwareName.trim();
    if (!name) {
      toast({ title: "Software name required", description: "Enter the product name shown across the app.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let logoUrl = branding.logoUrl;
      let logoKey = branding.logoKey;
      const logoChanged = logoFile !== null || removingLogo;

      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        const uploadRes = await fetch("/api/admin/software/logo", { method: "POST", body: formData });
        const uploadJson = await uploadRes.json();
        if (!uploadJson.success) {
          toast({ title: "Logo upload failed", description: uploadJson.message, variant: "destructive" });
          setSaving(false);
          return;
        }
        logoUrl = uploadJson.data.fileUrl;
        logoKey = uploadJson.data.key;
      } else if (removingLogo) {
        logoUrl = "";
        logoKey = "";
      }

      const body: Record<string, unknown> = {
        softwareName: name,
        tagline: draft.tagline.trim(),
        description: draft.description.trim(),
        version: draft.version.trim(),
        authorName: draft.authorName.trim(),
        authorWebsite: draft.authorWebsite.trim(),
        copyright: draft.copyright.trim(),
      };
      if (logoChanged) {
        body.logoUrl = logoUrl;
        body.logoKey = logoKey;
      }

      const res = await fetch("/api/admin/software", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast({ title: "Update failed", description: json.message, variant: "destructive" });
        return;
      }

      toast({ title: "Saved", description: "Software metadata updated across the application." });
      setEditing(false);
      setPickedLogo(null);
      setRemovingLogo(false);
      await fetchBranding();
      router.refresh();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update software metadata",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const textField = (key: keyof SoftwareBranding, label: string, options?: { textarea?: boolean; required?: boolean; placeholder?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`branding-${key}`}>
        {label}
        {options?.required && <span className="text-red-500"> *</span>}
      </Label>
      {options?.textarea ? (
        <Textarea
          id={`branding-${key}`}
          value={draft[key]}
          placeholder={options.placeholder}
          maxLength={SOFTWARE_BRANDING_LIMITS[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          rows={2}
        />
      ) : (
        <Input
          id={`branding-${key}`}
          value={draft[key]}
          placeholder={options?.placeholder}
          required={options?.required}
          maxLength={SOFTWARE_BRANDING_LIMITS[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
      <p className="text-[10px] text-muted-foreground text-right">
        {(draft[key] || "").length}/{SOFTWARE_BRANDING_LIMITS[key]}
      </p>
    </div>
  );

  const detail = (icon: ReactNode, label: string, value: ReactNode) => (
    <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-start gap-2 text-sm font-medium text-foreground">
        {icon}
        <span className="break-words">{value || "—"}</span>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl dark:bg-purple-950/50">
            <Palette className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Software Metadata</h1>
            <p className="text-muted-foreground text-sm">
              Product name, logo, version and authorship shown on the login screen, sidebar and browser tab.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchBranding();
            }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Can permission="admin.software:update">
            <Button size="sm" onClick={openEditor} disabled={loading}>
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
          </Can>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" /> Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="shadow-sm border lg:col-span-2">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={branding.softwareName}
                    className="h-10 w-10 rounded-xl object-contain border bg-white p-0.5"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50">
                    <Palette className="w-5 h-5" />
                  </span>
                )}
                <span>
                  {brandName.head}
                  {brandName.accent && (
                    <>
                      {" "}
                      <span className="text-purple-600 dark:text-purple-400">{brandName.accent}</span>
                    </>
                  )}
                </span>
              </CardTitle>
              <CardDescription>{branding.tagline || "No tagline set"}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {detail(<Info className="w-4 h-4 text-blue-600 shrink-0" />, "Description", branding.description)}
              {detail(<Tag className="w-4 h-4 text-emerald-600 shrink-0" />, "Version", `v${branding.version || "—"}`)}
              {detail(
                <User className="w-4 h-4 text-amber-600 shrink-0" />,
                "Author",
                branding.authorName
              )}
              {branding.authorWebsite &&
                detail(
                  <Globe className="w-4 h-4 text-sky-600 shrink-0" />,
                  "Author Website",
                  <a
                    href={branding.authorWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {branding.authorWebsite}
                  </a>
                )}
              <div className="md:col-span-2">
                {detail(<Copyright className="w-4 h-4 text-slate-500 shrink-0" />, "Copyright", branding.copyright)}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border h-fit">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Brand Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="flex items-center justify-center rounded-xl border bg-muted/20 p-6">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={`${branding.softwareName} logo`}
                    className="max-h-24 max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="w-8 h-8" />
                    <span>Default icon in use</span>
                  </div>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Logo source</span>
                <p className="font-mono font-medium text-foreground mt-0.5 break-all">
                  {branding.logoUrl || "/icon.svg (built-in)"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Shown in</span>
                <p className="font-medium text-foreground mt-0.5">
                  Sidebar, login screen, browser tab
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={editing} onOpenChange={(open) => !saving && setEditing(open)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Software Metadata</DialogTitle>
            <DialogDescription>
              These details brand the application itself — the product name, logo and credits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {textField("softwareName", "Software Name", { required: true, placeholder: "Medistra HMS" })}
              {textField("tagline", "Tagline", { placeholder: "Healthcare Admin" })}
            </div>

            {textField("description", "Description", {
              textarea: true,
              placeholder: "Shown as the browser meta description",
            })}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {textField("version", "Version", { placeholder: "1.0.0" })}
              {textField("authorName", "Author Name", { placeholder: "Person or company credited" })}
            </div>

            {textField("authorWebsite", "Author Website", { placeholder: "https://example.com" })}
            {textField("copyright", "Copyright", { placeholder: "© 2026 Acme Inc. All rights reserved." })}

            <div className="space-y-2 rounded-xl border p-4">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border bg-muted/20 p-2">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Palette className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 font-medium hover:bg-muted transition-colors">
                    <Upload className="w-4 h-4" />
                    {logoFile ? logoFile.name : "Choose image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                      className="hidden"
                      onChange={(e) => pickLogo(e.target.files?.[0])}
                    />
                  </label>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>PNG, JPEG, WebP, SVG or ICO · max 2 MB</span>
                    {(branding.logoUrl || logoFile || removingLogo) && (
                      <button
                        type="button"
                        className="font-medium text-red-600 hover:text-red-500"
                        onClick={() => {
                          setPickedLogo(null);
                          setRemovingLogo(true);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
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
