"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    Check,
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
import { MENUS, filterMenusByPermissions } from "@/lib/menu-data";
import { PERMISSION_MODULES, type ModulePermission } from "@/lib/rbac/permissions.config";
import { normalizePermissions } from "@/lib/rbac/default-permissions";
import { roleDescription, roleLabel } from "@/lib/rbac/roles";
import {
    ACCESS_LEVELS,
    ACCESS_LEVEL_HELP,
    ACCESS_LEVEL_LABELS,
    PRESETS,
    actionKeyOf,
    allKeysForSubItem,
    applyLevel,
    applyPreset,
    catalogueProgress,
    countChangedSections,
    levelOf,
    moduleHelp,
    moduleIsFullyOn,
    moduleIsPartlyOn,
    moduleProgress,
    resetToRoleDefault,
    specialActionLabel,
    viewKeyOf,
    type AccessLevel,
    type PresetId,
} from "@/lib/rbac/access-levels";

/**
 * Settings -> Roles & Permissions -> edit one role.
 *
 * Built for somebody who does not work with software. Instead of a grid of tick
 * boxes with empty cells, every sidebar section gets one sentence-friendly
 * choice:
 *
 *     No access | View only | Edit | Full
 *
 * and, underneath it, only the extra actions that section really has — "Can
 * upload documents", "Can dispense medicines", "Can give refunds". Nothing is
 * ever rendered as a blank cell.
 *
 * The panel on the right is the same filter the real sidebar uses, so what is
 * shown there is exactly what every person on this role will see.
 */

interface RoleData {
    _id: string;
    role: string;
    label?: string;
    description?: string;
    isSuperAdmin?: boolean;
    canEdit?: boolean;
    lockReason?: string;
    lockMessage?: string;
    userCount?: number;
    permissions?: string[];
}

