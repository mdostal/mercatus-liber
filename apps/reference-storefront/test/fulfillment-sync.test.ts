import { describe, expect, it } from "vitest";
import { runX3dSync } from "../lib/fulfillment-sync";

// Made up for this test and joined at runtime so secret scanners do not read it as a real secret.
const SECRET = ["sync", "made-up-test-secret"].join("_");
const poll = async () => ({ checked: 3, published: 1, failed: [{ code: "X3D-AAAAA1", error: new Error("timeout") }] });

describe("runX3dSync", () => {
  it("runs the poll for the right secret and reports counts only", async () => {
    expect(await runX3dSync(poll, SECRET, `Bearer ${SECRET}`)).toEqual({ status: 200, body: { checked: 3, published: 1, failed: 1 } });
  });

  it("refuses a wrong, missing or differently-sized secret without polling", async () => {
    let polled = 0;
    const counting = async () => {
      polled += 1;
      return { checked: 0, published: 0, failed: [] };
    };
    for (const header of [null, "Bearer nope", `Bearer ${SECRET}x`, SECRET, "Bearer "]) expect((await runX3dSync(counting, SECRET, header)).status).toBe(401);
    expect(polled).toBe(0);
  });

  it("answers 404 when X3D is not configured or no secret is set", async () => {
    expect((await runX3dSync(null, SECRET, `Bearer ${SECRET}`)).status).toBe(404);
    expect((await runX3dSync(poll, undefined, "Bearer ")).status).toBe(404);
    expect((await runX3dSync(poll, "", "Bearer ")).status).toBe(404);
  });
});
