/**
 * app.js
 * ---------------------------------------------------------------------------
 * OVERVIEW
 * Main script of the weather dashboard. It fetches weather data from the
 * Open-Meteo APIs, shows it on the page (cards, hourly and daily forecasts,
 * warnings, temperature chart) and lets the user choose a location by typing
 * a place name or by clicking on a Leaflet map.
 *
 * All shared settings (URLs, default location, thresholds, element IDs...)
 * come from the CONFIG object in config.js, which must be loaded first.
 * The map class (WeatherMap) lives in map.js, which must also be loaded first.
 * Chart.js (Chart) must be loaded before this script too.
 *
 * LOAD ORDER:  config.js -> map.js -> app.js   (plus the Leaflet and Chart.js libraries)
 *
 * CLASSES (in the order they appear in this file)
 *   Utilities (static, never instantiated)
 *     WeatherFormatter ........ date, time, wind and coordinate formatting
 *     WeatherIcons ............ chooses weather icons
 *   Data access
 *     ApiClient ............... PARENT class: fetches JSON from a base URL
 *     WeatherApi .............. forecast requests         (extends ApiClient)
 *     GeocodingApi ............ place name search         (extends ApiClient)
 *     ReverseGeocodingApi ..... coordinates to place name (extends ApiClient)
 *   Display
 *     UiComponent ............. PARENT class: shared DOM helpers + abstract render()
 *     LocationHeading ......... location name and page title   (extends UiComponent)
 *     OverviewCards ........... 'Now' and 'Today' cards       (extends UiComponent)
 *     HourlyForecast .......... scrolling hourly cards        (extends UiComponent)
 *     DailyForecast ........... multi-day cards               (extends UiComponent)
 *     WeatherWarnings ......... warning alerts                (extends UiComponent)
 *     SearchSuggestions ....... autocomplete dropdown         (extends UiComponent)
 *     MapClickRenderer ........ cards shown after a map click (extends UiComponent)
 *     TemperatureChart ........ Chart.js trend chart          (extends UiComponent)
 *   Control
 *     WeatherDashboard ........ controller that connects everything together
 *   (WeatherMap, the Leaflet map class, is defined in map.js and used here.)
 *
 * PARENT CLASSES
 *   ApiClient   -> WeatherApi, GeocodingApi, ReverseGeocodingApi
 *   UiComponent -> LocationHeading, OverviewCards, HourlyForecast, DailyForecast,
 *                  WeatherWarnings, SearchSuggestions, MapClickRenderer, TemperatureChart
 *   (Parent classes are defined before their children because a class must
 *    exist before another class can extend it.)
 *
 * OOP PRINCIPLES USED
 *   Encapsulation .. internal state is stored in private (#) members
 *   Abstraction .... each class has one job and hides how it does it
 *   Inheritance .... the two parent classes above remove duplicated code
 *   Polymorphism ... every UiComponent overrides render(), so the dashboard can
 *                    call render() on all of them without knowing their type
 */

