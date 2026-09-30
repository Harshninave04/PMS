/**
 * Shared constants for the first-run bootstrap.
 *
 * Kept in its own module because both the bootstrap and the seed need the
 * sentinel key: the seed has to ignore the sentinel row when deciding whether
 * the system configuration section still needs to be created, otherwise the
 * bootstrap's own lock would make that section look already-populated.
 */

export const BOOTSTRAP_SENTINEL_KEY = "bootstrap.first_run_completed";

/**
 * Values the bootstrap sentinel can hold.
 *  - "in_progress": a process has claimed the seed and is running it
 *  - "true"        : the seed finished successfully
 */
export const BOOTSTRAP_SENTINEL_IN_PROGRESS = "in_progress";
export const BOOTSTRAP_SENTINEL_DONE = "true";