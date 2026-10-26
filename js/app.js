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
 * START-UP
 * ========================================================================== */

// Single initialization point: runs once the page has loaded.
document.addEventListener("DOMContentLoaded", () => {
  // The WeatherDashboard is created here once it has been added.
});
