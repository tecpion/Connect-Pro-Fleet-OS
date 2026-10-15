// VIN decode via a free public API (NHTSA vPIC). Falls back gracefully.
// In production this would run server-side; here it runs from the browser.

export interface VinDecodeResult {
  make?: string;
  model?: string;
  year?: number;
  error?: string;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) return { error: "VIN must be 17 characters." };
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${clean}?format=json`,
    );
    if (!res.ok) return { error: "Lookup service unavailable." };
    const data = await res.json();
    const get = (name: string) =>
      data.Results?.find((r: { Variable: string }) => r.Variable === name)
        ?.Value;
    const make = get("Make");
    const model = get("Model");
    const year = get("Model Year");
    if (!make && !model) return { error: "No match for this VIN." };
    return {
      make: make || undefined,
      model: model || undefined,
      year: year ? Number(year) : undefined,
    };
  } catch {
    return { error: "Could not reach the VIN lookup service." };
  }
}
