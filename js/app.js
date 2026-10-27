/**
 * app.js
 * ---------------------------------------------------------------------------
 * OVERVIEW
 * Main script of the weather dashboard. It fetches weather data from the
 * Open-Meteo APIs, shows it on the page and lets the user choose a location
 * by typing a place name or by clicking on a Leaflet map.
 *
 * All shared settings (URLs, default location, thresholds, element IDs...)
 * come from the CONFIG object in config.js, which must be loaded first.
 * The map class (WeatherMap) lives in map.js, which must also be loaded first.
 * Chart.js (Chart) must be loaded before this script too.
 *
 * LOAD ORDER:  config.js -> map.js -> app.js   (plus the Leaflet and Chart.js libraries)
 *
 * (The complete class list and OOP notes are added to this header in the final commit.)
 */

// Stops the script early, with a clear message, if config.js was not loaded first.
if (typeof CONFIG === "undefined") {
  throw new Error("config.js must be loaded before app.js");
}


/* ==========================================================================
 * UTILITY CLASSES
 * ========================================================================== */

/**
 * Static helper methods that format dates, times, wind directions and
 * coordinates. Pure functions: no DOM access, no network calls, no state.
 * This class is never instantiated; call its methods directly,
 * e.g. WeatherFormatter.formatTime12h(...).
 *
 * Parent class: none.
 */
