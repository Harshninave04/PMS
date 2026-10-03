"use client";

import React, { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Info,
    Loader2,
    Lock,
    RotateCcw,
    Save,
    Search,
    TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { ADMIN_ROLE, ROLE_LABELS } from "@/lib/rbac/roles";
import { normalizePermissions } from "@/lib/rbac/default-permissions";
import { permissionKey } from "@/lib/rbac/permissions.config";
import { MENUS, filterMenusByPermissions } from "@/lib/menu-data";

interface RoleData {
    _id: string;
    role: string;
    description?: string;
    isSystem?: boolean;
    isSuperAdmin?: boolean;
    canEdit?: boolean;
    permissions?: string[];
}

interface CataloguePermission {
    action: string;
    label: string;
    key: string;
    special: boolean;
}

interface CatalogueSubItem {
    key: string;
    label: string;
    route: string;
    permissions: CataloguePermission[];
}

interface CatalogueModule {
    key: string;
    label: string;
    route: string;
    subItems: CatalogueSubItem[];
}

/** The four ordinary actions, in the order the columns are rendered. */
const CRUD_COLUMNS = [
    { action: "view", label: "Show in menu" },
    { action: "create", label: "Create" },
    { action: "update", label: "Update" },
    { action: "delete", label: "Delete" },
] as const;

/** A tri-state module checkbox: on, off, or "some of it". */
function ModuleToggle({
    checked,
    indeterminate,
    disabled,
    onChange,
    label,
}: {
    checked: boolean;
    indeterminate: boolean;
    disabled?: boolean;
    onChange: () => void;
    label: string;
}) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <label
            className={`flex items-center gap-2.5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            title={`${label} — ${disabled ? "locked" : "toggle every section"}`}
        >
            <span className="relative flex h-4 w-4 items-center justify-center">
                <input
                    ref={ref}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={onChange}
                    aria-label={label}
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 bg-white transition-colors checked:border-emerald-600 checked:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                />
                <span className="pointer-events-none absolute flex items-center justify-center text-white">
                    {indeterminate ? (
                        <span className="h-0.5 w-2 rounded bg-white" />
                    ) : (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
                            <path d="M2 6.2 4.8 9 10 3.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </span>
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        </label>
    );
}

/** Renders `module.submodule:action` on hover only — never as visible text. */
function KeyHint({ permissionKey: value }: { permissionKey: string }) {
    return (
        <span
            title={value}
            className="cursor-help text-slate-300 transition-colors hover:text-emerald-600 dark:text-slate-600 dark:hover:text-emerald-500"
        >
            <Info className="h-3.5 w-3.5" />
        </span>
    );
}

export default function RolePermissionsPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { toast } = useToast();
    const { id } = use(params);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<RoleData | null>(null);
    const [catalogue, setCatalogue] = useState<CatalogueModule[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [initial, setInitial] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        try {
            const [roleRes, catalogueRes] = await Promise.all([
                fetch(`/api/role/${id}`),
                fetch("/api/permissions"),
            ]);

            const roleJson = await roleRes.json();
            const catalogueJson = await catalogueRes.json();

            if (!roleJson.success) {
                toast({
                    title: "Error",
                    description: roleJson.message || "Failed to load role",
                    variant: "destructive",
                });
                router.replace("/admin/roles");
                return;
            }

            const modules: CatalogueModule[] = catalogueJson.data ?? [];
            setRole(roleJson.data);
            setCatalogue(modules);
            setExpanded(new Set(modules.map((module) => module.key)));

            const granted = new Set<string>(roleJson.data.permissions ?? []);
            setSelected(granted);
            setInitial(granted);
        } catch {
            toast({ title: "Error", description: "Error loading role", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [id, router, toast]);

    useEffect(() => {
        load();
    }, [load]);

    const roleName = role?.role ?? "";
    const isSuperAdmin = roleName === ADMIN_ROLE;
    // Super Admin and any system role are fixed; the API refuses to edit them too.
    const locked = isSuperAdmin || Boolean(role?.isSystem) || role?.canEdit === false;

    /* ---------------------------------------------------------------- lookup */

    const byModule = new Map(
        catalogue.map((module) => [
            module.key,
            new Map(module.subItems.map((subItem) => [subItem.key, subItem])),
        ])
    );

    /** The permission key for a sub-item action, or null when it does not exist. */
    function keyOf(moduleKey: string, subItemKey: string, action: string): string | null {
        const subItem = byModule.get(moduleKey)?.get(subItemKey);
        return subItem?.permissions.find((p) => p.action === action)?.key ?? null;
    }

    const viewKeyOf = (moduleKey: string, subItemKey: string) =>
        keyOf(moduleKey, subItemKey, "view") ?? permissionKey(moduleKey, subItemKey, "view");

    /** Every special action label in the catalogue, in a stable order. */
    const specialColumns = [
        ...new Set(
            catalogue.flatMap((module) =>
                module.subItems.flatMap((subItem) =>
                    subItem.permissions.filter((p) => p.special).map((p) => p.label)
                )
            )
        ),
    ].sort();

    /* ---------------------------------------------------------------- editing */

    /**
     * A write is useless without the page it happens on, so ticking any write
     * reveals the row. Clearing "Show in menu" clears the whole row, because a
     * permission nothing can reach is not a permission.
     */
    function toggleAction(moduleKey: string, subItemKey: string, action: string, key: string, on: boolean) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (on) {
                next.add(key);
                if (action !== "view") next.add(viewKeyOf(moduleKey, subItemKey));
            } else {
                next.delete(key);
                if (action === "view") {
                    const subItem = byModule.get(moduleKey)?.get(subItemKey);
                    for (const permission of subItem?.permissions ?? []) next.delete(permission.key);
                }
            }
            return next;
        });
    }

    function toggleModule(module: CatalogueModule, grant: boolean) {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const subItem of module.subItems) {
                for (const permission of subItem.permissions) {
                    if (grant) next.add(permission.key);
                    else next.delete(permission.key);
                }
            }
            return next;
        });
    }

    const allKeys = catalogue.flatMap((module) =>
        module.subItems.flatMap((subItem) => subItem.permissions.map((p) => p.key))
    );

    function selectAll() {
        setSelected(new Set(allKeys));
    }

    function clearAll() {
        setSelected(new Set());
    }

    function revert() {
        setSelected(new Set(initial));
    }

    const changes = countChanges(selected, initial);
    const dirty = changes > 0;

    /* ------------------------------------------------------------------ views */

    const visibleModules = catalogue
        .map((module) => {
            const subItems = module.subItems.filter((subItem) => {
                if (!query.trim()) return true;
                const needle = query.trim().toLowerCase();
                return (
                    module.label.toLowerCase().includes(needle) ||
                    subItem.label.toLowerCase().includes(needle)
                );
            });
            return { ...module, subItems };
        })
        .filter((module) => module.subItems.length > 0);

    const preview = filterMenusByPermissions(MENUS, selected);

    const allExpanded = visibleModules.length > 0 && visibleModules.every((m) => expanded.has(m.key));

    function toggleExpandAll() {
        if (allExpanded) setExpanded(new Set());
        else setExpanded(new Set(visibleModules.map((module) => module.key)));
    }

    /* ------------------------------------------------------------------ save */

    async function save() {
        if (locked) return;
        setSaving(true);
        try {
            // Normalising here means the server stores the same closure the sidebar
            // and the guards resolve: writes imply view, and profile/documents
            // imply the patient list.
            const permissions = normalizePermissions([...selected]);
            const res = await fetch(`/api/role/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions }),
            });
            const json = await res.json();

            if (!json.success) {
                toast({
                    title: "Not saved",
                    description: json.message || "Failed to update permissions",
                    variant: "destructive",
                });
                return;
            }

            const saved = new Set<string>(json.data?.permissions ?? permissions);
            setSelected(saved);
            setInitial(saved);
            toast({
                title: "Saved",
                description: `${ROLE_LABELS[roleName] ?? roleName} now has ${saved.size} permissions`,
                variant: "success",
            });
        } catch {
            toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    /* ---------------------------------------------------------------- render */

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="flex min-h-[calc(100vh-8rem)] flex-col pb-28">
            {/* ---------------------------------------------------------- header */}
            <div className="mb-5">
                <Link
                    href="/admin/roles"
                    className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to roles
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {ROLE_LABELS[roleName] ?? roleName}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {role?.description || "Choose what this role can reach and do."}
                        </p>
                    </div>
                    {locked && (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Lock className="h-4 w-4" />
                            {isSuperAdmin ? "Super Admin — always full access" : "System role — read only"}
                        </div>
                    )}
                </div>
            </div>

            {/* ------------------------------------------------------- top bar */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[13rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search sections…"
                        aria-label="Search sections"
                        className="pl-9"
                        disabled={locked}
                    />
                </div>
                <Button variant="outline" size="sm" onClick={toggleExpandAll} className="gap-1.5">
                    {allExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {allExpanded ? "Collapse all" : "Expand all"}
                </Button>
                <Button variant="outline" size="sm" onClick={selectAll} disabled={locked}>
                    Select all
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll} disabled={locked}>
                    Clear all
                </Button>
            </div>

            {/* ---------------------------------------------------------- body */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-3">
                    {visibleModules.map((module) => {
                        const isOpen = expanded.has(module.key) || Boolean(query.trim());
                        const moduleKeys = module.subItems.flatMap((s) =>
                            s.permissions.map((p) => p.key)
                        );
                        const grantedSections = module.subItems.filter((subItem) =>
                            subItem.permissions.some((p) => selected.has(p.key))
                        ).length;
                        const grantedAll =
                            moduleKeys.length > 0 && moduleKeys.every((key) => selected.has(key));

                        return (
                            <Card
                                key={module.key}
                                className="overflow-hidden border-slate-200/80 dark:border-slate-800"
                            >
                                <CardHeader className="border-b border-slate-100 bg-slate-50/60 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <ModuleToggle
                                            label={module.label}
                                            checked={grantedAll}
                                            indeterminate={!grantedAll && grantedSections > 0}
                                            disabled={locked}
                                            onChange={() => toggleModule(module, !grantedAll)}
                                        />
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {grantedSections} of {module.subItems.length} sections
                                        </span>
                                    </div>
                                </CardHeader>

                                {isOpen && (
                                    <CardContent className="p-0">
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[46rem] text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Section
                                                        </th>
                                                        {CRUD_COLUMNS.map((column) => (
                                                            <th
                                                                key={column.action}
                                                                className="w-28 px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400"
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        {specialColumns.map((label) => (
                                                            <th
                                                                key={label}
                                                                className="w-24 px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400"
                                                            >
                                                                {label}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {module.subItems.map((subItem) => {
                                                        const byAction = new Map(
                                                            subItem.permissions.map((p) => [p.action, p])
                                                        );
                                                        const rowHint =
                                                            subItem.permissions[0]?.key ?? "";

                                                        return (
                                                            <tr
                                                                key={subItem.key}
                                                                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/50 dark:hover:bg-slate-900/40"
                                                            >
                                                                <td className="px-4 py-2.5">
                                                                    <span className="flex items-center gap-2">
                                                                        <span className="font-medium text-slate-800 dark:text-slate-200">
                                                                            {subItem.label}
                                                                        </span>
                                                                        {rowHint && <KeyHint permissionKey={rowHint} />}
                                                                    </span>
                                                                </td>

                                                                {CRUD_COLUMNS.map((column) => {
                                                                    const permission = byAction.get(column.action);
                                                                    if (!permission) {
                                                                        return (
                                                                            <td
                                                                                key={column.action}
                                                                                className="px-2 py-2.5 text-center text-slate-300 dark:text-slate-700"
                                                                            >
                                                                                –
                                                                            </td>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <td key={column.action} className="px-2 py-2.5 text-center">
                                                                            <input
                                                                                type="checkbox"
                                                                                aria-label={`${module.label} ${subItem.label} ${column.label}`}
                                                                                title={permission.key}
                                                                                checked={selected.has(permission.key)}
                                                                                disabled={locked}
                                                                                onChange={(event) =>
                                                                                    toggleAction(
                                                                                        module.key,
                                                                                        subItem.key,
                                                                                        column.action,
                                                                                        permission.key,
                                                                                        event.target.checked
                                                                                    )
                                                                                }
                                                                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                                            />
                                                                        </td>
                                                                    );
                                                                })}

                                                                {specialColumns.map((label) => {
                                                                    const permission = subItem.permissions.find(
                                                                        (p) => p.special && p.label === label
                                                                    );
                                                                    if (!permission) {
                                                                        return (
                                                                            <td
                                                                                key={label}
                                                                                className="px-2 py-2.5 text-center text-slate-300 dark:text-slate-700"
                                                                            >
                                                                                –
                                                                            </td>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <td key={label} className="px-2 py-2.5 text-center">
                                                                            <input
                                                                                type="checkbox"
                                                                                aria-label={`${module.label} ${subItem.label} ${label}`}
                                                                                title={permission.key}
                                                                                checked={selected.has(permission.key)}
                                                                                disabled={locked}
                                                                                onChange={(event) =>
                                                                                    toggleAction(
                                                                                        module.key,
                                                                                        subItem.key,
                                                                                        permission.action,
                                                                                        permission.key,
                                                                                        event.target.checked
                                                                                    )
                                                                                }
                                                                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                                            />
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}

                    {visibleModules.length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            No section matches “{query}”.
                        </p>
                    )}
                </div>

                {/* --------------------------------------------- sidebar preview */}
                <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-72">
                    <Card className="border-slate-200/80 dark:border-slate-800">
                        <CardHeader className="border-b border-slate-100 bg-slate-50/60 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                Sidebar preview
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Exactly what {ROLE_LABELS[roleName] ?? roleName} will see.
                            </p>
                        </CardHeader>
                        <CardContent className="max-h-[28rem] overflow-y-auto p-3">
                            {preview.length === 0 ? (
                                <p className="px-2 py-6 text-center text-xs text-slate-400">
                                    No sections granted — this role will see an empty sidebar.
                                </p>
                            ) : (
                                <ul className="space-y-3">
                                    {preview.map((group) => (
                                        <li key={group.path}>
                                            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                {group.name}
                                            </p>
                                            <ul className="space-y-0.5">
                                                {(group.children ?? []).map((child) => (
                                                    <li
                                                        key={child.path}
                                                        className="truncate rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    >
                                                        {child.name}
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>

            {/* ------------------------------------------------------ sticky foot */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        {dirty ? (
                            <>
                                <TriangleAlert className="h-4 w-4 text-amber-500" />
                                <span>
                                    <span className="font-semibold text-slate-900 dark:text-white">
                                        {changes} unsaved {changes === 1 ? "change" : "changes"}
                                    </span>
                                    {" · grants apply the moment you save"}
                                </span>
                            </>
                        ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                                {locked
                                    ? "This role is locked."
                                    : `${selected.size} of ${allKeys.length} permissions granted`}
                            </span>
                        )}
                    </p>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={revert}
                            disabled={!dirty || saving || locked}
                            className="gap-1.5"
                        >
                            <RotateCcw className="h-4 w-4" /> Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={save}
                            disabled={!dirty || saving || locked}
                            className="gap-1.5"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save changes
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** How many permissions differ between the working set and what is stored. */
function countChanges(next: Set<string>, base: Set<string>): number {
    let diff = 0;
    for (const key of next) if (!base.has(key)) diff += 1;
    for (const key of base) if (!next.has(key)) diff += 1;
    return diff;
}