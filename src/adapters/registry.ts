import "server-only";

import { isMockMode } from "@/lib/env";
import type { Platform } from "@/types";

import { createMockAdapter } from "./mock";
import { facebookAdapter } from "./meta-facebook";
import { instagramAdapter } from "./meta-instagram";
import type { PlatformAdapter } from "./types";

/**
 * Adapter registry — the only place the app decides which implementation to use.
 *
 * Every engine resolves adapters through here, so flipping USE_MOCK_ADAPTERS
 * swaps the entire platform layer with no other code change. Adding a platform
 * means writing one adapter and adding one line here.
 */

const mockCache = new Map<Platform, PlatformAdapter>();

export function getAdapter(platform: Platform): PlatformAdapter {
  if (isMockMode()) {
    // Cached so a mock adapter is a stable object identity, matching how the
    // real adapters behave as module singletons.
    let mock = mockCache.get(platform);
    if (!mock) {
      mock = createMockAdapter(platform);
      mockCache.set(platform, mock);
    }
    return mock;
  }

  switch (platform) {
    case "fb":
      return facebookAdapter;
    case "ig":
      return instagramAdapter;
    default: {
      // Exhaustiveness guard: adding a Platform without an adapter becomes a
      // compile error here rather than a runtime surprise in the publish cron.
      const never: never = platform;
      throw new Error(`No adapter registered for platform: ${String(never)}`);
    }
  }
}

/** Every platform Signal can connect. Drives the "Connect account" UI. */
export const SUPPORTED_PLATFORMS: readonly Platform[] = ["fb", "ig"];
