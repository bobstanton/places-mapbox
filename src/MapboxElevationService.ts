import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { Meters, meters } from "places-shared/units";
import { Coordinate, DEG_TO_RAD } from "places-shared/geo";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { ElevationServiceBase, FixedIntervalRateLimiter, formatProviderApiError } from "places-shared/services";
import { logger } from "places-shared/utils";

const TILEQUERY_FALLBACK_INTERVAL_MS = 120;

class TerrainTileDecodeError extends Error {
  constructor(cause: unknown) {
    super('Mapbox terrain tile could not be decoded in this runtime');
    this.name = 'TerrainTileDecodeError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class MapboxElevationService extends ElevationServiceBase {
  private readonly tilequeryFallbackLimiter = new FixedIntervalRateLimiter(TILEQUERY_FALLBACK_INTERVAL_MS);

  constructor(extensionSettings: IPlaceExtensionSettings) {
    super(extensionSettings);
  }

  protected async getElevationForPoints(coordinates: Coordinate[]): Promise<Meters[]> {
    if (coordinates.length === 0) {
      return [];
    }

    try {
      const zoom = 13;
      const tileGroups = this.groupCoordinatesByTile(coordinates, zoom);

      const tileEntries = await Promise.all(
        Array.from(tileGroups.keys(), async (tileKey): Promise<[string, ImageData]> => {
          const [z, x, y] = tileKey.split(',').map(Number);

          return [tileKey, await this.downloadTerrainTile(z, x, y)];
        })
      );
      const tileDataMap = new Map(tileEntries);

      const elevations: Meters[] = new Array<Meters>(coordinates.length);

      for (const [tileKey, pointsInTile] of tileGroups) {
        const tileData = tileDataMap.get(tileKey);

        if (!tileData) {
          continue;
        }

        const [z, x, y] = tileKey.split(',').map(Number);

        for (const point of pointsInTile) {
          const elevation = this.extractElevationFromTile(tileData, point.lat, point.lng, z, x, y);

          elevations[point.originalIndex] = meters(elevation);
        }
      }

      return elevations;
    } catch (error) {
      if (!(error instanceof TerrainTileDecodeError)) throw error;
      logger.scope('Places').error("Mapbox terrain-DEM elevation error, falling back to Tilequery:", error);

      return this.getElevationForPointsFallback(coordinates);
    }
  }

  private async getElevationForPointsFallback(coordinates: Coordinate[]): Promise<Meters[]> {
    const elevations: Meters[] = [];

    for (const { latitude: lat, longitude: lng } of coordinates) {
      await this.tilequeryFallbackLimiter.wait();
      const elevation = await this.getElevationFromTilequery(lat, lng);

      elevations.push(meters(elevation));
    }

    return elevations;
  }

  private async downloadTerrainTile(z: number, x: number, y: number): Promise<ImageData> {
    const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${z}/${x}/${y}@2x.pngraw?access_token=${this.extensionSettings.apiKey}`;

    const response = await requestUrl({ url });

    if (response.status >= 400) {
      throw new Error(formatProviderApiError({ provider: "Mapbox", operation: "terrain tile", status: response.status, text: response.text }));
    }

    const blob = new Blob([response.arrayBuffer], { type: 'image/png' });

    try {
      return await this.blobToImageData(blob);
    } catch (error) {
      throw new TerrainTileDecodeError(error);
    }
  }

  private async blobToImageData(blob: Blob): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = createEl('canvas');

        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));

          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        resolve(imageData);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  private extractElevationFromTile(tileData: ImageData, lat: number, lng: number, z: number, tileX: number, tileY: number): number {
    const n = Math.pow(2, z);

    const latRad = lat * DEG_TO_RAD;
    const xTilePos = ((lng + 180) / 360) * n - tileX;
    const yTilePos = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - tileY;

    const pixelX = Math.floor(xTilePos * tileData.width);
    const pixelY = Math.floor(yTilePos * tileData.height);

    if (pixelX < 0 || pixelX >= tileData.width || pixelY < 0 || pixelY >= tileData.height) {
      return 0;
    }

    const index = (pixelY * tileData.width + pixelX) * 4;
    const r = tileData.data[index];
    const g = tileData.data[index + 1];
    const b = tileData.data[index + 2];

    const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);

    return elevation;
  }

  private groupCoordinatesByTile(coordinates: Coordinate[], zoom: number = 13): Map<string, Array<{lat: number, lng: number, originalIndex: number, tileX: number, tileY: number}>> {
    const tileGroups = new Map<string, Array<{lat: number, lng: number, originalIndex: number, tileX: number, tileY: number}>>();

    coordinates.forEach((coord, index) => {
      const lat = coord.latitude;
      const lng = coord.longitude;
      const { x, y } = this.latLngToTile(lat, lng, zoom);
      const tileKey = `${zoom},${x},${y}`;

      if (!tileGroups.has(tileKey)) {
        tileGroups.set(tileKey, []);
      }

      tileGroups.get(tileKey)?.push({
        lat,
        lng,
        originalIndex: index,
        tileX: x,
        tileY: y
      });
    });

    return tileGroups;
  }

  private latLngToTile(lat: number, lng: number, zoom: number): {x: number, y: number} {
    const n = Math.pow(2, zoom);
    const latRad = lat * DEG_TO_RAD;
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

    return { x, y };
  }

  private async getElevationFromTilequery(lat: number, lng: number): Promise<number> {
    const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lng},${lat}.json?access_token=${this.extensionSettings.apiKey}`;

    const response = await requestUrl({ url });

    if (response.status >= 400) {
      throw new Error(formatProviderApiError({ provider: "Mapbox", operation: "tile query", status: response.status, json: response.json, text: response.text }));
    }

    const data: unknown = response.json;
    const features: unknown = typeof data === 'object' && data !== null && 'features' in data ? data.features : undefined;
    const contourElevations: number[] = Array.isArray(features)
      ? features
          .map((feature: unknown) => {
            if (typeof feature !== 'object' || feature === null || !('properties' in feature)) return undefined;
            const properties: unknown = feature.properties;

            return typeof properties === 'object' && properties !== null && 'ele' in properties
              ? properties.ele
              : undefined;
          })
          .filter((ele: unknown): ele is number => typeof ele === 'number')
      : [];

    // Terrain v2 has no contour features at or below sea level.
    return contourElevations.length > 0 ? Math.max(...contourElevations) : 0;
  }

  getProviderName(): string {
    return "mapbox";
  }

  protected getProviderDisplayName(): string {
    return "Mapbox";
  }
}
