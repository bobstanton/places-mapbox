import type { BasemapStyle, TerrainDemSpec } from 'places-shared/map';

export const MAPBOX_STYLES: ReadonlyArray<BasemapStyle & { path: string; sdkOnly?: boolean }> = [
  { value: 'standard', name: 'Standard', path: 'standard', sdkOnly: true },
  { value: 'streets', name: 'Streets', path: 'streets-v12' },
  { value: 'outdoors', name: 'Outdoors', path: 'outdoors-v12' },
  { value: 'light', name: 'Light', path: 'light-v11' },
  { value: 'dark', name: 'Dark', path: 'dark-v11' },
  { value: 'satellite', name: 'Satellite', path: 'satellite-v9' },
  { value: 'satellite-streets', name: 'Satellite Streets', path: 'satellite-streets-v12' },
  { value: 'navigation-day', name: 'Navigation Day', path: 'navigation-day-v1' },
  { value: 'navigation-night', name: 'Navigation Night', path: 'navigation-night-v1' },
];

export function mapboxStylesFor(renderer: 'mapbox-gl' | 'maplibre'): ReadonlyArray<BasemapStyle & { path: string }> {
  return renderer === 'mapbox-gl' ? MAPBOX_STYLES : MAPBOX_STYLES.filter((style) => !style.sdkOnly);
}

export function mapboxStyleNeedsSdk(styleId: string): boolean {
  return MAPBOX_STYLES.some((style) => style.value === styleId && style.sdkOnly === true);
}

export function mapboxStyleUri(styleId: string): string | undefined {
  const style = MAPBOX_STYLES.find((candidate) => candidate.value === styleId);

  return style ? `mapbox://styles/mapbox/${style.path}` : undefined;
}

export function mapboxStyleUrl(styleId: string, apiKey: string): string | undefined {
  const token = `access_token=${apiKey}`;
  const custom = styleId.match(/^mapbox:\/\/styles\/([^/]+)\/(.+)$/);

  if (custom) return `https://api.mapbox.com/styles/v1/${custom[1]}/${custom[2]}?${token}`;
  if (styleId.startsWith('https://')) return styleId;
  const style = MAPBOX_STYLES.find((candidate) => candidate.value === styleId);

  if (!style || style.sdkOnly) return undefined;

  return `https://api.mapbox.com/styles/v1/mapbox/${style.path}?${token}`;
}

export function mapboxResourceUrl(uri: string, apiKey: string): string | undefined {
  if (!uri.startsWith('mapbox://')) return undefined;
  const rest = uri.slice('mapbox://'.length);
  const token = `access_token=${apiKey}`;

  if (rest.startsWith('fonts/')) return `https://api.mapbox.com/fonts/v1/${rest.slice('fonts/'.length)}?${token}`;

  if (rest.startsWith('sprites/')) {
    const path = rest.slice('sprites/'.length);
    const match = path.match(/^([^/]+)\/(.+?)((?:@[0-9.]+x)?(?:\.[a-z]+)?)$/);

    if (!match) return undefined;

    return `https://api.mapbox.com/styles/v1/${match[1]}/${match[2]}/sprite${match[3]}?${token}`;
  }

  if (rest.startsWith('styles/')) return `https://api.mapbox.com/styles/v1/${rest.slice('styles/'.length)}?${token}`;

  return `https://api.mapbox.com/v4/${rest}.json?secure&${token}`;
}

export function mapboxDemSource(apiKey: string): TerrainDemSpec | null {
  if (!apiKey) return null;

  return {
    tiles: [`https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}@2x.pngraw?access_token=${apiKey}`],
    encoding: 'mapbox',
    tileSize: 512,
    maxzoom: 14,
  };
}