// Stops the script early, with a clear message, if config.js was not loaded first.
if (typeof CONFIG === "undefined") {
  throw new Error("config.js must be loaded before app.js");
}
// Stops the script early, with a clear message, if map.js was not loaded first.
if (typeof WeatherMap === "undefined") {
  throw new Error("map.js must be loaded before app.js");
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

/**
 * Searches for places by name using the Open-Meteo geocoding API.
 *
 * Parent class: ApiClient.
 */
class GeocodingApi extends ApiClient {
  /** Shared settings from config.js (result counts, language, minimum query length). */
  #config;

  /**
   * Creates the geocoding API client.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    super(config.api.geocodingBaseUrl);
    this.#config = config;
  }

  /**
   * Finds the best match for a place name.
   *
   * @param {string} query - The place name typed by the user.
   * @returns {Promise<{lat: number, lon: number, name: string}|null|undefined>}
   *          The matching place; null if nothing matched; undefined if the query
   *          was empty or the request failed.
   */
  async searchLocation(query) {
    // Guards against empty or whitespace-only search input queries.
    if (!query || query.trim() === "") return;
    try {
      const data = await this.getJson(
        `${this.baseUrl}/search?name=${encodeURIComponent(query)}&count=${this.#config.search.singleResultCount}`
      );

      if (data.results && data.results.length > 0) {
        const loc = data.results[0];
        const locationName = `${loc.name}, ${loc.admin1 || loc.country}`;
        return { lat: loc.latitude, lon: loc.longitude, name: locationName };
      }
      return null;
    } catch (error) {
      console.error("Geocoding search error:", error);
    }
  }

  /**
   * Fetches matching places while the user is typing (autocomplete).
   *
   * @param {string} query - The text typed so far.
   * @returns {Promise<Object[]|null>} A list of matching places (empty if the query is too short
   *                                   or nothing matched), or null if the request failed.
   */
  async fetchLocationSuggestions(query) {
    // Ignores short input queries with fewer characters than the configured minimum.
    if (!query || query.trim().length < this.#config.search.minQueryLength) return [];

    const search = this.#config.search;
    try {
      const data = await this.getJson(
        `${this.baseUrl}/search?name=${encodeURIComponent(query)}` +
        `&count=${search.suggestionCount}&language=${search.language}&format=${this.#config.api.responseFormat}`
      );
      return data.results || [];
    } catch (error) {
      console.error("Error fetching location suggestions:", error);
      return null;
    }
  }
}

/**
 * Converts map coordinates into a readable place name using OpenStreetMap
 * Nominatim (reverse geocoding). Remembers names it has already looked up.
 *
 * Parent class: ApiClient.
 */
class ReverseGeocodingApi extends ApiClient {
  /** Shared settings from config.js (response format, fallback name). */
  #config;

  /** Place names already looked up, stored by "lat,lng" so the same click is not requested twice. */
  #locationCache = new Map();

  /**
   * Creates the reverse geocoding client.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    super(config.api.reverseGeocodingUrl);
    this.#config = config;
  }

  /**
   * Looks up a readable place name for a pair of coordinates.
   *
   * @param {number} lat - Latitude of the point.
   * @param {number} lng - Longitude of the point.
   * @returns {Promise<string>} A name such as "Richmond, Melbourne, AU", or the fallback
   *                            name from CONFIG if no name could be found.
   */
  async getCityNameFromCoords(lat, lng) {
    // Returns the stored name straight away if this exact point was already looked up.
    const cacheKey = `${lat},${lng}`;
    if (this.#locationCache.has(cacheKey)) return this.#locationCache.get(cacheKey);

    try {
      const nominatimUrl = `${this.baseUrl}?format=${this.#config.api.responseFormat}&lat=${lat}&lon=${lng}`;
      const data = await this.getJson(nominatimUrl);

      if (data && data.address) {
        // Extract granular details (suburb/neighborhood first, then city/town, then country)
        const suburb = data.address.suburb || data.address.neighbourhood || data.address.city_district || "";
        const city = data.address.city || data.address.town || data.address.village || data.address.county || "";
        const country = data.address.country_code ? data.address.country_code.toUpperCase() : "";

        // Build a smart, specific location hierarchy
        const locationParts = [];

        if (suburb) locationParts.push(suburb);
        if (city && city !== suburb) locationParts.push(city);
        if (country) locationParts.push(country);

        // If we found valid parts, join them (e.g., "Richmond, Melbourne, AU")
        if (locationParts.length > 0) {
          const name = locationParts.join(", ");
          this.#locationCache.set(cacheKey, name);
          return name;
        }
      }
    } catch (err) {
      console.error("Geocoding lookup failed:", err);
    }

    return this.#config.text.fallbackLocationName;
  }
}


/* ==========================================================================
 * DISPLAY CLASSES
 * These classes only read and write the page. They never fetch data.
 * ========================================================================== */

/**
 * PARENT CLASS for every class that draws something on the page.
 * Provides safe helpers for finding elements (using the IDs in CONFIG.dom)
 * and an abstract render() method that each child class overrides.
 * Because every child shares the render() method name, the dashboard can
 * treat them all the same way (polymorphism).
 *
 * Child classes: LocationHeading, OverviewCards, HourlyForecast, DailyForecast,
 *                WeatherWarnings, SearchSuggestions, MapClickRenderer, TemperatureChart.
 * Parent class: none.
 */
class UiComponent {
  /** Shared settings from config.js (element IDs, text, limits). */
  #config;

  /**
   * Creates a display component.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    this.#config = config;
  }

  /**
   * The configuration object, available to child classes (read-only).
   * @returns {Object} The configuration given to the constructor.
   */
  get config() {
    return this.#config;
  }

  /**
   * Finds a page element using a key from CONFIG.dom.
   *
   * @param {string} key - A key of CONFIG.dom, e.g. "nowTemp" (not the HTML ID itself).
   * @returns {HTMLElement|null} The element, or null if it is not on the page.
   */
  getElement(key) {
    return document.getElementById(this.#config.dom[key]);
  }

  /**
   * Finds the first page element that matches a CSS selector.
   *
   * @param {string} selector - A CSS selector, e.g. "h1" or ".sunrise".
   * @returns {Element|null} The matching element, or null if there is none.
   */
  queryElement(selector) {
    return document.querySelector(selector);
  }

  /**
   * Safely sets the text of a page element. Does nothing if the element is
   * missing or the text is null/undefined.
   *
   * @param {string} key - A key of CONFIG.dom identifying the element.
   * @param {string} text - The text to display.
   */
  setText(key, text) {
    // Locates DOM element by its configured identifier.
    const el = this.getElement(key);
    // Sets text content if target element exists and text value is non-null.
    if (el && text !== null && text !== undefined) {
      el.textContent = text;
    }
  }

  /**
   * ABSTRACT METHOD: draws this component from the given data.
   * Every child class must override it.
   *
   * @param {Object} data - The data to display (its shape depends on the child class).
   * @throws {Error} Always, if a child class has not overridden it.
   */
  render(data) {
    throw new Error(`${this.constructor.name} must implement render()`);
  }
}

/**
 * Shows the name of the selected location in the page heading and page title.
 *
 * Parent class: UiComponent.
 */
class LocationHeading extends UiComponent {
  /**
   * Updates the location heading, e.g. "Melbourne, Victoria Weather".
   *
   * @param {string} locationName - The name of the selected location.
   */
  render(locationName) {
    const cityNameEl = this.getElement("cityName");
    if (cityNameEl) {
      cityNameEl.textContent = `${locationName} ${this.config.text.headingSuffix}`;
    }
  }

  /**
   * Updates the page's main title (the <h1>); used after a map click.
   *
   * @param {string} locationName - The name of the selected location.
   */
  renderPageTitle(locationName) {
    const pageTitle = this.queryElement(this.config.dom.pageTitleSelector);
    if (pageTitle) {
      pageTitle.textContent = `${locationName} ${this.config.text.headingSuffix}`;
    }
  }
}

/**
 * Fills the 'Now' and 'Today' overview cards.
 *
 * Parent class: UiComponent.
 */
class OverviewCards extends UiComponent {
  /**
   * Updates the 'Now' and 'Today' cards from a forecast response.
   *
   * @param {Object} apiData - Forecast data returned by WeatherApi.fetchWeatherData().
   * @param {Object} [apiData.current] - Current conditions (temperature, humidity, wind...).
   * @param {Object} [apiData.daily] - Daily values; index 0 is today.
   */
  render(apiData) {
    // Prevents execution if API payload is undefined or null.
    if (!apiData) return;

    // Destructures current and daily data objects from the main API response payload.
    const current = apiData.current || {};
    const daily = apiData.daily || {};

    const temp = current.temperature_2m !== undefined ? Math.round(current.temperature_2m) : "--";
    const feelsLike = current.apparent_temperature !== undefined ? Math.round(current.apparent_temperature) : "--";
    const humidity = current.relative_humidity_2m !== undefined ? current.relative_humidity_2m : "--";
    const rainfall = current.precipitation !== undefined ? current.precipitation : 0;
    const windSpeed = current.wind_speed_10m !== undefined ? Math.round(current.wind_speed_10m) : "--";

    const windDir = WeatherFormatter.getWindDirectionName(current.wind_direction_10m);
    const iconClass = WeatherIcons.getNowIconClass(current);

    // NOW CARD updates
    this.setText("nowTemp", `${temp}°`);
    this.setText("nowFeelsLike", `${feelsLike}°`);
    this.setText("nowHumidity", `Humidity: ${humidity}%`);
    this.setText("nowRainfall", `Rainfall since 9am: ${rainfall}mm`);
    this.setText("nowWind", `Wind: ${windDir} ${windSpeed} km/h`);

    // Obtains reference to the primary weather condition icon element.
    const iconEl = this.getElement("nowIcon");
    // Applies dynamic icon CSS classes if the DOM element exists.
    if (iconEl) iconEl.className = `bi ${iconClass} display-2 me-3`;

    // TODAY CARD updates: min/max temperatures, sunrise/sunset, UV and rain probability.
    if (daily.temperature_2m_min && daily.temperature_2m_min[0] !== undefined) {
      this.setText("todayMin", `${Math.round(daily.temperature_2m_min[0])}°`);
    }
    if (daily.temperature_2m_max && daily.temperature_2m_max[0] !== undefined) {
      this.setText("todayMax", `${Math.round(daily.temperature_2m_max[0])}°`);
    }
    if (daily.sunrise && daily.sunrise[0]) {
      this.setText("todaySunrise", `Sunrise: ${WeatherFormatter.formatTime12h(daily.sunrise[0])}`);
    }
    if (daily.sunset && daily.sunset[0]) {
      this.setText("todaySunset", `Sunset: ${WeatherFormatter.formatTime12h(daily.sunset[0])}`);
    }
    if (daily.uv_index_max && daily.uv_index_max[0] !== undefined) {
      this.setText("todayUv", `UV Alert: ${daily.uv_index_max[0]}`);
    }
    if (daily.precipitation_probability_max && daily.precipitation_probability_max[0] !== undefined) {
      this.setText("todayRainChance", `Rain chance: ${daily.precipitation_probability_max[0]}%`);
    }
  }
}

/**
 * Draws the horizontally scrolling row of hourly forecast cards.
 *
 * Parent class: UiComponent.
 */
class HourlyForecast extends UiComponent {
  /**
   * Draws the next hours of the forecast, starting from the current hour.
   * How many cards are shown is set by CONFIG.forecast.hourlyCardsToShow.
   *
   * @param {Object} apiData - Forecast data returned by WeatherApi.fetchWeatherData().
   * @param {Object} apiData.hourly - Hourly values (time, temperature_2m, precipitation_probability, is_day, weather_code).
   * @param {Object} [apiData.current] - Current conditions; its time marks where the cards start.
   */
  render(apiData) {
    // Obtains container DOM element reference for injecting hourly item HTML.
    const hourlyContainer = this.getElement("hourlyContainer");
    if (!hourlyContainer || !apiData || !apiData.hourly || !apiData.hourly.time) return;

    const hourlyData = apiData.hourly;

    // Use the API's current time for the target city (e.g., "2026-10-01T23:00")
    // This automatically adjusts to any global city's local time.
    const currentCityTimeString = apiData.current && apiData.current.time ? apiData.current.time : null;

    let startIndex = -1;
    if (currentCityTimeString) {
      // Find the index in the hourly array that matches or comes right after the city's current local time
      startIndex = hourlyData.time.findIndex(timeStr => timeStr >= currentCityTimeString);
    }

    // Fallback if currentCityTimeString is missing
    if (startIndex === -1) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hour = String(now.getHours()).padStart(2, "0");
      const currentHourStr = `${year}-${month}-${day}T${hour}:00`;
      startIndex = hourlyData.time.findIndex(timeStr => timeStr >= currentHourStr);
    }

    if (startIndex === -1) startIndex = 0;

    let itemsHtml = "";
    const hoursToShow = this.config.forecast.hourlyCardsToShow;

    // Iterates through the next hourly entries starting from calculated index.
    for (let i = startIndex; i < Math.min(startIndex + hoursToShow, hourlyData.time.length); i++) {
      const timeStr = hourlyData.time[i]; // e.g., "2026-10-01T23:00"

      // Extract the hour portion directly from the string (characters 11 and 12)
      const hourPart = parseInt(timeStr.substring(11, 13), 10);

      // Format into 12-hour AM/PM time
      const ampm = hourPart >= 12 ? "PM" : "AM";
      let formattedHour = hourPart % 12;
      formattedHour = formattedHour ? formattedHour : 12; // convert 0 to 12

      const isNow = (i === startIndex);
      const hourLabel = isNow ? "Now" : `${formattedHour} ${ampm}`;

      const temp = Math.round(hourlyData.temperature_2m[i]);
      const rainProb = hourlyData.precipitation_probability ? hourlyData.precipitation_probability[i] : 0;

      const isDay = hourlyData.is_day ? hourlyData.is_day[i] : 1;
      const weatherCode = hourlyData.weather_code ? hourlyData.weather_code[i] : 0;

      const iconClass = WeatherIcons.getNowIconClass({
        weather_code: weatherCode,
        precipitation: 0,
        is_day: isDay
      });

      // Appends HTML template string for current hourly column card.
      itemsHtml += `
        <div class="text-center px-3 py-2 border-end flex-shrink-0" style="min-width: 85px;">
          <small class="text-muted d-block fw-semibold">${hourLabel}</small>
          <i class="bi ${iconClass} fs-4 my-1 d-block"></i>
          <span class="fw-bold d-block">${temp}°</span>
          <small class="text-muted"><i class="bi bi-droplet-fill text-primary small"></i> ${rainProb}%</small>
        </div>
      `;
    }
    hourlyContainer.innerHTML = itemsHtml;
  }
}

/**
 * Draws the multi-day forecast cards (starting from tomorrow).
 *
 * Parent class: UiComponent.
 */
class DailyForecast extends UiComponent {
  /** Weekday names, indexed to match JavaScript's Date.getDay() (0 = Sunday). */
  static #DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /**
   * Draws one card per upcoming day.
   *
   * @param {Object} apiData - Forecast data returned by WeatherApi.fetchWeatherData().
   * @param {Object} apiData.daily - Daily values (time, temperature_2m_max/min, precipitation_probability_max...).
   */
  render(apiData) {
    const dailyData = apiData && apiData.daily;
    // Obtains daily forecast container element reference.
    const dailyContainer = this.getElement("dailyContainer");
    if (!dailyContainer || !dailyData || !dailyData.time) return;

    let cardsHtml = '<div class="row row-cols-2 row-cols-md-4 row-cols-lg-6 g-3">';

    // Loops through upcoming daily weather array elements starting from index 1 (Tomorrow).
    for (let i = 1; i < dailyData.time.length; i++) {
      const dateObj = new Date(dailyData.time[i] + "T00:00:00");
      const dayName = i === 1 ? "Tomorrow" : DailyForecast.#DAY_NAMES[dateObj.getDay()];
      const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
      const maxTemp = Math.round(dailyData.temperature_2m_max[i]);
      const minTemp = Math.round(dailyData.temperature_2m_min[i]);

      const rainChance = dailyData.precipitation_probability_max ? dailyData.precipitation_probability_max[i] : 0;

      // Determine icon directly based on the rain chance percentage for daily cards
      const iconClass = WeatherIcons.getDailyIconClass(rainChance);

      cardsHtml += `
        <div class="col">
          <div class="card h-100 border-0 shadow-sm text-center p-3 rounded-4 bg-white">
            <div class="fw-bold text-dark small">${dayName}</div>
            <div class="text-muted small mb-2">${dateStr}</div>
            <i class="bi ${iconClass} fs-2 my-2 d-block"></i>
            <div class="fw-bold fs-5 text-dark">${maxTemp}° <span class="text-muted fs-6 fw-normal">${minTemp}°</span></div>
            <small class="text-primary fw-semibold d-block mt-2">
              <i class="bi bi-droplet-fill me-1"></i>${rainChance}%
            </small>
          </div>
        </div>
      `;
    }

    cardsHtml += "</div>";
    dailyContainer.innerHTML = cardsHtml;
  }
}

/**
 * Checks the forecast against the warning rules in CONFIG.warnings and
 * shows or hides the weather warning panel.
 *
 * Parent class: UiComponent.
 */
class WeatherWarnings extends UiComponent {
  /**
   * Builds the list of active warnings and displays them (or hides the panel if there are none).
   *
   * @param {Object} apiData - Forecast data returned by WeatherApi.fetchWeatherData().
   * @param {Object} [apiData.daily] - Daily values; its first date is used as the issue date.
   * @param {Object} [apiData.hourly] - Hourly values; wind speeds are checked against the threshold.
   */
  render(apiData) {
    // Selects DOM elements for warning section wrapper, collapsible header, and inner content container.
    const warningSection = this.getElement("warningSection");
    const warningTitle = this.getElement("warningTitle");
    const warningContent = this.getElement("warningContent");

    // Exits early if warning section component does not exist in DOM.
    if (!warningSection) return;

    // Destructures daily and hourly records from API response data.
    const daily = apiData.daily || {};
    const hourly = apiData.hourly || {};
    const rules = this.config.warnings;

    // Extracts hourly wind speeds and calculates maximum gust speed across forecast period.
    const windArray = hourly.wind_speed_10m || hourly.windspeed_10m || [];
    const maxWind = windArray.length > 0 ? Math.max(...windArray) : 0;
    const todayDate = daily.time ? daily.time[0] : new Date().toISOString().split("T")[0];
    const formattedToday = WeatherFormatter.formatWarningDate(todayDate);

    const activeWarnings = [];

    // Evaluates if wind speeds equal or exceed the severe weather threshold from CONFIG.
    if (maxWind >= rules.windThresholdKmh) {
      // Pushes constructed warning data object into active warnings array.
      activeWarnings.push({
        title: rules.windTitle,
        agency: rules.windAgency,
        summary: `Peak wind gusts up to ${Math.round(maxWind)} km/h recorded.`,
        issued: `Issued for ${formattedToday}`,
        details: `<p class="mb-2">Strong wind conditions active across coastal zones reaching speeds of ${Math.round(maxWind)} km/h.</p>`
      });
    }

    // Displays warning panel if active warnings exist; hides panel otherwise.
    if (activeWarnings.length > 0) {
      // Unhides warning section banner by removing Bootstrap 'd-none' utility class.
      warningSection.classList.remove("d-none");
      // Updates warning title text with active warning count.
      if (warningTitle) warningTitle.textContent = `View ${activeWarnings.length} weather warning${activeWarnings.length > 1 ? "s" : ""}`;

      // Renders expandable accordion HTML components for each active warning item.
      if (warningContent) {
        // Maps active warning objects into markup cards and updates container inner HTML.
        warningContent.innerHTML = activeWarnings.map((w, index) => `
          <div class="card border-0 mb-2 shadow-sm">
            <button
              class="btn text-start p-3 fw-bold border-0 d-flex align-items-center bg-white rounded w-100 collapsed"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#collapseAlert${index}"
              aria-expanded="false"
            >
              <i class="bi bi-caret-down-fill me-2 fs-6 toggle-arrow"></i>
              <span>${w.title}</span>
            </button>

            <div class="collapse border-top" id="collapseAlert${index}">
              <div class="p-3 bg-white text-dark small">
                <p class="mb-1 text-secondary fw-semibold">${w.agency}</p>
                <p class="fw-bold mb-2">${w.summary}</p>
                <p class="text-muted mb-3">${w.issued}</p>
                <hr class="my-2">
                <div>${w.details}</div>
              </div>
            </div>
          </div>
        `).join("");
      }
    } else {
      // Hides warning section banner when no warnings are active.
      warningSection.classList.add("d-none");
    }
  }
}

/**
 * The autocomplete dropdown under the search box. It shows the suggestions
 * and tells its owner which one the user picked; it does not decide what
 * happens next.
 *
 * Parent class: UiComponent.
 */
class SearchSuggestions extends UiComponent {
  /** Function called with { lat, lon, name } when the user picks a suggestion. */
  #onSelect;

  /**
   * Creates the suggestions dropdown.
   *
   * @param {Function} onSelect - Called with { lat, lon, name } when a suggestion is clicked.
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(onSelect, config = CONFIG) {
    super(config);
    this.#onSelect = onSelect;
  }

  /**
   * Fills the dropdown with one button per location and shows it.
   *
   * @param {Object[]} locations - Places returned by GeocodingApi.fetchLocationSuggestions().
   */
  render(locations) {
    // Obtains search suggestions dropdown element reference.
    const dropdown = this.getElement("searchSuggestions");
    if (!dropdown) return;

    dropdown.innerHTML = locations.map(loc => {
      const stateCountry = [loc.admin1 === loc.name ? null : loc.admin1, loc.country].filter(Boolean).join(", ");
      return `
        <button
          type="button"
          class="dropdown-item py-2 px-3 text-truncate suggestion-item"
          data-lat="${loc.latitude}"
          data-lon="${loc.longitude}"
          data-name="${loc.name}, ${stateCountry}"
        >
          <i class="bi bi-geo-alt me-2 text-muted"></i>
          <strong>${loc.name}</strong>
          <small class="text-muted ms-1">${stateCountry}</small>
        </button>
      `;
    }).join("");

    dropdown.classList.remove("d-none");
    dropdown.classList.add("show");

    dropdown.querySelectorAll(".suggestion-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const lat = parseFloat(btn.getAttribute("data-lat"));
        const lon = parseFloat(btn.getAttribute("data-lon"));
        const name = btn.getAttribute("data-name");

        // Puts the chosen name into the search box.
        const input = this.getElement("searchInput");
        if (input) input.value = name;

        // The owner decides what to do with the choice (update map, load forecast).
        this.#onSelect({ lat, lon, name });
        this.hide();
      });
    });
  }

  /** Hides and closes the search suggestions autocomplete dropdown menu. */
  hide() {
    const dropdown = this.getElement("searchSuggestions");
    if (dropdown) {
      dropdown.classList.add("d-none");
      dropdown.classList.remove("show");
    }
  }
}

