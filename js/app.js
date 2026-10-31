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

  /** Shows the location name in the heading and page title. */
  #heading;

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

    // Map and display objects
    this.#heading = new LocationHeading(config);

    // The components redrawn for every forecast, in the order they are drawn.
    this.#forecastComponents = [
      new OverviewCards(config),
      new HourlyForecast(config),
      new DailyForecast(config)
    ];
  }

  /**
   * Starts the application: loads the default forecast and attaches all event listeners.
   */
  init() {
    // Triggers initial forecast fetch for the default location.
    this.loadForecast();
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
}


/* ==========================================================================
 * START-UP
 * ========================================================================== */

// Single initialization point: creates the dashboard once the page has loaded.
document.addEventListener("DOMContentLoaded", () => {
  new WeatherDashboard().init();
});
