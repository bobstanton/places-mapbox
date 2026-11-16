import { IPlaceExtensionSettings } from "places-shared/settings";
import { ITerrainDemProvider } from "places-shared/services";
import { TerrainDemSpec } from "places-shared/map";
import { mapboxDemSource } from "places-mapbox/core";

export class MapboxTerrainDemProvider implements ITerrainDemProvider {
  constructor(private readonly extensionSettings: IPlaceExtensionSettings) {}

  getDemSource(): TerrainDemSpec | null {
    return mapboxDemSource(this.extensionSettings.apiKey ?? '');
  }
}
