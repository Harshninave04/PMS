import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultRoleService, { RoleService } from "@/services/role.service";
import { requirePermission, resolveRequestIdentity } from "@/lib/rbac/guard";
import { invalidatePermissionCaches, recordRoleChange } from "@/lib/rbac/audit";
import { isSuperAdminRole, normalizePermissions } from "@/lib/rbac/default-permissions";
import { grantedSubItems } from "@/lib/rbac/default-permissions";
import { PERMISSION_MODULES } from "@/lib/rbac/permissions.config";
import { resolveRolePermissions } from "@/lib/rbac/role-permissions";
import { roleLock, type RoleLock } from "@/lib/rbac/role-lock";
import { roleDescription, roleLabel } from "@/lib/rbac/roles";
import { catalogueProgress } from "@/lib/rbac/access-levels";

/**
 * Reads the caller's own effective permissions and refuses to let them grant
 * anything they do not hold themselves.
 *
 * Without this, anyone who can edit roles could edit a role into a super admin
 * and then log in as one — the permission matrix would happily write whatever it
 * was asked to write. It is the single most important rule in this file.
 */
function permissionsBeyondActor(actor: Set<string>, actorIsSuperAdmin: boolean, requested: readonly string[]): string[] {
    if (actorIsSuperAdmin) return [];
    return normalizePermissions(requested).filter((permission) => !actor.has(permission));
}

