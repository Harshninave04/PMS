import { Document } from "mongoose";
import { IPermissionGrant } from "@/types/rbac";

export { type IPermissionGrant } from "@/types/rbac";

export interface IManagedRole {
    roleId: Document['_id'];
    permissions: string[];
}

export type RoleOwnership = "code" | "admin";

export interface IRole extends Document {
    role: string;
    /** "code" roles are reconciled from ROLE_ACCESS on boot; "admin" roles are left alone. */
    managedBy: RoleOwnership;
    access: IAccess[];
    managedRoles: IManagedRole[];
}

export interface IAccess {
    moduleName: string;
    permissions: string[];
    grants?: IPermissionGrant[];
}