import mongoose from "mongoose";
import "@/models/organization.model";
import "@/models/department.model";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

function withRetryWritesDisabled(uri: string): string {
  const queryIndex = uri.indexOf("?");
  const baseUri = queryIndex === -1 ? uri : uri.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : uri.slice(queryIndex + 1);
  const options = new URLSearchParams(query);
  options.set("retryWrites", "false");
  return `${baseUri}?${options.toString()}`;
}

const MONGODB_CONNECTION_URI = withRetryWritesDisabled(MONGODB_URI);

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
      retryWrites: false,
    };

    cached.promise = mongoose.connect(MONGODB_CONNECTION_URI, opts).then((mongooseInstance) => {
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
