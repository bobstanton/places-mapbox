import { ProviderRateLimitTracker } from "places-shared/services";

// Shared by the Mapbox directions/isochrone services; the tile query service
// keeps its own queue.
export const mapboxRateLimits = new ProviderRateLimitTracker();
