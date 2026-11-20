import { describe, expect, it } from "vitest";
import { normalizePostalAddress, REGION_COUNTRIES, regionForProvider, regionsOf, resolveRegion, UnresolvedRegionError } from "../src/index.js";

describe("resolveRegion", () => {
  it("matches a code, a name, an ISO 3166-2 form and common other names", () => {
    expect(resolveRegion("US", "Nebraska")).toEqual({ code: "NE", name: "Nebraska" });
    expect(resolveRegion("us", " ne ")).toEqual({ code: "NE", name: "Nebraska" });
    expect(resolveRegion("US", "US-NE")?.code).toBe("NE");
    expect(resolveRegion("US", "new  york")?.code).toBe("NY");
    expect(resolveRegion("US", "Washington, D.C.")?.code).toBe("DC");
    expect(resolveRegion("US", "Puerto Rico")?.code).toBe("PR");
    expect(resolveRegion("US", "Guam")?.code).toBe("GU");
    expect(resolveRegion("US", "AE")?.name).toBe("Armed Forces");
    expect(resolveRegion("CA", "Québec")?.code).toBe("QC");
    expect(resolveRegion("CA", "quebec")?.code).toBe("QC");
    expect(resolveRegion("CA", "PEI")?.code).toBe("PE");
    expect(resolveRegion("AU", "New South Wales")?.code).toBe("NSW");
    expect(resolveRegion("BR", "Sao Paulo")?.code).toBe("SP");
    expect(resolveRegion("JP", "Tokyo-to")?.code).toBe("13");
    expect(resolveRegion("JP", "1")?.name).toBe("Hokkaido");
  });

  it("returns null for no match, an empty region, or a country without a list", () => {
    expect(resolveRegion("US", "Narnia")).toBeNull();
    expect(resolveRegion("US", "")).toBeNull();
    expect(resolveRegion("US", undefined)).toBeNull();
    expect(resolveRegion("GB", "Kent")).toBeNull();
  });

  it("has every US state, DC and the territories", () => {
    const us = regionsOf("US")!;
    expect(us).toHaveLength(62);
    for (const code of ["DC", "PR", "GU", "VI", "AS", "MP"]) expect(us.some((r) => r.code === code)).toBe(true);
    expect(regionsOf("CA")).toHaveLength(13);
    expect(REGION_COUNTRIES).toEqual(["AU", "BR", "CA", "JP", "US"]);
    expect(regionsOf("GB")).toBeNull();
  });
});

describe("regionForProvider", () => {
  const options = { codesFor: ["US", "CA"], provider: "Acme" };
  it("sends the code where the provider wants codes, and the input elsewhere", () => {
    expect(regionForProvider("US", "Nebraska", options)).toBe("NE");
    expect(regionForProvider("GB", " Kent ", options)).toBe("Kent");
    expect(regionForProvider("GB", "", options)).toBeUndefined();
  });
  it("throws a named error when a code is needed and can't be found", () => {
    expect(() => regionForProvider("US", "Nebrasca", options)).toThrow(UnresolvedRegionError);
    expect(() => regionForProvider("US", "Nebrasca", options)).toThrow(/"Nebrasca" is not a state.*Acme needs its code/);
    expect(() => regionForProvider("CA", undefined, options)).toThrow(/no state, province or territory/);
  });
});

describe("normalizePostalAddress", () => {
  it("fills the missing form of the region and upper-cases the country", () => {
    const base = { line1: "1 Main St", city: "Omaha", postalCode: "68102" };
    expect(normalizePostalAddress({ ...base, regionName: "Nebraska", countryCode: "us" })).toMatchObject({ regionCode: "NE", regionName: "Nebraska", countryCode: "US" });
    expect(normalizePostalAddress({ ...base, regionCode: "NE", countryCode: "US" }).regionName).toBe("Nebraska");
    expect(normalizePostalAddress({ ...base, regionName: "Kent", countryCode: "GB" })).toEqual({ ...base, regionName: "Kent", countryCode: "GB" });
  });
});
