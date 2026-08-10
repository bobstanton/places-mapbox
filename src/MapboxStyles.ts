export interface MapboxStyleDefinition {
  key: string;
  name: string;
  url: string;
}

export const MAPBOX_STYLES: MapboxStyleDefinition[] = [
  { key: "standard", name: "Standard", url: "mapbox://styles/mapbox/standard" },
  { key: "streets", name: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  { key: "outdoors", name: "Outdoors", url: "mapbox://styles/mapbox/outdoors-v12" },
  { key: "light", name: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { key: "dark", name: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { key: "satellite", name: "Satellite", url: "mapbox://styles/mapbox/satellite-v9" },
  { key: "satellite-streets", name: "Satellite Streets", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { key: "navigation-day", name: "Navigation Day", url: "mapbox://styles/mapbox/navigation-day-v1" },
  { key: "navigation-night", name: "Navigation Night", url: "mapbox://styles/mapbox/navigation-night-v1" }
];

export function getMapboxStyleUrl(key: string): string | undefined {
  const style = MAPBOX_STYLES.find(s => s.key === key);
  return style?.url;
}

export const DEFAULT_MAPBOX_STYLE = "streets";
