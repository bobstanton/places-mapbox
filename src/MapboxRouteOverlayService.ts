import { MapboxRouteOverlayService as CoreMapboxRouteOverlayService } from 'places-mapbox/core';
import { loggedRouteHttpClient } from "places-shared/services";
import type { IPlaceExtensionSettings } from "places-shared/settings";

export class MapboxRouteOverlayService extends CoreMapboxRouteOverlayService {
  constructor(settings: IPlaceExtensionSettings) {
    super(settings, loggedRouteHttpClient);
  }
}