/**
 * Draws the weather cards after the user clicks the map. It uses a simpler
 * layout than the cards shown for searches (OverviewCards, HourlyForecast
 * and DailyForecast), and reads the smaller dataset requested by
 * WeatherApi.fetchWeatherByCoords().
 *
 * Parent class: UiComponent.
 */
class MapClickRenderer extends UiComponent {
  /**
   * Updates the 'Now' card, the 'Today' card, the hourly cards and the daily cards.
   *
   * @param {Object} data - Forecast data returned by WeatherApi.fetchWeatherByCoords().
   * @param {Object} data.current - Current conditions (temperature, humidity, wind, time...).
   * @param {Object} [data.hourly] - Hourly values.
   * @param {Object} [data.daily] - Daily values.
   */
  render(data) {
    this.#renderNowCard(data.current);
    if (data.daily) this.#renderTodayCard(data.daily);
    if (data.hourly) this.#renderHourly(data);
    if (data.daily) this.#renderDaily(data);
  }

  /**
   * Fills the 'Now' card.
   *
   * @param {Object} current - Current conditions from the forecast response.
   */
  #renderNowCard(current) {
    this.getElement("nowTemp").textContent = `${Math.round(current.temperature_2m)}°`;
    const feelsLikeEl = this.getElement("nowFeelsLike");
    if (feelsLikeEl) feelsLikeEl.textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;

