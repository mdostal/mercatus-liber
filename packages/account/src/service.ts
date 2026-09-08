import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import { CustomerNotFoundError } from "./types.js";
import type {
  ActivityEntry,
  CustomerProfile,
  CustomerProfileRepository,
  OrderLookup,
  OrderSummary,
} from "./types.js";

export interface NewProfileInput {
  email: string;
  name: string;
}

export interface AccountService {
  createProfile(input: NewProfileInput): Promise<CustomerProfile>;
  getProfile(id: string): Promise<CustomerProfile | null>;
  getProfileByEmail(email: string): Promise<CustomerProfile | null>;
  updateProfile(id: string, patch: Partial<Pick<CustomerProfile, "name" | "email">>): Promise<CustomerProfile>;
  listOrders(customerId: string): Promise<OrderSummary[]>;
  listRecentActivity(customerId: string): Promise<ActivityEntry[]>;
}

export function createAccountService(deps: {
  profiles: CustomerProfileRepository;
  orders: OrderLookup;
  events: EventBus;
}): AccountService {
  const { profiles, orders, events } = deps;

  // Per-process activity log, keyed by customerId. A durable adapter is a
  // documented future addition (same "default in-memory, adapter-swappable
  // later" pattern used across this project) -- not required for the
  // reference implementation.
  const activityByCustomer = new Map<string, ActivityEntry[]>();

  // React to async order-status changes -- never a direct call from
  // checkout-orders, which has zero knowledge that accounts exist.
  events.subscribe<{ orderId: string }>("checkout.order.paid", async ({ orderId }) => {
    const order = await orders.getOrder(orderId);
    if (!order || !order.customerId) return; // guest order -- nothing to attribute this to
    const entry: ActivityEntry = { orderId, status: "paid", at: new Date().toISOString() };
    const existing = activityByCustomer.get(order.customerId) ?? [];
    activityByCustomer.set(order.customerId, [...existing, entry]);
  });

  async function requireProfile(id: string): Promise<CustomerProfile> {
    const profile = await profiles.get(id);
    if (!profile) throw new CustomerNotFoundError(id);
    return profile;
  }

  return {
    async createProfile(input) {
      const profile: CustomerProfile = { id: randomUUID(), email: input.email, name: input.name };
      await profiles.save(profile);
      return profile;
    },

    async getProfile(id) {
      return profiles.get(id);
    },

    async getProfileByEmail(email) {
      return profiles.getByEmail(email);
    },

    async updateProfile(id, patch) {
      const existing = await requireProfile(id);
      const updated: CustomerProfile = { ...existing, ...patch };
      await profiles.save(updated);
      return updated;
    },

    async listOrders(customerId) {
      const found = await orders.listOrdersByCustomer(customerId);
      return found.map((order) => ({
        id: order.id,
        status: order.status,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      }));
    },

    async listRecentActivity(customerId) {
      return activityByCustomer.get(customerId) ?? [];
    },
  };
}
