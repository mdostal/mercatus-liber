import { describe, expect, it } from "vitest";
import { createSlant3dHttpClient, Slant3dApiError } from "../src/index.js";
import { fakeFetch, ok } from "./fake-fetch.js";

const ORDER = { publicId: "SLANT_1", status: "SUBMITTED", items: [{ type: "PRINT", SKU: "sku-1" }] };

describe("createSlant3dHttpClient", () => {
  it("sends the API key as a Bearer token to Slant's v2 base URL", async () => {
    const { fetchImpl, calls } = fakeFetch({ "GET /orders/SLANT_1": ok(ORDER) });
    await createSlant3dHttpClient({ apiKey: "sl-test", fetchImpl }).getOrder("SLANT_1");
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/orders/SLANT_1");
    expect(calls[0]?.headers.Authorization).toBe("Bearer sl-test");
  });

  it("reads an order returned directly as data (docs) or wrapped as data.order (spec)", async () => {
    const direct = fakeFetch({ "GET /orders/SLANT_1": ok(ORDER) });
    const wrapped = fakeFetch({ "GET /orders/SLANT_1": ok({ order: ORDER }) });
    expect((await createSlant3dHttpClient({ apiKey: "k", fetchImpl: direct.fetchImpl }).getOrder("SLANT_1"))?.publicId).toBe("SLANT_1");
    expect((await createSlant3dHttpClient({ apiKey: "k", fetchImpl: wrapped.fetchImpl }).getOrder("SLANT_1"))?.items).toHaveLength(1);
  });

  it("reads a draft whose items sit beside the order, and its totals", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders": ok({ order: { publicId: "SLANT_2", status: "DRAFT" }, items: [{ type: "PRINT" }, { type: "PRINT" }], totals: { printingCost: 12.72, deliveryCost: 4.79, totalCost: 17.51 } }, 201) });
    const draft = await createSlant3dHttpClient({ apiKey: "k", fetchImpl }).draftOrder({ platformId: "p", customer: { details: { email: "a@example.com", address: { name: "A", line1: "1", city: "C", state: "IL", zip: "6", country: "US" } } }, items: [] });
    expect(draft.order.items).toHaveLength(2);
    expect(draft.totals?.totalCost).toBe(17.51);
  });

  it("returns null for an order Slant doesn't have", async () => {
    const { fetchImpl } = fakeFetch({ "GET /orders/SLANT_X": { status: 404, json: { success: false, message: "Order not found" } } });
    expect(await createSlant3dHttpClient({ apiKey: "k", fetchImpl }).getOrder("SLANT_X")).toBeNull();
  });

  it("carries the status and Slant's message on an error", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders/SLANT_1": { status: 401, json: { success: false, message: "Order belongs to another creator", error: "UNAUTHORIZED" } } });
    const error = await createSlant3dHttpClient({ apiKey: "k", fetchImpl }).processOrder("SLANT_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Slant3dApiError);
    expect(error).toMatchObject({ status: 401, method: "POST", path: "/orders/SLANT_1", slantMessage: "Order belongs to another creator -- UNAUTHORIZED" });
    expect((error as Error).message).toContain("HTTP 401: Order belongs to another creator");
  });

  it("reads the nested error shape the filament filter returns", async () => {
    const { fetchImpl, calls } = fakeFetch({ "GET /filaments?profile=ABS": { status: 400, json: { success: false, error: { message: "Unapproved Profile Passed in Filter Options", statusCode: 400 } } } });
    await expect(createSlant3dHttpClient({ apiKey: "k", fetchImpl }).listFilaments({ profile: ["ABS"] })).rejects.toMatchObject({ status: 400, slantMessage: "Unapproved Profile Passed in Filter Options" });
    expect(calls).toHaveLength(1);
  });

  it("treats a 2xx carrying success: false as a failure", async () => {
    const { fetchImpl } = fakeFetch({ "DELETE /orders/SLANT_1": { status: 200, json: { success: false, message: "Order already printing" } } });
    await expect(createSlant3dHttpClient({ apiKey: "k", fetchImpl }).cancelOrder("SLANT_1")).rejects.toMatchObject({ status: 200, slantMessage: "Order already printing" });
  });

  it("keeps a non-JSON error body as the message", async () => {
    const { fetchImpl } = fakeFetch({ "GET /platforms": { status: 502, text: "Bad Gateway" } });
    await expect(createSlant3dHttpClient({ apiKey: "k", fetchImpl }).listPlatforms()).rejects.toMatchObject({ status: 502, slantMessage: "Bad Gateway" });
  });

  it("throws for a 404 where nothing sensible can be returned", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders/SLANT_X": { status: 404, json: { success: false, message: "Order not found" } } });
    await expect(createSlant3dHttpClient({ apiKey: "k", fetchImpl }).processOrder("SLANT_X")).rejects.toMatchObject({ status: 404, slantMessage: "Order not found" });
  });

  it("joins several filter values with commas", async () => {
    const { fetchImpl, calls } = fakeFetch({ "GET /filaments?profile=PLA%2CPETG&color=red": ok([]) });
    expect(await createSlant3dHttpClient({ apiKey: "k", fetchImpl }).listFilaments({ profile: ["PLA", "PETG"], color: ["red"] })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
