/**
 * The decisions `npm run bootstrap` makes, kept separate from the database calls
 * so they can be reasoned about and tested on their own.
 *
 * The guiding rule: reference data fills a genuinely empty database and nothing
 * else. A hospital that already has departments or job titles has made its own
 * choices, and silently merging a sample set into it is data corruption.
 */

/**
 * Reference data is only ever created from nothing. An existing count of even
 * one document means the hospital has its own arrangement, which is preserved.
 */
export function shouldSeedReferenceData(existingCount: number): boolean {
    return existingCount === 0;
}

export type AdminPlan =
    | { action: "create"; email: string }
    | { action: "skip"; reason: string };

/**
 * Never touches an existing account — not even to reset its password. Creating
 * a credential is only ever done for an address that is genuinely unused.
 */
export function planAdmin(input: {
    email: string;
    roleExists: boolean;
    emailTaken: boolean;
    existingAdminHolders: number;
    password?: string;
}): AdminPlan {
    const email = input.email.trim().toLowerCase();

    if (!input.roleExists) {
        throw new Error("The ADMIN role does not exist. Start the app once so it can create the roles, then re-run.");
    }
    if (input.emailTaken) {
        return { action: "skip", reason: `${email} already exists, left untouched` };
    }
    if (!input.password) {
        // Existing admins and a new one are told different things: the first
        // install genuinely cannot continue, a second admin is merely optional.
        return input.existingAdminHolders > 0
            ? { action: "skip", reason: `an administrator already exists and no password was given, so ${email} was not created` }
            : { action: "create", email };
    }
    if (input.password.length < 8) {
        throw new Error("The administrator password must be at least 8 characters.");
    }
    return { action: "create", email };
}