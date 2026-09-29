import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Role document id (ObjectId) */
      role?: string | null;
      /** Resolved role name, e.g. "DOCTOR" */
      roleName?: string | null;
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
    organization?: any;
    branch?: any;
  }
}
