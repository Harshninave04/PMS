export function getMongoUri(): string {
    const uri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();
    if (!uri) {
        throw new Error("MongoDB URI is not configured. Set MONGODB_URI in the project environment.");
    }
    return uri;
}
