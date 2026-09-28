import { Document } from "mongoose";
import { IPermissionGrant } from "@/types/rbac";

export { type IPermissionGrant } from "@/types/rbac";

export interface IManagedRole {
    roleId: Document['_id'];
    permissions: string[];
}

export interface IRole extends Document {
    role: string;
    access: IAccess[];
    managedRoles: IManagedRole[];
}

export interface IAccess {
    moduleName: string;
    permissions: string[];
    grants?: IPermissionGrant[];
}