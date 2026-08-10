import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { Coordinate } from "places-shared/geo";
import type { SnapPoint } from "places-shared/services";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { ISnapService, SnapRequest, SnapResult, SnappedPoint, executeRateLimited, formatProviderApiError, formatProviderResponseShapeError, mapTravelMode, toSnappedPoint, describeUnsupportedSnapOptions, shouldSendTimestamps, toMatchedGeometry } from "places-shared/services";

const MAPBOX_MATCHING_PROFILES = { walk: "walking", bike: "cycling", drive: "driving" } as const;
import { mapboxRateLimits } from "./MapboxRateLimits";

interface MapboxTracepoint {
  location?: number[];
}

export class MapboxSnapService implements ISnapService {
  constructor(private extensionSettings: IPlaceExtensionSettings) {}

  getProviderName(): string {
    return "mapbox";
  }

  describeUnsupportedRequest(request: SnapRequest): string[] {
    return describeUnsupportedSnapOptions("Mapbox", request, { timestamps: true, tidy: true, exclude: true });
  }

  async snapPoints(request: SnapRequest): Promise<SnapResult> {
    const snapped: SnappedPoint[] = [];
    const geometry: Coordinate[] = [];
    const batchSize = 100; // Map Matching API coordinate limit per request

    for (let i = 0; i < request.points.length; i += batchSize) {
      const batch = request.points.slice(i, i + batchSize);
      const result = await this.snapBatch(batch, request);
      snapped.push(...result.points);
      // Batches are consecutive stretches of one track, and their matched
      // geometries concatenate into a single path.
      if (result.geometry) geometry.push(...result.geometry);
    }

    return { points: snapped, geometry: geometry.length > 0 ? geometry : undefined };
  }

  private async snapBatch(batch: SnapPoint[], request: SnapRequest): Promise<SnapResult> {
    const coordinates = batch.map((point) => `${point.longitude},${point.latitude}`).join(";");
    const params = new URLSearchParams({
      access_token: this.extensionSettings.apiKey ?? "",
      geometries: "geojson",
      overview: "false",
      steps: "false",
    });
    if (request.radiusMeters !== undefined) {
      params.set("radiuses", batch.map(() => String(request.radiusMeters)).join(";"));
    }
    // Unix seconds, one per coordinate. Elapsed time between fixes is what
    // stops the matcher jumping to a parallel way it could not have reached.
    if (shouldSendTimestamps(request) && batch.every((point) => point.time)) {
      params.set("timestamps", batch.map((point) => String(Math.round((point.time as Date).getTime() / 1000))).join(";"));
    }
    if (request.tidy) params.set("tidy", "true");
    if (request.exclude?.length) params.set("exclude", request.exclude.join(","));

    const response = await executeRateLimited(mapboxRateLimits, "snap", () => requestUrl({
      url: `https://api.mapbox.com/matching/v5/mapbox/${mapTravelMode(request.mode, MAPBOX_MATCHING_PROFILES)}/${coordinates}?${String(params)}`,
      throw: false,
    }));

    if (response.status >= 400) {
      throw new Error(formatProviderApiError({
        provider: "Mapbox",
        operation: "map matching",
        status: response.status,
        json: response.json,
        text: response.text,
        requestSummary: `${request.mode}, ${batch.length} points${request.radiusMeters !== undefined ? `, radius ${request.radiusMeters}m` : ""}`,
      }));
    }

    // Map Matching answers a refused match with HTTP 200 and a non-Ok `code`
    // plus a `message`.
    const tracepoints = (response.json as { tracepoints?: Array<MapboxTracepoint | null> } | undefined)?.tracepoints;
    if (!Array.isArray(tracepoints) || tracepoints.length !== batch.length) {
      throw new Error(formatProviderResponseShapeError({
        provider: "Mapbox",
        operation: "map matching",
        expected: "tracepoints",
        expectedCount: batch.length,
        receivedCount: Array.isArray(tracepoints) ? tracepoints.length : 0,
        json: response.json,
        text: response.text,
        requestSummary: `${request.mode}, ${batch.length} points`,
      }));
    }

    const matchings = (response.json as { matchings?: Array<{ geometry?: { coordinates?: unknown } }> }).matchings;
    return {
      points: tracepoints.map((tracepoint, index) => toSnappedPoint(tracepoint?.location, batch[index])),
      geometry: toMatchedGeometry(matchings?.[0]?.geometry?.coordinates),
    };
  }
}
