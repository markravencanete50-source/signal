/**
 * The active-brand cookie name, in its own module.
 *
 * A `"use server"` file may export ONLY async functions — a plain constant
 * export there invalidates the entire module as a server-actions file ("no
 * exports at all"). Both the server action and the server-side context reader
 * need this name, so it lives here where either can import it.
 */
export const ACTIVE_BRAND_COOKIE = "signal_brand";