/** `module > sub-item > actions` summary, for the roles table tooltips. */
function summarise(permissions: readonly string[]) {
    const bySubItem = grantedSubItems(permissions);
    const modules = PERMISSION_MODULES.map((module) => ({
        key: module.key,
        label: module.label,
        subItems: module.subItems
            .map((subItem) => {
                const actions = bySubItem.get(`${module.key}.${subItem.key}`);
                if (!actions?.size) return null;
                return {
                    key: subItem.key,
                    label: subItem.label,
                    route: subItem.route,
                    actions: [...actions].sort(),
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    })).filter((module) => module.subItems.length > 0);

    return { modules, permissionCount: permissions.length, moduleCount: modules.length };
}

export class RoleController {
    constructor(private roleService: RoleService = defaultRoleService) {}

    /**
     * The one place that answers "may this role's permissions be changed?".
     *
     * Deliberately NOT keyed on `isSystem`: all six shipped roles are system
     * roles, and treating that as "read only" left Doctor, Nurse, Receptionist,
     * Pharmacist and Accountant impossible to adjust. `isSystem` still governs
     * rename and delete in the service layer, which is all it ever meant.
     */
    private lockFor(roleName: string, mayUpdate: boolean, isOwnRole: boolean): RoleLock {
        return roleLock({ roleName, mayUpdate, isOwnRole });
    }

    /**
     * GET /api/role
     *
     * Reachable by any authenticated user on purpose: the user-management and
     * user-creation screens both need the role list to populate a `<select>`,
     * and requiring `admin.roles:view` there would couple two unrelated
     * capabilities. Only ids, names and counts are returned — never another
     * role's permission list — so this cannot be used to read the access map.
     */
    async getRoles(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            // Names and counts only — the user forms need to populate a role picker,
            // so this stays open to any signed-in account, but it never reveals
            // what a role can do. Permission detail lives behind `admin.roles:view`.
            const denied = await requirePermission(request, null);
            if (denied) return denied;

            const roles = await this.roleService.getAllRoles();
            const counts = await this.roleService.userCounts();

            const data = roles.map((role) => ({
                _id: String(role._id),
                role: role.role,
                label: roleLabel(role.role),
                description: roleDescription(role.role, role.description),
                isSystem: Boolean(role.isSystem),
                isSuperAdmin: isSuperAdminRole(role.role),
                userCount: counts[String(role._id)] ?? 0,
            }));

            return NextResponse.json({ success: true, count: data.length, data }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json({ success: false, message: err?.message || "Failed to fetch roles" }, { status: 500 });
        }
    }

    /** GET /api/role/:id — the full permission list, for the matrix editor. */
    async getRoleById(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            // The full permission list is role-management data, so it stays behind
            // `admin.roles:view`. The bare list at `GET /api/role` is what the user
            // forms use, and it carries names only.
            const denied = await requirePermission(request, "admin.roles:view");
            if (denied) return denied;

            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid role ID" }, { status: 400 });
            }

            const role = await this.roleService.getRoleById(new Types.ObjectId(id));
            if (!role) {
                return NextResponse.json({ success: false, message: "Role not found" }, { status: 404 });
            }

            const resolved = resolveRolePermissions(role);
            const isSuperAdmin = isSuperAdminRole(role.role);
            const mayUpdate = identity.identity.permissions.all.has("admin.roles:update");
            const lock = this.lockFor(role.role, mayUpdate, identity.identity.roleId === id);
            const progress = catalogueProgress(new Set(resolved.subItem));

            return NextResponse.json(
                {
                    success: true,
                    data: {
                        _id: String(role._id),
                        role: role.role,
                        label: roleLabel(role.role),
                        description: roleDescription(role.role, role.description),
                        isSystem: Boolean(role.isSystem),
                        isSuperAdmin,
                        userCount: (await this.roleService.userCounts())[String(role._id)] ?? 0,
                        permissions: resolved.subItem,
                        summary: summarise(resolved.subItem),
                        sectionsAllowed: progress.allowed,
                        sectionsTotal: progress.total,
                        canEdit: !lock.locked,
                        lockReason: lock.reason,
                        lockMessage: lock.message,
                    },
                },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json({ success: false, message: err?.message || "Failed to fetch role" }, { status: 500 });
        }
    }

    /** POST /api/role — create a custom role. */
    async createRole(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const denied = await requirePermission(request, "admin.roles:update");
            if (denied) return denied;

            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            const body = (await request.json().catch(() => ({}))) as {
                role?: string;
                permissions?: string[];
                description?: string;
            };

            const requested = normalizePermissions(body.permissions);
            const beyond = permissionsBeyondActor(identity.identity.permissions.all, identity.identity.permissions.isSuperAdmin, requested);
            if (beyond.length) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `You cannot grant permissions you do not hold: ${beyond.slice(0, 5).join(", ")}`,
                        code: "PRIVILEGE_ESCALATION",
                    },
                    { status: 403 }
                );
            }

            const role = await this.roleService.createRole({
                role: body.role ?? "",
                permissions: requested,
                description: body.description,
            });

            await recordRoleChange({
                action: "CREATE",
                role: role.role,
                roleId: String(role._id),
                actor: identity.identity,
                before: [],
                after: resolveRolePermissions(role).subItem,
                reason: "custom role created",
            });
            invalidatePermissionCaches();

            return NextResponse.json(
                { success: true, message: "Role created", data: { _id: String(role._id), role: role.role } },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create role" },
                { status: err?.statusCode || 500 }
            );
        }
    }

    /** PUT /api/role/:id */
    async updateRole(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const denied = await requirePermission(request, "admin.roles:update");
            if (denied) return denied;

            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid role ID" }, { status: 400 });
            }

            const roleId = new Types.ObjectId(id);
            const existing = await this.roleService.getRoleById(roleId);
            if (!existing) {
                return NextResponse.json({ success: false, message: "Role not found" }, { status: 404 });
            }

            // Editing the role you administer yourself is how a lock-out starts, and the
            // Super Admin role is the only way back out of one. Both are refused
            // here rather than in the UI, because the UI is not the boundary.
            const lock = this.lockFor(
                existing.role,
                identity.identity.permissions.all.has("admin.roles:update"),
                identity.identity.roleId === id
            );
            if (lock.locked) {
                return NextResponse.json(
                    {
                        success: false,
                        message: lock.message,
                        code: lock.reason,
                    },
                    { status: 403 }
                );
            }

            const before = resolveRolePermissions(existing).subItem;
            const body = (await request.json().catch(() => ({}))) as {
                role?: string;
                permissions?: string[];
                description?: string;
            };

            const requested = Array.isArray(body.permissions) ? normalizePermissions(body.permissions) : before;
            const beyond = permissionsBeyondActor(
                identity.identity.permissions.all,
                identity.identity.permissions.isSuperAdmin,
                requested
            );
            if (beyond.length) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `You cannot grant permissions you do not hold: ${beyond.slice(0, 5).join(", ")}`,
                        code: "PRIVILEGE_ESCALATION",
                    },
                    { status: 403 }
                );
            }

            // Only re-seed the legacy module access when the caller sent a new
            // permission list, so a rename or description edit cannot silently
            // reset the data-layer grants the controllers rely on.
            const update = {
                role: body.role,
                description: body.description,
                permissionsCustomized: true,
                ...(Array.isArray(body.permissions)
                    ? {
                          permissions: requested,
                          access: buildAccessFromPermissions(requested),
                      }
                    : {}),
            };

            const role = await this.roleService.updateRole(roleId, update);
            const after = resolveRolePermissions(role).subItem;

            await recordRoleChange({
                action: "UPDATE",
                role: role?.role ?? existing.role,
                roleId: id,
                actor: identity.identity,
                before,
                after,
                reason: "permissions edited",
            });
            invalidatePermissionCaches();

            return NextResponse.json(
                { success: true, message: "Role updated successfully", data: { _id: id, permissions: after } },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update role" },
                { status: err?.statusCode || 500 }
            );
        }
    }

    /** DELETE /api/role/:id */
    async deleteRole(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const denied = await requirePermission(request, "admin.roles:update");
            if (denied) return denied;

            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid role ID" }, { status: 400 });
            }

            const roleId = new Types.ObjectId(id);
            const existing = await this.roleService.getRoleById(roleId);
            if (!existing) {
                return NextResponse.json({ success: false, message: "Role not found" }, { status: 404 });
            }

            const before = resolveRolePermissions(existing).subItem;
            await this.roleService.deleteRole(roleId);

            await recordRoleChange({
                action: "DELETE",
                role: existing.role,
                roleId: id,
                actor: identity.identity,
                before,
                after: [],
                reason: "role deleted",
            });
            invalidatePermissionCaches();

            return NextResponse.json(
                { success: true, message: `Role '${existing.role}' deleted`, data: { _id: id } },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete role" },
                { status: err?.statusCode || 500 }
            );
        }
    }

    /** GET /api/role — admin view: every role with its permission summary. */
    async getRolesForManagement(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const denied = await requirePermission(request, "admin.roles:view");
            if (denied) return denied;

            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            const roles = await this.roleService.getAllRoles();
            const counts = await this.roleService.userCounts();
            const mayUpdate = identity.identity.permissions.all.has("admin.roles:update");

            const data = roles.map((role) => {
                const resolved = resolveRolePermissions(role);
                const progress = catalogueProgress(new Set(resolved.subItem));
                const lock = this.lockFor(role.role, mayUpdate, identity.identity.roleId === String(role._id));
                return {
                    _id: String(role._id),
                    role: role.role,
                    label: roleLabel(role.role),
                    description: roleDescription(role.role, role.description),
                    isSystem: Boolean(role.isSystem),
                    isSuperAdmin: isSuperAdminRole(role.role),
                    userCount: counts[String(role._id)] ?? 0,
                    permissionCount: resolved.subItem.length,
                    sectionsAllowed: progress.allowed,
                    sectionsTotal: progress.total,
                    canEdit: !lock.locked,
                    lockReason: lock.reason,
                    lockMessage: lock.message,
                };
            });

            return NextResponse.json({ success: true, count: data.length, data }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json({ success: false, message: err?.message || "Failed to fetch roles" }, { status: 500 });
        }
    }
}

