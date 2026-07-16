"use server";

import { cookies } from "next/headers";

import { requireBrandAccess } from "@/lib/auth/dal";

import { ACTIVE_BRAND_COOKIE } from "./brand-cookie";

/**
 * Persist the active brand.
 *
 * Server actions are public HTTP endpoints — anyone can POST here with any
 * brandId. `requireBrandAccess` resolves the brand's real workspace and checks
 * membership, so a caller cannot pin a brand they can't see and have subsequent
 * pages render its data.
 *
 * httpOnly: the cookie is read server-side to scope every render; no client code
 * needs it, so nothing is gained by exposing it to JS.
 */
export async function setActiveBrand(brandId: string): Promise<void> {
  await requireBrandAccess(brandId);

  const store = await cookies();
  store.set(ACTIVE_BRAND_COOKIE, brandId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
