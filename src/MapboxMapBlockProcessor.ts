import { App } from "obsidian";
import { type UnitsSystem } from "places-shared/units";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { MapLibreProviderBase, setGlRuntime, type MapGlRuntime } from "places-maplibre-base";
import mapboxgl from "mapbox-gl";
import { getMapboxStyleUrl, MAPBOX_STYLES } from "./MapboxStyles";

// MapLibreProviderBase drives a mapbox-gl map through the injected GL runtime;
// the two engines share their Map/Marker/Popup APIs (maplibre forked mapbox-gl v1).
//
// mapbox-gl has no addProtocol: the Places tile cache stays unsupported.
export class MapboxMapBlockProcessor extends MapLibreProviderBase {
  constructor(app: App, extensionSettings: IPlaceExtensionSettings, units: UnitsSystem, developerMode = false) {
    super(app, extensionSettings, units, developerMode);
    mapboxgl.accessToken = extensionSettings.apiKey ?? "";
    setGlRuntime({
      Map: mapboxgl.Map as unknown as MapGlRuntime['Map'],
      Marker: mapboxgl.Marker as unknown as MapGlRuntime['Marker'],
      Popup: mapboxgl.Popup as unknown as MapGlRuntime['Popup'],
      LngLatBounds: mapboxgl.LngLatBounds as unknown as MapGlRuntime['LngLatBounds'],
      getVersion: () => mapboxgl.version,
    });
  }

  protected override constructMap(options: ConstructorParameters<MapGlRuntime['Map']>[0]): InstanceType<MapGlRuntime['Map']> {
    mapboxgl.accessToken = this.extensionSettings.apiKey ?? "";
    return new mapboxgl.Map(options as unknown as mapboxgl.MapOptions) as unknown as InstanceType<MapGlRuntime['Map']>;
  }

protected getStyleUrl(style: string): string | undefined {
    const styleKey = style;
    // Custom studio styles and full URLs pass through untouched.
    if (styleKey.startsWith('mapbox://') || styleKey.startsWith('https://')) return styleKey;
    return getMapboxStyleUrl(styleKey);
  }

  protected getSupportedStyles(): string[] {
    return MAPBOX_STYLES.map((style) => style.key);
  }

  protected getProviderClassName(): string {
    return 'mapbox';
  }

  protected override getProviderIntegration(): string {
    return 'mapbox-gl';
  }

}
