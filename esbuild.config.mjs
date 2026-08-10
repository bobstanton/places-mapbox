import { runPluginBuild, obsidianPluginExternal } from "./esbuild.shared.mjs";

// The MapLibre base's default engine is loaded lazily; this bundle injects
// mapbox-gl instead, so maplibre-gl must never be pulled in.
await runPluginBuild({ external: [...obsidianPluginExternal, "maplibre-gl"] });
