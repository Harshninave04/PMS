import dbConnect from "@/lib/dbConnect";
import User from "@/models/user.model";
import Role from "@/models/role.model";
// Registered for populate()
import "@/models/organization.model";

export class AdminService {
  /**
   * Administration Summary KPIs
   */
  static async getAdminSummaryStats() {
    await dbConnect();

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalRoles,
      recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      Role.countDocuments(),
      User.find()
        .populate("role", "role")
        .populate("organization", "organizationName")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalRoles,
      recentUsers,
    };
  }

}
