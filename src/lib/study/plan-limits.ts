/**
 * How big a plan of blocks can be: Tamari's plans and custom routines run through the same machinery, so a
 * routine is saved only within these limits (a session lasts at most 8 hours). Pure and client-safe.
 */
export const PLAN_MAX_BLOCKS = 8;
export const PLAN_MAX_MINUTES = 480;
