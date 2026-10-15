// Connect Pro Fleet — VehicleFile type (extracted from types.ts so that file
// stays under the line limit). Re-exported from types.ts for compatibility.

export interface VehicleFile {
  name: string;
  url: string; // object URL (mock) or storage path when wired to Supabase
  size: number;
  type: string;
}
