/**
 * @file map.js
 * @description Wraps Leaflet map initialization, marker management, and click event reporting 
 * for the weather dashboard.
 * 
 * ---------------------------------------------------------------------------
 * OVERVIEW
 * Contains the WeatherMap class: everything to do with the Leaflet map.
 * It creates the map, keeps a single marker on it, moves and zooms the view,
 * and reports clicks. It knows nothing about weather; the WeatherDashboard
 * class in app.js decides what a click means.
 *
 * CLASSES: WeatherMap.
 * PARENT CLASSES: none (WeatherMap does not extend another class).
 *
 * REQUIRES (must be loaded before this script)
 *   - config.js ....... the CONFIG object (map element ID, tile URL, zoom levels)
 *   - Leaflet ......... the global L object
 *
 * USAGE: this file must be loaded BEFORE app.js, which creates a WeatherMap:
 *   <script src="config.js"></script>
 *   <script src="map.js"></script>
 *   <script src="app.js"></script>
 */

// Stops the script early, with a clear message, if config.js was not loaded first.
if (typeof CONFIG === "undefined") {
  throw new Error("config.js must be loaded before map.js");
}

/**
 * Wraps the Leaflet map: creates it, keeps a single marker on it, and reports
 * clicks. It knows nothing about weather; the WeatherDashboard decides what a
 * click means. Requires the Leaflet library (global L) to be loaded.
 *
 * Parent class: none.
 */
class WeatherMap {
  /** Shared settings from config.js (map ID, tile URL, zoom levels). */
  #config;

  /** The Leaflet map object. */
  #map;

  /** The one marker on the map (null until the first location is chosen), kept so it can be moved instead of duplicated. */
  #marker = null;

  /**
   * Creates the map, centred on the default location, with the OpenStreetMap background.
   *
   * @param {Object} [config=CONFIG] - Configuration object; defaults to the global CONFIG from config.js.
   */
  constructor(config = CONFIG) {
    this.#config = config;
    const start = config.defaultLocation;

    // Initialize the map centered on the default location at the configured zoom level
    this.#map = L.map(config.dom.map).setView([start.latitude, start.longitude], config.map.initialZoom);

    // Add OpenStreetMap tile layer (the background map imagery)
    L.tileLayer(config.map.tileUrl, {
      maxZoom: config.map.maxZoom,
      attribution: config.map.attribution
    }).addTo(this.#map);
  }

  /**
   * Registers a function to call whenever the user clicks the map.
   *
   * @param {Function} handler - Called as handler(lat, lng) with the coordinates of the click.
   */
  onClick(handler) {
    this.#map.on("click", (e) => handler(e.latlng.lat, e.latlng.lng));
  }

  /**
   * Moves the marker to a point, creating it on first use.
   *
   * @param {number} lat - Latitude to place the marker at.
   * @param {number} lng - Longitude to place the marker at.
   */
  setMarker(lat, lng) {
    if (this.#marker) {
      this.#marker.setLatLng([lat, lng]);
    } else {
      this.#marker = L.marker([lat, lng]).addTo(this.#map);
    }
  }

  /**
   * Sets the text of the marker's popup bubble and opens it.
   *
   * @param {string} html - The popup content (HTML allowed).
   */
  setPopup(html) {
    if (this.#marker) {
      this.#marker.bindPopup(html).openPopup();
    }
  }

  /**
   * Smoothly pans the map to a point and sets the zoom level (used after a map click).
   *
   * @param {number} lat - Latitude to move to.
   * @param {number} lng - Longitude to move to.
   * @param {number} [zoom] - Zoom level; defaults to CONFIG.map.locationZoom.
   */
  panTo(lat, lng, zoom = this.#config.map.locationZoom) {
    this.#map.panTo([lat, lng]);
    this.#map.setZoom(zoom);
  }

  /**
   * Jumps to a point, moves the marker there and refreshes the tiles
   * (used after the user picks a search suggestion).
   *
   * @param {number} lat - Latitude to move to.
   * @param {number} lng - Longitude to move to.
   * @param {number} [zoom] - Zoom level; defaults to CONFIG.map.locationZoom.
   */
  focusOn(lat, lng, zoom = this.#config.map.locationZoom) {
    this.#map.setView([lat, lng], zoom);
    this.setMarker(lat, lng);
    // Refresh map canvas tile rendering
    setTimeout(() => {
      this.#map.invalidateSize();
    }, this.#config.map.refreshDelayMs);
  }
}
