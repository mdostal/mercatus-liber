import type { CustomerProfile, CustomerProfileRepository } from "./types.js";

export function createInMemoryCustomerProfileRepository(): CustomerProfileRepository {
  const profiles = new Map<string, CustomerProfile>();
  return {
    async get(id) {
      const profile = profiles.get(id);
      return profile ? structuredClone(profile) : null;
    },
    async getByEmail(email) {
      for (const profile of profiles.values()) {
        if (profile.email === email) return structuredClone(profile);
      }
      return null;
    },
    async save(profile) {
      profiles.set(profile.id, structuredClone(profile));
    },
  };
}