class WeatherFormatter {
  /**
   * Formats a raw date string as a long date in the locale set in CONFIG,
   * e.g. "Monday, 15 October 2026".
   *
   * @param {string} dateStr - A date (2026-10-15) or date-time (2026-10-15T09:00) string.
   * @returns {string} The formatted date, or an empty string if no date was given.
   */
  static formatWarningDate(dateStr) {
    // Returns an empty string if no valid date string is provided.
    if (!dateStr) return "";
    // Normalizes the date string into a JavaScript Date object, ensuring valid ISO format.
    const dateObj = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    // Formats and returns the date as "Weekday, Day Month Year".
    return dateObj.toLocaleDateString(CONFIG.locale.warningDateLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  /**
   * Converts an ISO timestamp into a 12-hour time string, e.g. "5:57 AM".
   *
   * @param {string} isoString - An ISO date-time string such as "2026-10-15T05:57".
   * @returns {string} The formatted time, or "--" if the timestamp is missing.
   */
  static formatTime12h(isoString) {
    // Returns placeholder hyphens if the date-time string is invalid or missing.
    if (!isoString) return "--";
    // Creates a JavaScript Date instance from the ISO date-time string.
    const date = new Date(isoString);
    // Formats and returns the time in 12-hour format with AM/PM indicator.
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }

  /**
   * Converts a wind direction in degrees (0-360) into a 16-point compass name.
   *
   * @param {number} degree - Wind direction in degrees, where 0 is north.
   * @returns {string} A compass code such as "N", "NNE" or "SW". Defaults to "N" if degree is missing.
   */
  static getWindDirectionName(degree) {
    // Defaults to North ("N") if wind direction degree is missing.
    if (degree === undefined || degree === null) return "N";
    // Array holding all 16 cardinal compass sector codes.
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    // Maps 360 degrees into 16 equal 22.5° sectors to find the corresponding index.
    const index = Math.round(degree / 22.5) % 16;
    // Returns the calculated cardinal direction string.
    return directions[index];
  }

  /**
   * Converts latitude and longitude values (which may be strings) into numbers.
   *
   * @param {number|string} lat - The latitude value to convert.
   * @param {number|string} lng - The longitude value to convert.
   * @returns {{lat: number, lng: number}|null} The numeric coordinates, or null if either value is not a number.
   */
  static parseCoords(lat, lng) {
    const numericLat = parseFloat(lat);
    const numericLng = parseFloat(lng);
    if (isNaN(numericLat) || isNaN(numericLng)) return null;
    return { lat: numericLat, lng: numericLng };
  }
}

/**
 * Static helper methods that choose a weather icon from Open-Meteo (WMO)
 * weather codes. Never instantiated; call its methods directly,
 * e.g. WeatherIcons.getNowIconClass(...).
 *
 * Parent class: none.
 */
class WeatherIcons {
  /**
   * Selects a Bootstrap Icon class string based on the weather code,
   * precipitation and whether it is day or night.
   *
   * @param {Object} current - Current-conditions object from the weather API.
   * @param {number} [current.weather_code] - WMO weather code (0 = clear, 61 = rain, 95 = thunderstorm...).
   * @param {number} [current.is_day] - 1 if it is daytime, 0 if it is night.
   * @param {number} [current.precipitation] - Rainfall in mm, used only if the weather code is not recognised.
   * @returns {string} Bootstrap Icon CSS classes, e.g. "bi-sun-fill text-warning".
   */
  static getNowIconClass(current) {
    // Fallback default icon if current weather data is unavailable.
    if (!current) return "bi-sun-fill text-warning";

    // Extracts WMO weather code and daylight boolean flag.
    const code = current.weather_code !== undefined ? current.weather_code : current.weathercode;
    const isDay = current.is_day !== undefined ? current.is_day === 1 : true;

    // Weather condition mapping with Day/Night variations
    switch (code) {
      case 0:
        // Clear sky: Sun vs Moon
        return isDay ? "bi-sun-fill text-warning" : "bi-moon-stars-fill text-primary";

      case 1:
      case 2:
        // Partly cloudy: Cloud + Sun vs Cloud + Moon
        return isDay ? "bi-cloud-sun-fill text-warning" : "bi-cloud-moon-fill text-primary";

      case 3:
        // Overcast
        return "bi-cloud-fill text-secondary";

      case 45:
      case 48:
        // Fog/Haze
        return "bi-cloud-haze-fill text-secondary";

      case 51: case 53: case 55:
      case 61: case 63: case 65:
      case 80: case 81: case 82:
        // Rain
        return "bi-cloud-rain-fill text-primary";

      case 95: case 96: case 99:
        // Thunderstorm
        return "bi-cloud-lightning-rain-fill text-danger";

      default: {
        // Fallback: check precipitation only as a last resort if weather code is unknown/unmapped
        const precip = current.precipitation || 0;
        if (precip > 2.0) return "bi-cloud-rain-heavy-fill text-primary";
        if (precip > 0) return "bi-cloud-drizzle-fill text-info";

        return isDay ? "bi-cloud-sun-fill text-warning" : "bi-cloud-moon-fill text-primary";
      }
    }
  }

  /**
   * Returns a ready-made <i> icon element (as an HTML string) for a weather code.
   * Used by the forecast cards shown after a map click.
   *
   * @param {number} code - WMO weather code from the weather API.
   * @returns {string} HTML for a Bootstrap Icon.
   */
  static getHtmlIcon(code) {
    // Clear / Sunny (Solid yellow sun)
    if (code === 0) return '<i class="bi bi-sun-fill text-warning fs-3"></i>';

    // Partly cloudy (Using bi-cloud-sun with a warning/yellow accent)
    if (code >= 1 && code <= 2) return '<i class="bi bi-cloud-sun-fill text-warning fs-3"></i>';

    // Overcast / Cloudy (Gray cloud)
    if (code === 3) return '<i class="bi bi-cloud-fill text-secondary fs-3"></i>';

    // Rain / Showers / Drizzle (Blue rain cloud)
    if (code >= 51 && code <= 82) return '<i class="bi bi-cloud-rain-heavy-fill text-primary fs-3"></i>';

    // Thunderstorm
    if (code >= 95) return '<i class="bi bi-cloud-lightning-rain-fill text-warning fs-3"></i>';

    // Default fallback
    return '<i class="bi bi-cloud-fill text-secondary fs-3"></i>';
  }

  /**
   * Chooses an icon for a daily forecast card from the chance of rain.
   *
   * @param {number} rainChance - Maximum chance of rain for the day, as a percentage (0-100).
   * @returns {string} Bootstrap Icon CSS classes.
   */
  static getDailyIconClass(rainChance) {
    // Rain if chance is 50% or higher
    if (rainChance >= 50) return "bi-cloud-rain-fill text-primary";
    // Cloudy if chance is moderate
    if (rainChance >= 20) return "bi-cloud-fill text-secondary";
    // Sunny/Clear if chance is low
    return "bi-sun-fill text-warning";
  }
}


/* ==========================================================================
 * DATA ACCESS CLASSES
 * These classes only fetch data and return it. They never touch the page or the map.
 * ========================================================================== */

/**
 * PARENT CLASS for every class that talks to a web service.
 * Holds a base URL and provides one shared method for downloading JSON, so
 * the child classes do not each repeat the same fetch and error-checking code.
 *
 * Child classes: WeatherApi, GeocodingApi, ReverseGeocodingApi.
 * Parent class: none.
 */
class ApiClient {
  /** Root URL that all requests made by this client start with. */
  #baseUrl;

  /**
   * Creates an API client.
   *
   * @param {string} baseUrl - The root URL of the web service this client talks to.
   */
  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }

  /**
   * The root URL of the web service (read-only, so children cannot change it by accident).
   * @returns {string} The base URL given to the constructor.
   */
  get baseUrl() {
    return this.#baseUrl;
  }

  /**
   * Downloads a URL and parses the response as JSON.
   *
   * @param {string} url - The full URL to request.
   * @returns {Promise<Object>} The parsed JSON response.
   * @throws {Error} If the server replies with an error status (anything outside 200-299).
   */
  async getJson(url) {
    const response = await fetch(url);
    // Treats HTTP error codes (404, 500...) as failures instead of parsing an error page.
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    // Parses and returns the JSON payload resolved from the network response.
    return response.json();
  }
}

/**
 * Requests weather forecasts from the Open-Meteo forecast API.
 *
 * Parent class: ApiClient.
 */
class WeatherApi extends ApiClient {
  /** Shared settings from config.js (field lists, time zone). */
  #config;

