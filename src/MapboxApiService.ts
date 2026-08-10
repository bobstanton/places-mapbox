import { Place } from "places-shared/place";
import { Coordinate, PlacesBoundingBox } from "places-shared/geo";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { IPlacesService, lookupPlaceWithNearOrInQuery } from "places-shared/services";
import { logger, removeRedundantPlaceAddressParts } from "places-shared/utils";
import { SearchBoxCore, SessionToken } from '@mapbox/search-js-core'; 

type MapboxSuggestResult = Awaited<ReturnType<SearchBoxCore['suggest']>>;
type MapboxSuggestion = MapboxSuggestResult['suggestions'][number];

let sharedSessionToken: SessionToken | undefined;

function getObsidianSessionToken(): SessionToken {
  sharedSessionToken ??= new SessionToken();
  return sharedSessionToken;
}

export default class MapboxApiService implements IPlacesService {
  extensionSettings: IPlaceExtensionSettings;
  private searchBoxCore: SearchBoxCore;
  private sessionToken: SessionToken;

  constructor(extensionSettings: IPlaceExtensionSettings) {
    this.extensionSettings = extensionSettings;
    this.searchBoxCore = new SearchBoxCore({ accessToken: this.extensionSettings.apiKey });
    this.sessionToken = getObsidianSessionToken();
  }

  public async lookupPlace(query: string): Promise<Place[]> {
    return lookupPlaceWithNearOrInQuery(query, {
      search: (searchText, proximity) => this.executeSearch(searchText, proximity ? [proximity.longitude, proximity.latitude] : undefined),
      geocodeLocation: async (location) => {
        const bounds = await this.geocodeLocationBounds(location);
        return bounds ? { bounds } : null;
      },
      searchInBounds: (searchText, bounds) => this.lookupPlaceInBounds(searchText, bounds),
      combineFallbackQuery: (poi: string, location: string) => `${poi}, ${location}`,
      filterBoundedResults: false,
    });
  }

  public async lookupPlaceInBounds(query: string, bounds: PlacesBoundingBox): Promise<Place[]> {
    try {
      const searchOptions: {
        sessionToken: SessionToken;
        types: string;
        country?: string;
        bbox: [number, number, number, number];
      } = {
        sessionToken: this.sessionToken,
        types: "place,poi",
        bbox: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
      };

      if (this.extensionSettings.country) {
        searchOptions.country = this.extensionSettings.country;
      }

      logger.scope('Places').debug('[Mapbox] lookupPlaceInBounds with bbox:', searchOptions.bbox);

      const suggestResult = await this.searchBoxCore.suggest(query, searchOptions);

      const places: Place[] = suggestResult.suggestions.map((suggestion) =>
        this.mapSuggestionToPlace(suggestion, suggestResult.attribution ?? "")
      );

      return places;
    } catch (error) {
      logger.scope('Places').error('Mapbox bounded search failed', error);
      throw error;
    }
  }

  private async geocodeLocationBounds(location: string): Promise<PlacesBoundingBox | null> {
    const suggestResult = await this.searchBoxCore.suggest(location, {
      sessionToken: this.sessionToken,
      types: "country,region,postcode,district,place,locality,neighborhood"
    });

    if (suggestResult.suggestions.length === 0) {
      return null;
    }

    const suggestion = suggestResult.suggestions[0];
    const retrieveResults = await this.searchBoxCore.retrieve(suggestion, {
      sessionToken: this.sessionToken
    });

    if (retrieveResults.features.length === 0) {
      return null;
    }

    const feature = retrieveResults.features[0];
    const bbox = (feature as { bbox?: number[] }).bbox;
    if (Array.isArray(bbox) && bbox.length >= 4) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      return new PlacesBoundingBox(minLat, minLng, maxLat, maxLng);
    }

    return PlacesBoundingBox.fromCoordinates([{
      latitude: feature.properties.coordinates.latitude,
      longitude: feature.properties.coordinates.longitude
    }], 2.0);
  }

  private async executeSearch(query: string, proximity?: [number, number]): Promise<Place[]> {
    const searchOptions: {
      sessionToken: SessionToken;
      types: string;
      country?: string;
      proximity?: [number, number];
    } = {
      sessionToken: this.sessionToken,
      types: "place,poi"
    };

    if (this.extensionSettings.country) {
      searchOptions.country = this.extensionSettings.country;
    }

    if (proximity) {
      searchOptions.proximity = proximity;
    }

    try {
      const suggestResult = await this.searchBoxCore.suggest(query, searchOptions);

      const places: Place[] = suggestResult.suggestions.map((suggestion) =>
        this.mapSuggestionToPlace(suggestion, suggestResult.attribution ?? "")
      );

      return places;
    } catch (error) {
      logger.scope('Places').error('Mapbox search failed', error);
      throw error;
    }
  }

  private mapSuggestionToPlace(suggestion: MapboxSuggestion, attribution: string): Place {
    const place: Place = {
      name: suggestion.name,
      address: (suggestion.full_address ?? "").replace(`, ${suggestion.context.country?.name}`, ""),
      city: suggestion.context.place?.name ?? "",
      state: suggestion.context.region?.name ?? "",
      postalCode: suggestion.context.postcode?.name ?? "",
      country: suggestion.context.country?.name ?? "",
      latitude: 0,
      longitude: 0,
      // The suggest endpoint carries no coordinates; retrieve (resolvePlace) does.
      coordinatesPending: true,
      website: "",
      tags: (suggestion.poi_category ?? []).map(name => name.replace(/ /g, "-")),
      source: "mapbox",
      attribution,
      resolvePlace: async (): Promise<Place> => {
        try {
          const retrieveResults = await this.searchBoxCore.retrieve(suggestion, {
            sessionToken: this.sessionToken
          });
          const feature = retrieveResults.features[0];

          return {
            ...place,
            latitude: feature.properties.coordinates.latitude,
            longitude: feature.properties.coordinates.longitude,
            coordinatesPending: false,
            resolvePlace: undefined
          };
        } catch {
          return place;
        }
      }
    };

    removeRedundantPlaceAddressParts(place);
    return place;
  }

  public async lookupPlaceByCoordinates(coordinate: Coordinate): Promise<Place[]> {
    try {
      const reverseOptions: {
        sessionToken: SessionToken;
        types: string;
      } = {
        sessionToken: this.sessionToken,
        types: "place,poi"
      };
      
      // Mapbox SDK expects [longitude, latitude]
      const reverseResult = await this.searchBoxCore.reverse(
        [coordinate.longitude, coordinate.latitude],
        reverseOptions
      );

      const places: Place[] = reverseResult.features.map((feature): Place => ({
        name: feature.properties.name || "",
        address: feature.properties.full_address?.replace(`, ${feature.properties.context?.country?.name}`, "") || "",
        city: feature.properties.context?.place?.name || "",
        state: feature.properties.context?.region?.name || "",
        postalCode: feature.properties.context?.postcode?.name || "",
        country: feature.properties.context?.country?.name || "",
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        website: "",
        tags: (feature.properties.poi_category || []).map((name: string) => name.replace(/ /g, "-")),
        source: "mapbox",
        attribution: reverseResult.attribution || ""
      }));

      return places;
    } catch (error) {
      logger.scope('Places').error('Mapbox reverse geocoding failed', error);
      throw error;
    }
  }

}
