import mongoose from "mongoose";
import "@/models/organization.model";
import "@/models/department.model";
import { getMongoUri } from "@/lib/mongoUri";

function withRetryWritesDisabled(uri: string): string {
  const queryIndex = uri.indexOf("?");
  const baseUri = queryIndex === -1 ? uri : uri.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : uri.slice(queryIndex + 1);
  const options = new URLSearchParams(query);
  options.set("retryWrites", "false");
  return `${baseUri}?${options.toString()}`;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
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
      retryWrites: false,
    };

    cached.promise = mongoose.connect(withRetryWritesDisabled(getMongoUri()), opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
