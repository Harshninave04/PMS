export class AdmissionError extends Error {
    constructor(
        message: string,
        readonly statusCode: number
    ) {
        super(message);
        this.name = "AdmissionError";
    }
}

export function admissionErrorDetails(error: unknown, fallback: string): { message: string; statusCode: number } {
    if (typeof error === "object" && error !== null) {
        const candidate = error as { message?: unknown; statusCode?: unknown; status?: unknown; code?: unknown; name?: unknown };
        const message = typeof candidate.message === "string" ? candidate.message : fallback;
        const code = Number(candidate.statusCode ?? candidate.status);
        if (Number.isInteger(code) && code >= 400 && code <= 599) {
            return { message, statusCode: code };
        }
        if (candidate.code === 11000) return { message: "A conflicting admission record already exists", statusCode: 409 };
        if (candidate.name === "SyntaxError") return { message: "Request body must be valid JSON", statusCode: 400 };
        if (candidate.name === "ValidationError" || candidate.name === "CastError") {
            return { message, statusCode: 400 };
        }
        return { message, statusCode: 500 };
    }
    return {
        message: error instanceof Error ? error.message : fallback,
        statusCode: 500
    };
}
