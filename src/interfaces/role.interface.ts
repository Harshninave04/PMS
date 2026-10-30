import { Document } from "mongoose";
import { IPermissionGrant } from "@/types/rbac";

export { type IPermissionGrant } from "@/types/rbac";

export interface IManagedRole {
    roleId: Document['_id'];
    permissions: string[];
}

export interface IRole extends Document {
    role: string;
    /** Sub-item permissions, `module.submodule:action`. */
    permissions: string[];
    /** True once an administrator has explicitly saved the list, including an empty list. */
    permissionsCustomized: boolean;
    /** One-time additive permission migrations already applied to this role. */
    permissionMigrations?: string[];
    /** Seeded role: cannot be renamed or deleted. */
    isSystem: boolean;
    description: string;
    access: IAccess[];
    managedRoles: IManagedRole[];
}

export interface IAccess {
    moduleName: string;
    permissions: string[];
    grants?: IPermissionGrant[];
}
