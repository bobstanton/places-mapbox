import { mapboxStylesFor, mapboxStyleUri } from 'places-mapbox/core';

export { mapboxStyleUri, mapboxStyleUrl } from "places-mapbox/core";

export const MAPBOX_STYLES = mapboxStylesFor('mapbox-gl').map((style) => ({
  key: style.value,
  name: style.name,
  url: `mapbox://styles/mapbox/${style.path}`,
}));

export const DEFAULT_MAPBOX_STYLE = "streets";

export function getMapboxStyleUrl(key: string): string | undefined {
  return mapboxStyleUri(key);
}
