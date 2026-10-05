import { DefaultSession } from "next-auth";

/** Sub-item permissions resolved at sign-in, `module.submodule:action`. */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Role document id (ObjectId) */
      role?: string | null;
      /** Resolved role name, e.g. "DOCTOR" */
      roleName?: string | null;
      /** Snapshot taken at sign-in; `/api/me/permissions` is the live source. */
      permissions?: string[];
      organization?: any;
      branch?: any;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    /** Role document id (ObjectId) */
    role?: string | null;
    /** Resolved role name, e.g. "DOCTOR" */
    roleName?: string | null;
    permissions?: string[];
    organization?: any;
    branch?: any;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    /** Role document id (ObjectId) */
    role?: string | null;
    /** Resolved role name, e.g. "DOCTOR" */
    roleName?: string | null;
    permissions?: string[];
    organization?: any;
    branch?: any;
  }
}