    this.getElement("nowHumidity").textContent = `Humidity: ${current.relative_humidity_2m}%`;
    this.getElement("nowRainfall").textContent = `Rainfall: ${current.precipitation}mm`;
    this.getElement("nowWind").textContent = `Wind: N ${current.wind_speed_10m} km/h`;
  }

  /**
   * Fills the 'Today' card (minimum, maximum, sunrise and sunset).
   *
   * @param {Object} daily - Daily values from the forecast response; index 0 is today.
   */
  #renderTodayCard(daily) {
    const dom = this.config.dom;
    const minEl = this.queryElement(dom.legacyTodayMin);
    const maxEl = this.queryElement(dom.legacyTodayMax);
    if (minEl) minEl.textContent = `${Math.round(daily.temperature_2m_min[0])}°`;
    if (maxEl) maxEl.textContent = `${Math.round(daily.temperature_2m_max[0])}°`;

    // Format and update Sunrise / Sunset if elements exist
    const sunriseEl = this.queryElement(dom.legacySunrise);
    const sunsetEl = this.queryElement(dom.legacySunset);
    if (sunriseEl && daily.sunrise) {
      const sunriseTime = new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      sunriseEl.textContent = `Sunrise: ${sunriseTime}`;
    }
    if (sunsetEl && daily.sunset) {
      const sunsetTime = new Date(daily.sunset[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      sunsetEl.textContent = `Sunset: ${sunsetTime}`;
    }
  }

  /**
   * Draws the hourly cards, starting from the current hour.
   *
   * @param {Object} data - Forecast data; uses data.current.time and data.hourly.
   */
  #renderHourly(data) {
    const hourlyContainer = this.getElement("hourlyContainer");
    if (!hourlyContainer) return;

    hourlyContainer.innerHTML = ""; // Clear existing cards

    // Find current hour index in the API response to align "Now" correctly
    const currentIsoTime = data.current.time; // e.g., "2026-10-20T23:00"
    let startIndex = 0;
    if (data.hourly.time) {
      const foundIndex = data.hourly.time.findIndex(t => t >= currentIsoTime);
      if (foundIndex !== -1) startIndex = foundIndex;
    }

    // Loop through the configured number of hours starting from the current time index
    for (let i = 0; i < this.config.forecast.mapClickHourlyHours; i++) {
      const index = startIndex + i;
      if (index >= data.hourly.time.length) break;

      const timeStr = data.hourly.time[index];
      const temp = Math.round(data.hourly.temperature_2m[index]);
      const weatherCode = data.hourly.weather_code ? data.hourly.weather_code[index] : 0;
      const rainChance = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[index] : 0;

      // Format time: "Now" for the first card, then formatted local hour (e.g., "12 AM", "1 AM")
      const dateObj = new Date(timeStr);
      const timeLabel = i === 0
        ? "Now"
        : dateObj.toLocaleTimeString(this.config.locale.hourLabelLocale, { hour: "numeric", hour12: true });

      // Get styled icon
      const iconHTML = WeatherIcons.getHtmlIcon(weatherCode);

      hourlyContainer.innerHTML += `
        <div class="text-center px-3 flex-shrink-0" style="min-width: 65px;">
          <div class="small text-muted mb-1">${timeLabel}</div>
          <div class="my-2">${iconHTML}</div>
          <div class="fw-bold mb-1">${temp}°</div>
          <div class="small text-primary" style="font-size: 0.75rem;">
            <i class="bi bi-drop-fill" style="font-size: 0.65rem;"></i>${rainChance}%
          </div>
        </div>
      `;
    }
  }

  /**
   * Draws the daily cards, starting from tomorrow.
   *
   * @param {Object} data - Forecast data; uses data.daily and, if present, data.hourly.
   */
  #renderDaily(data) {
    const dailyContainer = this.getElement("dailyContainer");
    if (!dailyContainer) return;

    let dailyHTML = '<div class="d-flex gap-3 overflow-auto py-2">';

    for (let i = 1; i <= this.config.forecast.mapClickDailyDays; i++) {
      const dateStr = data.daily.time[i];
      const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
      const minTemp = Math.round(data.daily.temperature_2m_min[i]);
      const rainChance = data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[i] : 0;

      const dateObj = new Date(dateStr);
      const dayName = i === 1
        ? "Tomorrow"
        : dateObj.toLocaleDateString(this.config.locale.hourLabelLocale, { weekday: "long" });
      const monthDay = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

      // Find the hourly weather code closest to 12:00 PM (noon) for this day
      let weatherCode = 0;
      if (data.hourly && data.hourly.time && data.hourly.weather_code) {
        // Find the index in hourly data where the date matches this daily date at roughly 12:00
        const targetDateStr = dateStr.split("T")[0]; // e.g., "2026-10-23"
        const noonIndex = data.hourly.time.findIndex(t => t.startsWith(targetDateStr) && t.includes("12:00"));

        // Fallback to the first hour of that day if 12:00 isn't found
        const fallbackIndex = data.hourly.time.findIndex(t => t.startsWith(targetDateStr));

        const exactIndex = noonIndex !== -1 ? noonIndex : (fallbackIndex !== -1 ? fallbackIndex : i * 24);
        weatherCode = data.hourly.weather_code[exactIndex] ?? 0;
      } else if (data.daily.weather_code) {
        weatherCode = data.daily.weather_code[i];
      }

      const iconHTML = WeatherIcons.getHtmlIcon(weatherCode);

      const rainDisplay = rainChance > 0
        ? `<div class="small text-primary fw-semibold mt-1"><i class="bi bi-drop-fill me-1"></i>${rainChance}%</div>`
        : `<div class="small text-muted mt-1">${rainChance}%</div>`;

      dailyHTML += `
        <div class="card p-3 border-0 shadow-sm text-center rounded-4 bg-white flex-shrink-0" style="min-width: 125px;">
          <div class="fw-bold">${dayName}</div>
          <div class="small text-muted mb-2">${monthDay}</div>
          <div class="my-2">${iconHTML}</div>
          <div class="my-2">
            <span class="fw-bold fs-5">${maxTemp}°</span>
            <span class="text-muted ms-1">${minTemp}°</span>
          </div>
          ${rainDisplay}
        </div>
      `;
    }
    dailyHTML += "</div>";
    dailyContainer.innerHTML = dailyHTML;
  }
}

