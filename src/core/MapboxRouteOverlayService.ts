import type * as GeoJSON from "geojson";
import type { ProviderSettings, RouteHttpClient } from "places-shared/services";
import { mapboxRateLimits } from "./MapboxRateLimits";
import { type DirectionsOverlayRequest, type IsochroneOverlayRequest, type RouteOverlayCapabilities, type RouteOverlayService, type RouteTravelMode, appendDirectionsRouteFeatures, assertProviderApiKey, mapTravelMode, buildDirectionsRouteFeature, formatIsochroneFeatureName, decorateIsochroneFeatureProperties, executeRateLimited, formatProviderApiError, getIsochroneStyleColors, buildRouteLegMetrics, formatRouteDistance } from "places-shared/services";
import { logger } from "places-shared/utils";

export class MapboxRouteOverlayService implements RouteOverlayService {
  constructor(private extensionSettings: ProviderSettings, private readonly http: RouteHttpClient) {}

  getProviderName(): string {
    return "mapbox";
  }

  getCapabilities(): RouteOverlayCapabilities {
    return {
      routeOptimization: true,
      distanceIsochrones: true,
      polygonIsochrones: true,
      trafficIsochrones: true,
      trafficDirections: true,
    };
  }

  async getDirectionsOverlay(request: DirectionsOverlayRequest): Promise<GeoJSON.FeatureCollection> {
    assertProviderApiKey(this.extensionSettings.apiKey, "Mapbox");
    const features: GeoJSON.Feature[] = [];

    for (let index = 0; index < request.routes.length; index++) {
      const route = request.routes[index];

      if (route.length < 2) continue;

      const coordinates = route.map((point) => `${point.longitude},${point.latitude}`).join(";");
      const params = new URLSearchParams({
        access_token: this.extensionSettings.apiKey ?? "",
        geometries: "geojson",
        overview: "full",
        steps: "false",
      });

      if (request.optimize) {
        params.set("source", "first");
        params.set("destination", "last");
        params.set("roundtrip", "false");
      }

      const response = await executeRateLimited(mapboxRateLimits, "directions", () => this.http({
        url: `https://api.mapbox.com/${request.optimize ? "optimized-trips/v1" : "directions/v5"}/${this.toMapboxProfile(request.mode, request.traffic)}/${coordinates}?${String(params)}`,
      }));

      if (response.status >= 400) {
        throw new Error(formatProviderApiError({
          provider: "Mapbox",
          operation: request.optimize ? "optimized route" : "directions",
          status: response.status,
          json: response.json,
          text: response.text,
          requestSummary: `${request.mode}, ${route.length} waypoint${route.length === 1 ? "" : "s"}`,
        }));
      }

      const data = response.json as {
        code?: string;
        message?: string;
        routes?: Array<{ geometry?: GeoJSON.LineString; distance?: number; duration?: number; legs?: Array<{ distance?: number; duration?: number }> }>;
        trips?: Array<{ geometry?: GeoJSON.LineString; distance?: number; duration?: number; legs?: Array<{ distance?: number; duration?: number }> }>;
        waypoints?: Array<{ waypoint_index?: number }>;
      };

      if (data.code && data.code !== "Ok") {
        throw new Error(`Mapbox ${request.optimize ? "Optimization" : "Directions"} API error: ${data.code}${data.message ? `: ${data.message}` : ""}`);
      }

      const bestRoute = (request.optimize ? data.trips?.[0] : data.routes?.[0]);

      if (!bestRoute?.geometry) continue;

      const orderedRoute = request.optimize ? getMapboxOptimizedRoute(route, data.waypoints) : route;
      const legs = buildRouteLegMetrics(orderedRoute, (bestRoute.legs ?? []).map(leg => ({
        distanceMeters: Number(leg.distance ?? 0),
        durationSeconds: Number(leg.duration ?? 0),
      })), request.units);

      await appendDirectionsRouteFeatures(features, buildDirectionsRouteFeature({
        request,
        provider: "mapbox",
        routeIndex: index,
        route: orderedRoute,
        geometry: bestRoute.geometry,
        optimized: request.optimize === true,
        distanceMeters: bestRoute.distance ?? 0,
        durationSeconds: bestRoute.duration ?? 0,
        legs,
      }), request);
    }

    return { type: "FeatureCollection", features };
  }

  async getIsochroneOverlay(request: IsochroneOverlayRequest): Promise<GeoJSON.FeatureCollection> {
    assertProviderApiKey(this.extensionSettings.apiKey, "Mapbox");
    const features: GeoJSON.Feature[] = [];

    for (const center of request.centers) {
      const ranges = request.ranges.slice(0, 4).map((range) => Math.round(range));
      const colors = getIsochroneStyleColors(ranges.length, request.style);
      const params = new URLSearchParams({
        access_token: this.extensionSettings.apiKey ?? "",
        polygons: String(request.polygons),
        [request.rangeType === "time" ? "contours_minutes" : "contours_meters"]: ranges.join(","),
        contours_colors: colors.map((color) => color.replace(/^#/, "")).join(","),
      });

      const response = await executeRateLimited(mapboxRateLimits, "isochrones", () => this.http({
        url: `https://api.mapbox.com/isochrone/v1/${this.toMapboxProfile(request.mode, request.traffic)}/${center.longitude},${center.latitude}?${String(params)}`,
      }));

      if (response.status >= 400) {
        const errorDetails: unknown = response.json;

        logger.scope("RouteOverlays").warn("Mapbox isochrone rejected", {
          status: response.status,
          mode: request.mode,
          rangeType: request.rangeType,
          ranges,
          center: {
            name: center.name,
            latitude: center.latitude,
            longitude: center.longitude,
          },
          details: errorDetails ?? response.text,
        });

        throw new Error(formatProviderApiError({
          provider: "Mapbox",
          operation: "isochrone",
          status: response.status,
          json: response.json,
          text: response.text,
          requestSummary: `${request.mode}, ${request.rangeType} ranges ${ranges.join(", ")}`,
        }));
      }

      const collection = response.json as GeoJSON.FeatureCollection;

      for (const feature of collection.features ?? []) {
        const contour = Number(feature.properties?.contour);
        const color = `#${String(feature.properties?.color ?? colors[0]).replace(/^#/, "")}`;

        features.push({
          ...feature,
          properties: decorateIsochroneFeatureProperties({
            ...(feature.properties ?? {}),
            name: formatIsochroneFeatureName(request.name ?? center.name, request.mode, request.rangeType === "time" ? `${contour} min` : formatRouteDistance(contour, request.units)),
            provider: "mapbox",
            mode: request.mode,
            metric: request.rangeType,
          }, color, request.style),
        });
      }
    }

    return { type: "FeatureCollection", features };
  }

  private toMapboxProfile(mode: RouteTravelMode, traffic?: boolean): string {
    return mapTravelMode(mode, { walk: "mapbox/walking", bike: "mapbox/cycling", drive: traffic ? "mapbox/driving-traffic" : "mapbox/driving" });
  }
}

function getMapboxOptimizedRoute(route: DirectionsOverlayRequest["routes"][number], waypoints: Array<{ waypoint_index?: number }> | undefined): DirectionsOverlayRequest["routes"][number] {
  if (!waypoints || waypoints.length !== route.length) {
    return route;
  }

  return route
    .map((point, inputIndex) => ({ point, order: waypoints[inputIndex]?.waypoint_index ?? inputIndex }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.point);
}
