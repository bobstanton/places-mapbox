import { App, Plugin } from "obsidian";
import { IPlaceExtensionSettings, IPlacesExtensionHostSettings } from "places-shared/settings";
import { IPlacePluginExtension, IPlacePluginExtensionExports, registerPlaceExtensionLifecycle, settingsOnlyExports, PLACES_EXTENSION_API_VERSION, type ExtensionSettingsGroup } from "places-shared/obsidian/services";
import { Utilities, configureRequestLogging } from "places-shared/utils";
import { apiKeySettingItem, countrySettingItem, settingsPageStatus, styleDropdownItem } from "places-shared/obsidian/ui";
import "./styles.css";
import MapboxApiService from "./MapboxApiService";
import { MapboxMapBlockProcessor } from "./MapboxMapBlockProcessor";
import { MapboxElevationService } from "./MapboxElevationService";
import { MapboxRouteOverlayService } from "./MapboxRouteOverlayService";
import { MapboxSnapService } from "./MapboxSnapService";
import { MapboxTerrainDemProvider } from "./MapboxTerrainDemProvider";
import { buildImageAlignment } from "places-shared/obsidian/maplibre";
import { MAPBOX_STYLES, DEFAULT_MAPBOX_STYLE, getMapboxStyleUrl } from "./MapboxStyles";
import { PROVIDER_ICON } from "./provider-icon";
import "mapbox-gl/dist/mapbox-gl.css";
import "places-shared/maplibre-styles.css";

const DEFAULT_SETTINGS: IPlaceExtensionSettings = {
  defaultStyle: DEFAULT_MAPBOX_STYLE
};

export default class MapboxPlacePluginExtension extends Plugin implements IPlacePluginExtension {
  private mapBlockProcessor: MapboxMapBlockProcessor | null = null;
  // Obsidian 1.13 declares a public Plugin.settings; subclasses narrow its type.
  settings: IPlaceExtensionSettings = DEFAULT_SETTINGS;

  onload() {
    registerPlaceExtensionLifecycle(this);
  }

  getPlaceExports(app: App, extensionSettings: IPlaceExtensionSettings, mainSettings: IPlacesExtensionHostSettings): IPlacePluginExtensionExports {
    configureRequestLogging(mainSettings.developerMode);
    Utilities.applyDefaults(extensionSettings, DEFAULT_SETTINGS);
    this.settings = extensionSettings;

    if (!extensionSettings.apiKey) {
      return settingsOnlyExports(this.settingsGroup(extensionSettings));
    }

    this.mapBlockProcessor = new MapboxMapBlockProcessor(app, extensionSettings, mainSettings.units, mainSettings.developerMode);
    const mapBlockProcessor = this.mapBlockProcessor;
    const placesService = new MapboxApiService(extensionSettings);
    const elevationService = new MapboxElevationService(extensionSettings);
    const routeOverlayService = new MapboxRouteOverlayService(extensionSettings);

    return {
      apiVersion: PLACES_EXTENSION_API_VERSION,
      providers: [
        {
          name: "mapbox",
          mapDefaults: { style: extensionSettings.defaultStyle },
          styles: MAPBOX_STYLES.map((style) => style.key),
          features: {
            poiDiscovery: true,
            vector: true,
            tileCache: false
          },
          map: mapBlockProcessor,
          imageAlignment: buildImageAlignment(app, "Mapbox", (style) => getMapboxStyleUrl(style || extensionSettings.defaultStyle) ?? getMapboxStyleUrl(DEFAULT_MAPBOX_STYLE)!),
          geocoding: {
            service: placesService,
            icon: PROVIDER_ICON
          },
          elevation: elevationService,
          routeOverlay: routeOverlayService,
          snap: new MapboxSnapService(extensionSettings),
          terrain: new MapboxTerrainDemProvider(extensionSettings)
        }
      ],
      settingsGroup: this.settingsGroup(extensionSettings)
    };
  }

  private settingsGroup(settings: IPlaceExtensionSettings): ExtensionSettingsGroup {
    return {
      heading: "Mapbox",
      ...settingsPageStatus(() => Boolean(settings.apiKey?.trim())),
      reloadOn: ["apiKey", "defaultStyle"],
      items: [
        apiKeySettingItem("Mapbox"),
        countrySettingItem("Country to limit searches to (optional)"),
        styleDropdownItem({
          desc: "Default map style for Mapbox maps",
          styles: MAPBOX_STYLES.map(style => ({ value: style.key, name: style.name })),
          fallbackStyle: DEFAULT_MAPBOX_STYLE
        }),
      ],
    };
  }

  onunload() {
    if (this.mapBlockProcessor) {
      this.mapBlockProcessor.cleanup();
    }
  }
}
