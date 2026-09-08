import type { EventBus } from "@mercatus-liber/core";

/** The entire default surface a plugin gets -- core types (implicitly, via whatever event payloads carry) plus the event bus. Nothing else. */
export interface PluginContext {
  events: EventBus;
}

export interface Plugin {
  name: string;
  init(ctx: PluginContext): void | Promise<void>;
}

export interface PluginRegistry {
  register(plugin: Plugin): void;
  list(): Plugin[];
  /** Best-effort: one plugin's init failure never prevents another plugin from initializing. */
  initAll(ctx: PluginContext): Promise<void>;
}
