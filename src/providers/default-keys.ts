// Hardcoded fallback API keys. Used when the user has not configured a
// per-provider key via SecretStorage.
//
// WARNING: Anything in this file is shipped in the .vsix and trivially
// extractable. Do not put production or revenue-generating keys here.
// Use only throwaway / shared-quota keys you are willing to see ban-hammered
// the moment the extension gets traction.

import { ProviderId } from "../models/config";

const DEFAULT_KEYS: Partial<Record<ProviderId, string>> = {
  mistral: "CSnnmuIno3tSydFozR72Cukc1TCwTIvH",
};

export function defaultKeyFor(provider: ProviderId): string | undefined {
  return DEFAULT_KEYS[provider];
}

export function hasDefaultKey(provider: ProviderId): boolean {
  return Boolean(DEFAULT_KEYS[provider]);
}
