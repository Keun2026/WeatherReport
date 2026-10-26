/**
 * config.js
 * ---------------------------------------------------------------------------
 * OVERVIEW
 * Central configuration file for the weather dashboard. Every value that is
 * shared across the site and is likely to change (API URLs, the fields
 * requested from each API, default location, map settings, thresholds, text
 * labels and HTML element IDs) lives here, so it can be changed in ONE place
 * without touching the application code in app.js.
 *
 * CLASSES: none. This script defines one global read-only constant, CONFIG,
 *          and one helper function, deepFreeze().
 * PARENT CLASSES: none.
 *
 * USAGE: this file must be loaded BEFORE app.js:
 *   <script src="config.js"></script>
 *   <script src="app.js"></script>
 */

/**
 * Recursively freezes an object and every object or array nested inside it,
 * so the configuration cannot be changed accidentally while the app runs.
 *
 * @param {Object} obj - The object to freeze, including everything nested in it.
 * @returns {Object} The same object, now read-only.
 */
function deepFreeze(obj) {
  // Freeze each nested object/array first, then freeze the object itself.
  Object.values(obj).forEach(value => {
    if (value && typeof value === "object") deepFreeze(value);
  });
  return Object.freeze(obj);
}

/**
 * The single, read-only configuration object used by every class in app.js.
 * @constant {Object}
 */
const CONFIG = deepFreeze({

  /** Web service endpoints and the data fields requested from them. */
  api: {
    /** Base URL of the Open-Meteo weather forecast API. */
    weatherBaseUrl: "https://api.open-meteo.com/v1",

    /** Base URL of the Open-Meteo geocoding (place name search) API. */
    geocodingBaseUrl: "https://geocoding-api.open-meteo.com/v1",

    /** URL of the OpenStreetMap Nominatim reverse geocoding service (coordinates to place name). */
    reverseGeocodingUrl: "https://nominatim.openstreetmap.org/reverse",

    /** Time zone setting sent to the weather API ("auto" = the time zone of the requested location). */
    timezone: "auto",

    /** Response format requested from Nominatim and the geocoding API. */
    responseFormat: "json",

    /** Weather fields requested for the default load and for searches (full dataset). */
    forecastFields: {
      current: [
        "temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation",
        "weather_code", "wind_speed_10m", "wind_direction_10m", "is_day"
      ],
      hourly: ["temperature_2m", "precipitation_probability", "windspeed_10m", "is_day", "weather_code"],
      daily: [
        "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
        "uv_index_max", "sunrise", "sunset", "weather_code"
      ]
    },

    /** Weather fields requested after a map click (a smaller dataset than forecastFields). */
    mapClickFields: {
      current: ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "wind_speed_10m"],
      hourly: ["temperature_2m", "weather_code", "precipitation_probability"],
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min",
        "precipitation_probability_max", "sunrise", "sunset"
      ]
    }
  },

  /** Location shown when the page first loads. */
  defaultLocation: {
    /** Latitude of the default location (Melbourne). */
    latitude: -37.8136,
    /** Longitude of the default location (Melbourne). */
    longitude: 144.9631,
    /** Display name of the default location. */
    name: "Melbourne, Victoria"
  },

  /** Text shown to the user. */
  text: {
    /** Word added after a location name in headings, e.g. "Melbourne, Victoria Weather". */
    headingSuffix: "Weather",
    /** Name shown when a map click cannot be matched to a place. */
    fallbackLocationName: "Selected Location",
    /** Alert shown when a searched place cannot be found. */
    locationNotFound: "Location not found."
  },
});
