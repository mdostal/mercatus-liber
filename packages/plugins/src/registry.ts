import type { Plugin, PluginContext, PluginRegistry } from "./types.js";

export function createPluginRegistry(): PluginRegistry {
  const plugins: Plugin[] = [];

  return {
    register(plugin) {
      plugins.push(plugin);
    },

    list() {
      return [...plugins];
    },

    async initAll(ctx: PluginContext) {
      for (const plugin of plugins) {
        try {
          await plugin.init(ctx);
        } catch {
          // Best-effort by design -- a broken plugin must never take the
          // whole framework down. A real deployment would log this; this
          // reference registry deliberately swallows it (see docs/subsystems/
          // 12-plugins-extensibility.md open question 2 on trust model).
        }
      }
    },
  };
}