/**
 * Draws the temperature trend line chart with the Chart.js library.
 *
 * Parent class: UiComponent.
 */
class TemperatureChart extends UiComponent {
  /** The Chart.js chart currently on screen (null until the first render); kept so it can be destroyed before redrawing. */
  #chart = null;

  /**
   * Draws a temperature line chart for the next hours (CONFIG.forecast.chartHours),
   * replacing any chart drawn earlier.
   *
   * @param {Object} apiData - Forecast data from either weather request.
   * @param {Object} apiData.hourly - Hourly values (time and temperature_2m).
   */
  render(apiData) {
    const hourlyData = apiData && apiData.hourly;
    // Fetches HTML5 canvas element context by its configured ID.
    const ctx = this.getElement("tempTrendChart");
    // Exits method if canvas element, hourly data, or time sequence is missing.
    if (!ctx || !hourlyData || !hourlyData.time) return;

    const style = this.config.chart;

    // Creates Date object representing current timestamp.
    const now = new Date();

    // Determines starting index in hourly timeline matching current hour.
    let startIndex = hourlyData.time.findIndex(timeStr => {
      const timeObj = new Date(timeStr);
      return timeObj.getHours() === now.getHours() && timeObj.getDate() === now.getDate();
    });

    // Defaults start index to 0 if match is not found.
    if (startIndex === -1) startIndex = 0;

    // Arrays to store chart X-axis labels and Y-axis temperature values.
    const labels = [];
    const temps = [];

    // Populates data points for the configured number of sequential hourly intervals.
    const endIndex = Math.min(startIndex + this.config.forecast.chartHours, hourlyData.time.length);
    for (let i = startIndex; i < endIndex; i++) {
      // Parses current hourly date-time string.
      const timeObj = new Date(hourlyData.time[i]);
      const isNow = (i === startIndex);
      // Pushes formatted hour string to labels and rounded temperature value to dataset.
      labels.push(isNow ? "Now" : timeObj.toLocaleTimeString(this.config.locale.hourLabelLocale, { hour: "numeric", hour12: true }));
      temps.push(Math.round(hourlyData.temperature_2m[i]));
    }

    // Destroys pre-existing Chart.js instance to prevent memory leaks and canvas overlaps.
    if (this.#chart) {
      this.#chart.destroy();
    }

    // Instantiates new Chart.js smooth area line chart with custom styling and tooltips.
    this.#chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: style.label,
          data: temps,
          borderColor: style.lineColor,
          backgroundColor: style.fillColor,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: style.lineColor,
          pointRadius: 3,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.y}°C`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: style.gridColor },
            ticks: { callback: (value) => `${value}°` }
          }
        }
      }
    });
  }
}


/* ==========================================================================
 * CONTROLLER CLASS
 * ========================================================================== */

/**
 * The controller of the application. It creates the data and display objects
 * and connects them:  user action -> API (fetch) -> display components / map.
 * It contains no fetching code and no page-drawing code of its own.
 *
 * Parent class: none.
 */
class WeatherDashboard {
  /** Shared settings from config.js. */
  #config;

  /** Fetches weather forecasts. */
  #weatherApi;

  /** Searches for places by name. */
  #geocodingApi;

  /** Converts map coordinates into a place name. */
  #reverseGeocodingApi;

  /** The Leaflet map. */
  #map;

  /** Shows the location name in the heading and page title. */
  #heading;

  /** The autocomplete dropdown under the search box. */
  #suggestions;

  /** Draws the cards shown after a map click. */
  #mapClickRenderer;

  /** The temperature chart (also listed in #forecastComponents; kept separately for map clicks). */
  #chart;

  /**
   * Every component that is redrawn when a forecast loads. They all extend
   * UiComponent, so the dashboard just calls render() on each one (polymorphism).
   */
  #forecastComponents;

  /**
   * Creates the dashboard and every object it uses.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    this.#config = config;

    // Data access objects
    this.#weatherApi = new WeatherApi(config);
    this.#geocodingApi = new GeocodingApi(config);
    this.#reverseGeocodingApi = new ReverseGeocodingApi(config);

    // Map and display objects
    this.#map = new WeatherMap(config);
    this.#heading = new LocationHeading(config);
    this.#mapClickRenderer = new MapClickRenderer(config);
    this.#chart = new TemperatureChart(config);
    this.#suggestions = new SearchSuggestions(
      ({ lat, lon, name }) => this.#selectSuggestion(lat, lon, name),
      config
    );

    // The components redrawn for every forecast, in the order they are drawn.
    this.#forecastComponents = [
      new OverviewCards(config),
      new WeatherWarnings(config),
      new HourlyForecast(config),
      new DailyForecast(config),
      this.#chart
    ];
  }

  /**
   * Starts the application: loads the default forecast and attaches all event listeners.
   */
  init() {
    // Triggers initial forecast fetch for the default location.
    this.loadForecast();

    // Map clicks
    this.#map.onClick((lat, lng) => this.#handleMapClick(lat, lng));

    // Search box and search button
    this.#bindSearchEvents();
  }

  /**
   * Fetches the forecast for a location and redraws every part of the dashboard.
   *
   * @param {number} [lat] - Latitude; defaults to the default location in CONFIG.
   * @param {number} [lon] - Longitude; defaults to the default location in CONFIG.
   * @param {string} [locationName] - Name shown in the heading; defaults to the default location in CONFIG.
   * @returns {Promise<void>} Resolves when the page has been updated.
   */
  async loadForecast(
    lat = this.#config.defaultLocation.latitude,
    lon = this.#config.defaultLocation.longitude,
    locationName = this.#config.defaultLocation.name
  ) {
    try {
      // Fetch full forecast dataset for given latitude and longitude.
      const data = await this.#weatherApi.fetchWeatherData(lat, lon);
      // Stops here if the request failed (the error has already been logged).
      if (!data) return;

      this.#heading.render(locationName);

      // Ask every forecast component to redraw itself with the fresh API data.
      this.#forecastComponents.forEach(component => component.render(data));
    } catch (error) {
      console.error("Failed to load forecast:", error);
    }
  }

  /**
   * Searches for a place by name and loads its forecast.
   *
   * @param {string} query - The place name typed by the user.
   * @returns {Promise<void>} Resolves when the search is finished.
   */
  async #searchLocation(query) {
    const result = await this.#geocodingApi.searchLocation(query);
    if (result) {
      await this.loadForecast(result.lat, result.lon, result.name);
    } else if (result === null) {
      // Displays browser alert notification if location could not be resolved.
      alert(this.#config.text.locationNotFound);
    }
  }

  /**
   * Fetches suggestions for the text typed so far and shows (or hides) the dropdown.
   *
   * @param {string} query - The text currently in the search box.
   * @returns {Promise<void>} Resolves when the dropdown has been updated.
   */
  async #showSuggestions(query) {
    const results = await this.#geocodingApi.fetchLocationSuggestions(query);
    if (results === null) return; // request failed, leave the dropdown as it is
    if (results.length > 0) {
      this.#suggestions.render(results);
    } else {
      this.#suggestions.hide();
    }
  }

  /**
   * Called when the user picks a suggestion: moves the map and loads that place's forecast.
   *
   * @param {number} lat - Latitude of the chosen place.
   * @param {number} lon - Longitude of the chosen place.
   * @param {string} name - Display name of the chosen place.
   */
  #selectSuggestion(lat, lon, name) {
    this.#map.focusOn(lat, lon);
    this.loadForecast(lat, lon, name);
  }

  /**
   * Called when the user clicks the map: marks the point, names it, and loads its weather.
   *
   * @param {number} lat - Latitude of the click.
   * @param {number} lng - Longitude of the click.
   * @returns {Promise<void>} Resolves when the place name has been shown (the weather loads in the background).
   */
  async #handleMapClick(lat, lng) {
    // 1. Move or create marker
    this.#map.setMarker(lat, lng);

    // 2. Fetch the actual city name from coordinates
    const locationName = await this.#reverseGeocodingApi.getCityNameFromCoords(lat, lng);

    // 3. Update the popup
    this.#map.setPopup(`<b>${locationName}</b><br>Lat: ${lat.toFixed(2)}, Lng: ${lng.toFixed(2)}`);

    // 4. Update the page title directly
    this.#heading.renderPageTitle(locationName);

    // 5. Fetch weather data for the clicked coordinates
    this.#loadWeatherByCoords(lat, lng);
  }

  /**
   * Loads and shows the weather for a map click. This uses a simpler layout
   * (MapClickRenderer) than a search does. To make map clicks look the same as
   * searches, replace the body of this method with a call to loadForecast().
   *
   * @param {number|string} lat - Latitude of the click.
   * @param {number|string} lng - Longitude of the click.
   * @returns {Promise<void>} Resolves when the weather has been shown.
   */
  async #loadWeatherByCoords(lat, lng) {
    const coords = WeatherFormatter.parseCoords(lat, lng);
    if (!coords) {
      console.error("Invalid coordinates received:", lat, lng);
      return;
    }

    // Force map update
    this.#map.panTo(coords.lat, coords.lng);
    this.#map.setMarker(coords.lat, coords.lng);

    try {
      const data = await this.#weatherApi.fetchWeatherByCoords(coords.lat, coords.lng);
      this.#mapClickRenderer.render(data);

      // Update the Chart.js trend graph
      this.#chart.render(data);

      // Update marker popup with the current conditions
      this.#map.setPopup(
        `<b>Temperature: ${Math.round(data.current.temperature_2m)}°C</b><br>Humidity: ${data.current.relative_humidity_2m}%`
      );
    } catch (error) {
      console.error("Error fetching weather:", error);
    }
  }

  /**
   * Attaches the event listeners for the search box, the search button and
   * clicks elsewhere on the page (which close the dropdown).
   */
  #bindSearchEvents() {
    // Queries DOM references for the search input and trigger button.
    const searchInput = document.getElementById(this.#config.dom.searchInput);
    const searchBtn = document.getElementById(this.#config.dom.searchBtn);
    let debounceTimer = null;

    if (searchInput) {
      // Live input typing suggestions, waiting a short time after the last keystroke
      searchInput.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value;

        debounceTimer = setTimeout(() => {
          this.#showSuggestions(query);
        }, this.#config.search.debounceMs);
      });

      // Enter key triggers immediate search on typed value
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.#suggestions.hide();
          this.#searchLocation(searchInput.value);
        }
      });
    }

    // Close dropdown if user clicks anywhere outside the search box
    document.addEventListener("click", (e) => {
      if (searchInput && !searchInput.contains(e.target)) {
        this.#suggestions.hide();
      }
    });

    // Binds explicit click listener to the search button element.
    if (searchBtn && searchInput) {
      searchBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.#suggestions.hide();
        this.#searchLocation(searchInput.value);
      });
    }
  }
}


/* ==========================================================================
 * START-UP
 * ========================================================================== */

// Single initialization point: creates the dashboard once the page has loaded.
document.addEventListener("DOMContentLoaded", () => {
  new WeatherDashboard().init();
});
