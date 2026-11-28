export function publicDb(): never {
  throw new Error("Server database client is unavailable in static demo mode.");
}
