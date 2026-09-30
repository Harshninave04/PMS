import mongoose from "mongoose";
import "@/models/organization.model";
import { ensureFirstRunSeed } from "@/lib/bootstrap/first-run";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || (global.mongooseCache = { conn: null, promise: null });

export async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  // First run against an empty database seeds all required reference data
  // (menus, roles, super admin, organization, departments, catalogs, settings).
  // Additive and idempotent - it never deletes or overwrites existing data.
  await ensureFirstRunSeed();

  return cached.conn;
}

export default dbConnect;