/**
 * Keeps the legacy module-keyed `access` list in step with the sub-item
 * permissions, so the older data-layer guard keeps working after an edit
 * instead of silently rejecting every query filter the repositories build.
 *
 * This maps backwards — sub-item -> the data-layer keys that back it — using the
 * same per-module shapes the migration uses forwards.
 */
function buildAccessFromPermissions(permissions: readonly string[]) {
    const bySubItem = grantedSubItems(permissions);
    const byModule = new Map<string, Set<string>>();

    const LEGACY_FOR: Record<string, Record<string, readonly string[]>> = {
        patients: {
            register: ["patient.patient.create"],
            list: ["patient.patient.view"],
            profile: ["patient.patient.view"],
            documents: ["patient.document.upload"],
        },
        opd: {
            book: ["appointment.appointment.create"],
            queue: ["appointment.appointment.view"],
            list: ["appointment.appointment.view"],
        },
        clinical: {
            consultations: ["clinical.record.view"],
            prescriptions: ["clinical.prescription.view"],
            vitals: ["nursing.vitals.view"],
            history: ["clinical.record.view"],
        },
        admissions: {
            new: ["admission.admission.create"],
            current: ["admission.admission.view"],
            transfer: ["admission.admission.transfer"],
            discharge: ["admission.admission.discharge"],
            summary: ["admission.admission.view"],
            history: ["admission.admission.view"],
        },
        wards: {
            availability: ["ward.ward.view"],
            list: ["ward.ward.view"],
            rooms: ["ward.ward.view"],
            beds: ["ward.ward.view"],
        },
        nursing: {
            patients: ["nursing.task.view"],
            vitals: ["nursing.vitals.view"],
            notes: ["nursing.task.create"],
            medications: ["nursing.task.view"],
        },
        pharmacy: {
            prescriptions: ["pharmacy.prescription.view"],
            dispensing: ["pharmacy.dispense.create"],
            medicines: ["pharmacy.stock.view"],
            categories: ["pharmacy.stock.manage"],
            stock: ["pharmacy.stock.view"],
            expiry: ["pharmacy.stock.manage"],
        },
        billing: {
            create: ["billing.invoice.create"],
            invoices: ["billing.invoice.view"],
            payments: ["billing.payment.view"],
            outstanding: ["billing.payment.view"],
        },
        reports: {
            summary: ["reports.clinical.view"],
            patients: ["reports.clinical.view"],
            appointments: ["reports.clinical.view"],
            doctors: ["reports.operational.view"],
            admissions: ["reports.clinical.view"],
            pharmacy: ["reports.operational.view"],
            billing: ["reports.financial.view"],
        },
        admin: {
            hospital: ["organization.organization.view"],
            users: ["user.user.view"],
            roles: ["role.role.view"],
            doctors: ["doctor.doctor.view"],
            staff: ["staff.staff.view"],
            departments: ["department.department.view"],
            schedule: ["staff.staff.view"],
        },
        dashboard: { main: ["dashboard.dashboard.view"] },
    };

    for (const module of PERMISSION_MODULES) {
        const moduleKeys = LEGACY_FOR[module.key] ?? {};
        const collected = byModule.get(module.key) ?? new Set<string>();
        for (const subItem of module.subItems) {
            const actions = bySubItem.get(`${module.key}.${subItem.key}`);
            if (!actions?.size) continue;
            for (const legacy of moduleKeys[subItem.key] ?? []) collected.add(legacy);
        }
        if (collected.size) byModule.set(module.key, collected);
    }

    return [...byModule.entries()].map(([moduleName, keys]) => {
        const list = [...keys].sort();
        return {
            moduleName,
            permissions: list,
            grants: list.map((permission) => ({ permission, orgScope: "BRANCH", relScope: "UNRESTRICTED" })),
        };
    });
}

const roleController = new RoleController();
export default roleController;
