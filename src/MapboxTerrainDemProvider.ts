import { IPlaceExtensionSettings } from "places-shared/settings";
import { ITerrainDemProvider } from "places-shared/services";
import { TerrainDemSpec } from "places-shared/map";

// The raw tile URL (rather than the `mapbox://` protocol) resolves on any
// MapLibre or Mapbox GL engine, not only mapbox-gl.
export class MapboxTerrainDemProvider implements ITerrainDemProvider {
  constructor(private readonly extensionSettings: IPlaceExtensionSettings) {}

  getDemSource(): TerrainDemSpec | null {
    const token = this.extensionSettings.apiKey;
    if (!token) return null;
    return {
      tiles: [`https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}@2x.pngraw?access_token=${token}`],
      encoding: 'mapbox',
      tileSize: 512,
      maxzoom: 14,
    };
  }
}
