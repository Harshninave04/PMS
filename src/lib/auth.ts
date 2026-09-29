import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/dbConnect";
import userRepository from "@/repositories/user.repository";
import Role from "@/models/role.model";

/** Normalise a mongoose ObjectId / populated id into a plain string for the JWT */
function toIdString(value: unknown): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : String(value);
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@hospital.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        await dbConnect();

        const user = await userRepository.findByEmail(credentials.email);

        if (!user) {
          throw new Error("Invalid email or password");
        }

        if (user.isActive === false) {
          throw new Error("Your account has been deactivated");
        }

        // Support bcrypt hashed passwords as well as legacy plaintext fallback
        let isPasswordValid = false;
        if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
          isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        } else {
          isPasswordValid = credentials.password === user.password;
        }

        if (!isPasswordValid) {
          throw new Error("Invalid email or password");
        }

        // The session is serialised into a JWT cookie, so every identifier must
        // be a plain string. Resolve the role *name* alongside the role id so the
        // client can render role-aware UI (dashboards, widgets, badges).
        const roleId = toIdString(user.role);
        const roleDoc = roleId ? await Role.findById(roleId).select("role").lean() : null;

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: roleId,
          roleName: roleDoc?.role ?? null,
          organization: toIdString(user.organization),
          branch: toIdString(user.branch),
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roleName = user.roleName ?? null;
        token.organization = user.organization;
        token.branch = user.branch;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.roleName = token.roleName ?? null;
        session.user.organization = token.organization;
        session.user.branch = token.branch;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
