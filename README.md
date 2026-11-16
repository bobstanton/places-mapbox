# Places - Mapbox

Map provider for [Places](https://community.obsidian.md/plugins/places) using [Mapbox](https://www.mapbox.com/), with vector maps, POI search, elevation replacement, 3D terrain, directions, isochrones, and track snapping.

This is not a stand-alone plugin, to use, install along side [Places](https://community.obsidian.md/plugins/places). Refer to the [sandbox](https://sandbox.obsidian.stanton.dev/places/) for examples.

## Network requests

| Area                 | Request                                                      |
| -------------------- | ------------------------------------------------------------ |
| Map tiles and styles | Loads the selected map style, its glyphs, sprites, and tiles |
| POI search           | Resolves a search term to place suggestions and coordinates  |
| Directions           | Builds a route between the waypoints in a block              |
| Isochrones           | Builds reachability polygons around a center point           |
| Track snapping       | Aligns a recorded track to the road or path network          |
| Elevation            | Reads elevation for a coordinate                             |
| 3D terrain           | Loads terrain DEM tiles for 3D relief                        |

## Background tasks

None.

## Dependencies

| Library                                                                                          | Purpose                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [mapbox-gl](https://github.com/mapbox/mapbox-gl-js)                                              | Renders the map surface                        |
| [@mapbox/search-js-core](https://github.com/mapbox/search-js)                                    | POI and address search                         |
| [places-shared](https://github.com/bobstanton/places-shared)                                     | Shared map, overlay, routing, and utility code |
| [places-shared/obsidian/maplibre](https://github.com/bobstanton/places-shared/obsidian/maplibre) | Shared map rendering                           |