  /**
   * Creates the weather API client.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    super(config.api.weatherBaseUrl);
    this.#config = config;
  }

  /**
   * Builds a forecast request URL for a location and a set of weather fields.
   *
   * @param {number} lat - Latitude of the location.
   * @param {number} lon - Longitude of the location.
   * @param {{current: string[], hourly: string[], daily: string[]}} fields - Names of the weather fields to request.
   * @returns {string} The complete request URL.
   */
  #buildForecastUrl(lat, lon, fields) {
    return `${this.baseUrl}/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=${fields.current.join(",")}` +
      `&hourly=${fields.hourly.join(",")}` +
      `&daily=${fields.daily.join(",")}` +
      `&timezone=${this.#config.api.timezone}`;
  }

  /**
   * Fetches current, hourly and daily weather for a location (used for the
   * default load and for searches).
   *
   * @param {number} lat - Latitude of the location.
   * @param {number} lon - Longitude of the location.
   * @returns {Promise<Object|undefined>} The forecast data, or undefined if the request failed
   *                                      (the error is logged to the console).
   */
  async fetchWeatherData(lat, lon) {
    // Constructs the complete Open-Meteo REST API request URL with required weather parameters.
    const endpoint = this.#buildForecastUrl(lat, lon, this.#config.api.forecastFields);
    try {
      return await this.getJson(endpoint);
    } catch (error) {
      console.error("Failed to fetch weather data:", error);
    }
  }

  /**
   * Fetches a smaller weather dataset for a map click.
   *
   * @param {number} lat - Latitude of the clicked point.
   * @param {number} lng - Longitude of the clicked point.
   * @returns {Promise<Object>} The forecast data.
   * @throws {Error} If the request fails (the caller handles the error).
   */
  async fetchWeatherByCoords(lat, lng) {
    return this.getJson(this.#buildForecastUrl(lat, lng, this.#config.api.mapClickFields));
  }
}


/* ==========================================================================
 * START-UP
 * ========================================================================== */

// Single initialization point: runs once the page has loaded.
document.addEventListener("DOMContentLoaded", () => {
  // The WeatherDashboard is created here once it has been added.
});