/** The four choices, rendered as one control. */
function AccessPicker({
    value,
    disabled,
    disabledReason,
    moduleLabel,
    subItemLabel,
    onChange,
}: {
    value: AccessLevel;
    disabled?: boolean;
    disabledReason?: string;
    moduleLabel: string;
    subItemLabel: string;
    onChange: (next: AccessLevel) => void;
}) {
    return (
        <div
          className="inline-flex w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 sm:w-auto"
          role="radiogroup"
          aria-label={`Access level for ${subItemLabel}`}
        >
            {ACCESS_LEVELS.map((level, index) => {
                const active = value === level;
                return (
                    <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={disabled ? disabledReason : ACCESS_LEVEL_HELP[level]}
                        disabled={disabled}
                        onClick={() => onChange(level)}
                        className={[
                            "flex-1 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3",
                            index > 0 ? "border-l border-slate-200 dark:border-slate-700" : "",
                            active
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900",
                            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        ].join(" ")}
                    >
                        <span className="sr-only">
                            {ACCESS_LEVEL_LABELS[level]} for {moduleLabel} {subItemLabel}
                        </span>
                        <span aria-hidden="true">{ACCESS_LEVEL_LABELS[level]}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** A tri-state checkbox for a module header: on, off, or "some of it". */
function ModuleSwitch({
    checked,
    indeterminate,
    disabled,
    title,
    onChange,
    label,
}: {
    checked: boolean;
    indeterminate: boolean;
    disabled?: boolean;
    title?: string;
    onChange: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={indeterminate ? "mixed" : checked}
            aria-label={label}
            title={title ?? label}
            disabled={disabled}
            onClick={onChange}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                checked || indeterminate
                    ? "bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-700"
            } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
            <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    checked || indeterminate ? "left-[1.375rem]" : "left-0.5"
                }`}
            />
            {indeterminate ? (
                <span className="absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white" />
            ) : null}
        </button>
    );
}

export default function RolePermissionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { toast } = useToast();
    const { id } = use(params);

    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<RoleData | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [stored, setStored] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [showTechnical, setShowTechnical] = useState(false);

    useEffect(() => {
        // Set state from the response, never straight from the effect body: a
        // slower request for a role the administrator has already navigated away
        // from must not overwrite the one on screen.
        let current = true;

        fetch(`/api/role/${id}`)
            .then((res) => res.json())
            .then((json: { success?: boolean; message?: string; data?: RoleData }) => {
                if (!current) return;
                if (!json.success || !json.data) {
                    setFailed(true);
                    toast({
                        title: "Could not open this role",
                        description: json.message || "The role was not found.",
                        variant: "destructive",
                    });
                    return;
                }
                // The catalogue is derived from the sidebar on the client too, so
                // there is exactly one answer to "which sections exist".
                const granted = new Set<string>(json.data.permissions ?? []);
                setRole(json.data);
                setSelected(granted);
                setStored(granted);
                // Everything open by default reads better than a wall of collapsed
                // rows for an administrator who came here to check one thing.
                setCollapsed(new Set<string>());
            })
            .catch(() => {
                if (!current) return;
                toast({ title: "Error", description: "Could not load this role.", variant: "destructive" });
            })
            .finally(() => {
                if (current) setLoading(false);
            });

        return () => {
            current = false;
        };
    }, [id, toast]);

    const roleName = role?.role ?? "";
    const locked = role?.isSuperAdmin === true || role?.canEdit === false;
    const lockMessage = role?.lockMessage ?? "This role cannot be changed.";

    /* ------------------------------------------------------------------ edit */

    function setLevel(moduleKey: string, subItem: ModulePermission["subItems"][number], level: AccessLevel) {
        setSelected((previous) => applyLevel(previous, moduleKey, subItem, level));
    }

    function toggleSpecial(moduleKey: string, subItemKey: string, key: string, on: boolean) {
        setSelected((previous) => {
            const next = new Set(previous);
            if (on) {
                next.add(key);
                // An action you cannot reach the page for is not a permission.
                next.add(viewKeyOf(moduleKey, subItemKey));
            } else {
                next.delete(key);
            }
            return next;
        });
    }

    function toggleModule(module: ModulePermission) {
        setSelected((previous) => {
            const turnOn = !moduleIsFullyOn(previous, module);
            let next = previous;
            for (const subItem of module.subItems) {
                next = applyLevel(next, module.key, subItem, turnOn ? "FULL" : "NONE");
            }
            return next;
        });
    }

    function applyPresetTo(preset: PresetId) {
        setSelected(applyPreset(preset, roleName));
    }

    function resetToDefault() {
        setSelected(resetToRoleDefault(roleName));
    }

    /* ----------------------------------------------------------------- views */

    const modules = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return PERMISSION_MODULES;

        return PERMISSION_MODULES.map((module) => ({
            ...module,
            subItems: module.subItems.filter(
                (subItem) =>
                    module.label.toLowerCase().includes(needle) ||
                    subItem.label.toLowerCase().includes(needle)
            ),
        })).filter((module) => module.subItems.length > 0);
    }, [query]);

    const changedSections = countChangedSections(selected, stored);
    const dirty = changedSections > 0;
    const progress = catalogueProgress(selected);
    const preview = filterMenusByPermissions(MENUS, selected);
    const allExpanded = modules.length > 0 && modules.every((module) => !collapsed.has(module.key));

    /* ------------------------------------------------------------------ save */

    async function save() {
        if (locked) return;
        setSaving(true);
        try {
            // Normalising here means the server stores the same closure the
            // sidebar and the guards resolve: a write implies its read, and the
            // patient screens imply the patient list.
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
                    description: json.message || "The change could not be saved.",
                    variant: "destructive",
                });
                return;
            }

            const saved = new Set<string>(json.data?.permissions ?? permissions);
            setSelected(saved);
            setStored(saved);
            toast({
                title: "Saved",
                description: `${role?.label ?? roleName} now has access to ${catalogueProgress(saved).allowed} sections. It applies straight away.`,
                variant: "success",
            });
        } catch {
            toast({ title: "Error", description: "The change could not be saved.", variant: "destructive" });
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

    if (failed || !role) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                    This role could not be opened
                </p>
                <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                    {role?.lockMessage ??
                        "It may have been deleted, or you may not have permission to see it."}
                </p>
                <Link
                    href="/admin/roles"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                >
                    <ArrowLeft className="h-4 w-4" /> Back to all roles
                </Link>
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
                    <ArrowLeft className="h-4 w-4" /> All roles
                </Link>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {role?.label ?? roleLabel(roleName)}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {role?.description ?? roleDescription(roleName, role?.description)}
                        </p>
                    </div>

                    {/* Save and Cancel are always on screen, so nothing to save
                        is ever a question of hunting for a button. */}
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={resetToDefault}
                            disabled={locked || saving}
                            className="gap-1.5"
                        >
                            <RotateCcw className="h-4 w-4" /> Reset to default
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(new Set(stored))}
                            disabled={!dirty || locked || saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={save}
                            disabled={!dirty || locked || saving}
                            className="gap-1.5"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save
                        </Button>
                    </div>
                </div>

                <p className="mt-2 flex items-center gap-2 text-sm">
                    {dirty ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="h-4 w-4" />
                            {changedSections} unsaved change{changedSections === 1 ? "" : "s"}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Check className="h-4 w-4 text-emerald-500" />
                            Everything is saved
                        </span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                        {progress.allowed} of {progress.total} sections allowed
                    </span>
                </p>

                {locked ? (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{lockMessage}</span>
                    </div>
                ) : null}
            </div>

            {/* --------------------------------------------------------- presets */}
            {!locked ? (
                <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Start from
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map((preset) => (
                            <Button
                                key={preset.id}
                                variant="outline"
                                size="sm"
                                onClick={() => applyPresetTo(preset.id)}
                                title={preset.help}
                                className="flex-col items-start gap-0 px-3 py-1.5 text-left"
                            >
                                <span className="text-xs font-semibold">{preset.label}</span>
                                <span className="text-[10px] font-normal text-slate-400">
                                    {preset.help}
                                </span>
                            </Button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                        A preset only fills in the boxes. You can still change anything afterwards.
                    </p>
                </div>
            ) : null}

            {/* --------------------------------------------------------- toolbar */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search sections"
                        aria-label="Search sections"
                        className="h-9 pl-9"
                        disabled={locked}
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        setCollapsed(allExpanded ? new Set(PERMISSION_MODULES.map((m) => m.key)) : new Set())
                    }
                    className="gap-1.5"
                >
                    {allExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {allExpanded ? "Collapse all" : "Expand all"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTechnical((value) => !value)}
                    title="Show the internal permission key behind each control"
                    className="gap-1.5"
                >
                    <Info className="h-4 w-4" /> {showTechnical ? "Hide" : "Show"} keys
                </Button>
            </div>

            {/* ------------------------------------------------------------ body */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-3">
                    {modules.map((module) => {
                        const isOpen = !collapsed.has(module.key) || Boolean(query.trim());
                        const progressForModule = moduleProgress(selected, module);
                        const fullyOn = moduleIsFullyOn(selected, module);
                        const partlyOn = moduleIsPartlyOn(selected, module);

                        return (
                            <Card
                                key={module.key}
                                className="overflow-hidden"
                                style={{
                                    borderLeftWidth: "4px",
                                    borderLeftColor: fullyOn ? "#10b981" : partlyOn ? "#f59e0b" : "transparent",
                                }}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCollapsed((previous) => {
                                                const next = new Set(previous);
                                                if (next.has(module.key)) next.delete(module.key);
                                                else next.add(module.key);
                                                return next;
                                            })
                                        }
                                        aria-expanded={isOpen}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    >
                                        {isOpen ? (
                                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                        )}
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                                                {module.label}
                                            </span>
                                            {moduleHelp(module.key) ? (
                                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                                    {moduleHelp(module.key)}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {progressForModule.allowed} of {progressForModule.total}{" "}
                                            sections allowed
                                        </span>
                                        <ModuleSwitch
                                            label={`Allow everything in ${module.label}`}
                                            checked={fullyOn}
                                            indeterminate={partlyOn}
                                            disabled={locked}
                                            title={
                                                locked
                                                    ? lockMessage
                                                    : fullyOn
                                                      ? "Turn off every section in this group"
                                                      : "Turn on every section in this group"
                                            }
                                            onChange={() => toggleModule(module)}
                                        />
                                    </div>
                                </div>

                                {isOpen ? (
                                    <CardContent className="space-y-2 p-3 pt-0">
                                        {module.subItems.map((subItem) => {
                                            const keys = allKeysForSubItem(module.key, subItem);
                                            const currentLevel = levelOf(selected, module.key, subItem);
                                            const isChanged = keys.some(
                                                (key) => selected.has(key) !== stored.has(key)
                                            );
                                            const specials = subItem.specials;

                                            return (
                                                <div
                                                    key={subItem.key}
                                                    className={`rounded-lg border p-3 transition-colors ${
                                                        isChanged
                                                            ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5"
                                                            : "border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
                                                    }`}
                                                >
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                                                {subItem.label}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                {ACCESS_LEVEL_HELP[currentLevel]}
                                                            </p>
                                                            {showTechnical ? (
                                                                <p className="mt-1 font-mono text-[10px] text-slate-400">
                                                                    {keys
                                                                        .filter((key) => selected.has(key))
                                                                        .join(", ") || "none"}
                                                                </p>
                                                            ) : null}
                                                        </div>

                                                        <AccessPicker
                                                            value={currentLevel}
                                                            disabled={locked}
                                                            disabledReason={lockMessage}
                                                            moduleLabel={module.label}
                                                            subItemLabel={subItem.label}
                                                            onChange={(level) =>
                                                                setLevel(module.key, subItem, level)
                                                            }
                                                        />
                                                    </div>

                                                    {/* Only the actions this section really has.
                                                        There is no such thing as an empty
                                                        box to puzzle over. */}
                                                    {specials.length > 0 ? (
                                                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
                                                            {specials.map((special) => {
                                                                const key = actionKeyOf(
                                                                    module.key,
                                                                    subItem.key,
                                                                    special.action
                                                                );
                                                                const checked = selected.has(key);
                                                                return (
                                                                    <label
                                                                        key={special.action}
                                                                        title={showTechnical ? key : special.label}
                                                                        className={`flex items-center gap-2 text-xs ${
                                                                            locked
                                                                                ? "cursor-not-allowed opacity-60"
                                                                                : "cursor-pointer"
                                                                        }`}
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            disabled={locked}
                                                                            aria-label={specialActionLabel(
                                                                                special.action,
                                                                                special.label
                                                                            )}
                                                                            onChange={(event) =>
toggleSpecial(
                                                            module.key,
                                                            subItem.key,
                                                            key,
                                                            event.target.checked
                                                        )
                                                                            }
                                                                            className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                                                                        />
                                                                        <span className="text-slate-600 dark:text-slate-300">
                                                                            {specialActionLabel(
                                                                                special.action,
                                                                                special.label
                                                                            )}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                ) : null}
                            </Card>
                        );
                    })}

                    {modules.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            No section matches “{query}”.
                        </p>
                    ) : null}
                </div>

                {/* ------------------------------------------------------- preview */}
                <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-72">
                    <Card className="border-slate-200 dark:border-slate-800">
                        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                What this role will see
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                The menu updates as you type. This is exactly what{" "}
                                {role?.label ?? roleLabel(roleName)} gets.
                            </p>
                        </div>
                        <CardContent className="max-h-[28rem] overflow-y-auto p-3">
                            {preview.length === 0 ? (
                                <p className="px-2 py-6 text-center text-xs text-slate-400">
                                    Nothing at all. This role will not see any menu.
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
                                                        className="truncate rounded px-2 py-1 text-sm text-slate-600 dark:text-slate-300"
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

            {/* --------------------------------------------------- sticky footer */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {dirty ? (
                            <>
                                <span className="font-semibold text-slate-900 dark:text-white">
                                    {changedSections} unsaved change
                                    {changedSections === 1 ? "" : "s"}
                                </span>{" "}
                                <span className="text-slate-500 dark:text-slate-400">
                                    · takes effect the moment you save
                                </span>
                            </>
                        ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                                {locked
                                    ? "This role is locked."
                                    : `${progress.allowed} of ${progress.total} sections allowed`}
                            </span>
                        )}
                    </p>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(new Set(stored))}
                            disabled={!dirty || saving || locked}
                        >
                            Cancel
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