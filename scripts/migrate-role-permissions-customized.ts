/** Marks roles with an existing explicit sub-item list as administrator-managed.
 * Dry run is the default; pass --apply to update MongoDB.
 */
import "dotenv/config";
import mongoose from "mongoose";
import Role from "../src/models/role.model";
import { recordRoleChange } from "../src/lib/rbac/audit";

const APPLY = process.argv.includes("--apply");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

async function main() {
  console.log(APPLY ? "Mode: APPLY" : "Mode: DRY RUN (no writes)");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    const candidates = await Role.find({ permissionsCustomized: { $ne: true } })
      .select("role permissions")
      .lean();
    const roles = candidates.filter((role) => Array.isArray(role.permissions) && role.permissions.length > 0);

    console.log(`${roles.length} role(s) have a non-empty permission list to mark.`);
    for (const role of roles) {
      console.log(`  ${role.role}: ${role.permissions.length} permission(s)`);
      if (APPLY) {
        await Role.updateOne({ _id: role._id }, { $set: { permissionsCustomized: true } });
        await recordRoleChange({
          action: "MIGRATE",
          role: role.role,
          roleId: String(role._id),
          actor: { roleName: "SYSTEM" },
          before: role.permissions,
          after: role.permissions,
          reason: "marked existing permission list as customized",
        });
      }
    }
    if (!APPLY) console.log("Nothing was written. Pass --apply to mark these roles.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("Role permissions migration failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
