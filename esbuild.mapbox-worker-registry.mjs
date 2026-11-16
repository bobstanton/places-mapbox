import { readFile } from 'node:fs/promises';

export const mapboxWorkerRegistryPlugin = {
  name: 'mapbox-worker-registry',
  setup(build) {
    build.onLoad({ filter: /mapbox-gl[/\\]dist[/\\]mapbox-gl\.js$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');

      if (!source.includes('_classRegistryKey')) throw new Error('Mapbox worker registry changed; review engine isolation');

      // MapLibre 6 registers Set and Error on the shared built-in constructors.
      // Namespace Mapbox's key in both its main thread and embedded worker so
      // those foreign registrations cannot bypass Mapbox's built-in serializers.
      return { contents: source.replaceAll('_classRegistryKey', '_placesMapboxClassRegistryKey'), loader: 'js' };
    });
  },
};
