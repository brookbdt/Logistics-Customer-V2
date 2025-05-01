<script lang="ts">
  import { browser } from "$app/environment";
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { signOut } from "@auth/sveltekit/client";
  import { superForm } from "sveltekit-superforms/client";
  import { fade, fly, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { onMount } from "svelte";
  import type { ActionResult } from "@sveltejs/kit";
  import type { SubmitFunction } from "@sveltejs/kit";

  // Icons
  import Camera from "$lib/assets/shared/camera-icon.svelte";
  import LocationIcon from "$lib/assets/shared/location-icon.svelte";
  import BusinessIcon from "$lib/assets/shared/business-icon.svelte";
  import PersonIcon from "$lib/assets/shared/person-icon.svelte";
  import EditIcon from "$lib/assets/shared/edit-icon.svelte";
  import ProfilePlaceholder from "$lib/assets/shared/profile-placeholder.svelte";

  // Components
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import Spinner from "$lib/components/spinner.svelte";
  import { toast } from "@zerodevx/svelte-toast";

  // Define the type for our data
  interface PageData {
    imgUrl: string;
    proxyImgUrl?: string;
    session: any; // Replace 'any' with proper session type if available
    customerInformationForm: any; // Replace 'any' with proper form type if available
  }

  interface UploadResponse {
    success?: boolean;
    data?: {
      imgUrl?: string;
    };
    errorMessage?: string;
  }

  export let data: PageData;
  export let form;

  // $: console.log("data", data);
  // Function to show toast notifications
  function showNotification(
    message: string,
    type: "success" | "error" | "info" = "info",
    duration = 3000
  ) {
    toast.push(message, {
      duration,
      theme: {
        "--toastColor":
          type === "success"
            ? "#008000"
            : type === "error"
              ? "#FF0000"
              : "#000000",
        "--toastBackground": "#FFFFFF",
        "--toastBarBackground":
          type === "success"
            ? "#008000"
            : type === "error"
              ? "#FF0000"
              : "#000000",
      },
    });
  }

  const {
    form: customerInformationForm,
    enhance: customerInformationEnhance,
    allErrors,
    constraints,
    submitting,
    delayed,
    message,
  } = superForm(data.customerInformationForm, {
    onSubmit: () => {
      // The form is already being submitted by SuperForm, we just need to set state
      isSavingInProgress = true;
      return undefined; // Don't prevent default submission behavior
    },
    resetForm: false,
    taintedMessage: false,
    validators: {
      email: (value) => {
        if (!value) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          return "Invalid email format";
        return;
      },
      phoneNumber: (value) => {
        if (!value) return "Phone number is required";
        return;
      },
    },
    onResult: ({ result }) => {
      console.log(result);

      if (result.type === "success") {
        // Show success notification
        showNotification("Profile updated successfully!", "success", 4000);

        // Reset state
        hasUnsavedChanges = false;
        isSavingInProgress = false;
        showSaveBar = false;

        // Wait a moment to show the success notification before navigating
        setTimeout(() => {
          // Go to home page if customer type is set, otherwise stay on the page
          if (data.session?.customerData.customerType) {
            goto("/");
          } else {
            // If this was the first time setting up profile, show welcome message
            showNotification(
              "Welcome! Your profile is now ready.",
              "success",
              4000
            );
            // Stay on the page and switch to view mode
            isEditMode = false;
          }
        }, 1500);
      } else if (result.type === "error") {
        // Technical error (server/network related)
        console.error("Error submitting form:", result.error);
        showNotification(
          "Something went wrong. Please try again later.",
          "error",
          5000
        );
        isSavingInProgress = false;
      } else if (result.type === "failure") {
        // Validation or business logic error
        const errorMsg =
          result.data?.errorMessage ||
          "Please check your information and try again.";
        console.log("Form submission failed:", errorMsg);
        showNotification(errorMsg, "error", 5000);
        isSavingInProgress = false;

        // If there's form-specific errors, we let the form validation UI handle it
        // The toast is for unexpected errors
      }
    },
    onUpdate: ({ form }) => {
      // This will run when the form is updated
      hasUnsavedChanges = true;
    },
  });

  let isUploadingImage = false;
  let isDeletingImage = false;
  let isEditMode = !data.session?.customerData.customerType;
  let hasUnsavedChanges = false;
  let formSection: "personal" | "business" | "location" = "personal";
  let mapExpanded = false;
  let coordinatesError = "";
  let isSavingInProgress = false;
  let showSaveBar = false;

  // Map location handling
  let center = [9.0046464, 38.797312];
  let zoom = 12;
  let isGettingLocation = false;
  let mapElement: HTMLElement | null = null;
  let map: google.maps.Map | null = null;
  let marker: google.maps.Marker | null = null;
  let geocoder: google.maps.Geocoder | null = null;
  let addressFromCoordinates = "";
  let isGeocodingAddress = false;
  let geocodeTimer: ReturnType<typeof setTimeout> | null = null;
  let searchQuery = "";
  let searchResults: google.maps.places.PlaceResult[] = [];
  let isSearching = false;
  let placesService: google.maps.places.PlacesService | null = null;
  let searchBox: google.maps.places.SearchBox | null = null;
  let mapActionMode: "search" | "place" = "place";
  let isMapReady = false;
  let mapInteractionHistory: { lat: number; lng: number }[] = [];
  let activeMapHint = "";
  let mapKey = 0; // Add this to force map reinitialization

  // Add this to keep track of the map's status (to help with debugging)
  let mapStatus = {
    isLoaded: false,
    error: null as string | null,
    lastUpdate: null as string | null,
  };

  // Separate fields for latitude and longitude
  let latInput = "";
  let lngInput = "";

  // Function to show active map hint with auto-dismiss
  function showMapHint(message: string, duration = 3000) {
    activeMapHint = message;
    if (duration > 0) {
      setTimeout(() => {
        if (activeMapHint === message) {
          activeMapHint = "";
        }
      }, duration);
    }
  }

  // Initialize map position from user data or get current location
  onMount(() => {
    initializeLocation();

    // Show save bar when changes are made
    const unsubscribe = customerInformationForm.subscribe(() => {
      if (isEditMode && !showSaveBar) {
        showSaveBar = true;
      }
    });

    return () => {
      unsubscribe();
    };
  });

  function initializeLocation() {
    // Try to use saved location if available
    let [mapLat, mapLng] =
      $customerInformationForm.mapAddress?.split(",") || [];

    if (mapLat && mapLng && !isNaN(Number(mapLat)) && !isNaN(Number(mapLng))) {
      center = [Number(mapLat), Number(mapLng)];
      // Initialize coordinate inputs
      latInput = center[0].toString();
      lngInput = center[1].toString();
    } else if (browser) {
      // Otherwise try to get user's current location
      getUserLocation();
    }
  }

  // Watch for form section changes to reinitialize map when switching to location tab
  let isLocationTabActive = false;
  $: {
    if (formSection === "location") {
      if (!isLocationTabActive) {
        // First time entering location tab in this session
        isLocationTabActive = true;

        // Reset map key to force a full re-render and initialization
        setTimeout(() => {
          mapKey = Date.now(); // Use timestamp for guaranteed uniqueness
          console.log("Map key updated for initialization:", mapKey);
          showMapHint("Map is loading... Please wait.", 3000);
        }, 100); // Slightly longer delay for DOM update
      }
    } else {
      isLocationTabActive = false; // Reset when leaving the tab
    }
  }

  // Simplify map interaction modes - consolidate to just "search" or "place" (combining browse & pin)
  function setMapMode(mode: "search" | "place") {
    mapActionMode = mode;

    if (mode === "search") {
      showMapHint("Enter a location name or address to search", 5000);
    } else {
      // Place mode (consolidating browse and pin)
      showMapHint(
        "Move the map or tap anywhere to place your location pin",
        5000
      );
    }
  }

  // Real-time search as user types (debounced)
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastSearchQuery = ""; // Track the last executed search query

  function handleSearchInput() {
    // Clear any existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Only search if the query has changed from last search
    if (
      searchQuery &&
      searchQuery.length > 2 &&
      searchQuery !== lastSearchQuery
    ) {
      searchTimeout = setTimeout(() => {
        searchPlaces();
        lastSearchQuery = searchQuery; // Update the last search query
      }, 500);
    }
  }

  // Search for places
  async function searchPlaces() {
    if (!searchQuery.trim() || !isMapReady || isSearching) return;

    isSearching = true;
    showMapHint("Searching for location...");

    // Clear existing errors
    coordinatesError = "";

    try {
      // Make sure geocoder exists
      if (!geocoder && google) {
        geocoder = new google.maps.Geocoder();
      }

      if (!geocoder) {
        throw new Error("Map services not available yet");
      }

      // Use place search instead of geocoding if available
      if (placesService) {
        try {
          // First try a place search (more accurate for landmarks, businesses)
          const request = {
            query: searchQuery,
            fields: ["name", "geometry"],
          };

          // Use simpler textSearch to find places
          placesService.textSearch(request, (results, status) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              results &&
              results.length > 0
            ) {
              // Use the first result
              const place = results[0];
              const location = place.geometry?.location;

              if (location) {
                // Successfully found a place
                updateCoordinatesFromMap(location.lat(), location.lng(), true);

                // Update the marker to be more visible
                if (marker) {
                  marker.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: "#FF0000",
                    fillOpacity: 0.8,
                    strokeColor: "#FFFFFF",
                    strokeWeight: 2,
                    scale: 10,
                  });

                  // Add bounce animation to draw attention
                  marker.setAnimation(google.maps.Animation.BOUNCE);
                  setTimeout(() => {
                    if (marker) marker.setAnimation(null);
                  }, 1500);
                }

                showMapHint(
                  `Found: ${place.name || place.formatted_address || "Location"}. Tap marker for options.`,
                  5000
                );
                isSearching = false;
                return;
              }
            }

            // If place search fails, fall back to geocoding
            fallbackToGeocoding();
          });
        } catch (error) {
          console.warn(
            "Place search failed, falling back to geocoding:",
            error
          );
          fallbackToGeocoding();
        }
      } else {
        fallbackToGeocoding();
      }

      // Geocoding fallback function
      async function fallbackToGeocoding() {
        try {
          // Add worldwide scope with bias toward Ethiopia
          const geocodeRequest = {
            address: searchQuery,
            // Bias toward Ethiopia but don't restrict completely
            region: "et",
          };

          const geocodeResult = await geocoder!.geocode(geocodeRequest);

          if (geocodeResult.results && geocodeResult.results.length > 0) {
            const location = geocodeResult.results[0].geometry.location;

            // Update coordinates and map
            updateCoordinatesFromMap(location.lat(), location.lng(), true);

            // Update the marker to be more visible
            if (marker) {
              marker.setIcon({
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#FF0000",
                fillOpacity: 0.8,
                strokeColor: "#FFFFFF",
                strokeWeight: 2,
                scale: 10,
              });

              // Add bounce animation to draw attention
              marker.setAnimation(google.maps.Animation.BOUNCE);
              setTimeout(() => {
                if (marker) marker.setAnimation(null);
              }, 1500);
            }

            // Show success message with address
            const addressComponents =
              geocodeResult.results[0].formatted_address;
            showMapHint(
              `Found: ${addressComponents}. Tap marker for options.`,
              5000
            );
          } else {
            showMapHint(
              "Location not found. Please try a more specific search.",
              4000
            );
          }
        } catch (error) {
          console.error("Geocoding search error:", error);

          if (error instanceof Error) {
            if (error.message.includes("ZERO_RESULTS")) {
              showMapHint(
                "No locations found. Try a different search term.",
                4000
              );
            } else {
              showMapHint("Error finding location. Please try again.", 3000);
            }
          }
        } finally {
          isSearching = false;
        }
      }
    } catch (error) {
      console.error("Search initialization error:", error);
      showMapHint("Search service unavailable. Please try again later.", 3000);
      isSearching = false;
    }
  }

  function getUserLocation() {
    if (!browser || !("geolocation" in navigator)) {
      mapStatus.error = "Geolocation not supported";
      showNotification(
        "Your browser doesn't support location services.",
        "error"
      );
      return;
    }

    isGettingLocation = true;
    showMapHint("Getting your current location...");
    mapStatus.lastUpdate = "Getting user location...";

    // Clear existing error
    coordinatesError = "";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        center = [lat, lng];
        latInput = lat.toString();
        lngInput = lng.toString();

        // Save to history
        mapInteractionHistory.push({ lat, lng });
        mapInteractionHistory = mapInteractionHistory;

        // Update form value
        $customerInformationForm.mapAddress = `${lat},${lng}`;

        // Try to get the address
        if (geocoder) {
          reverseGeocode(lat, lng);
        }

        mapStatus.lastUpdate = `Location updated: ${new Date().toISOString()}`;
        isGettingLocation = false;

        // Show success notification and hint
        showNotification("Location updated successfully!", "success");
        showMapHint("Your current location has been set!", 3000);

        // Indicate changes
        hasUnsavedChanges = true;
        showSaveBar = true;
      },
      (error) => {
        console.error("Error getting user location:", error);
        mapStatus.error = `Error: ${error.message}`;
        isGettingLocation = false;

        activeMapHint = "";

        // Show friendly error message to user
        let errorMsg = "";
        if (error.code === 1) {
          // Permission denied
          errorMsg =
            "Location permission denied. Please enable location services in your browser settings and allow this site.";
        } else if (error.code === 2) {
          // Position unavailable
          errorMsg =
            "Unable to determine your location currently. Please check your connection or try again later. You can also search or place a pin manually.";
        } else if (error.code === 3) {
          // Timeout
          errorMsg =
            "Location request timed out. Please try again or enter coordinates manually.";
        } else {
          errorMsg =
            "An unknown error occurred while getting your location. Please try again or enter coordinates manually.";
        }
        coordinatesError = errorMsg;
        showNotification(errorMsg, "error", 5000);
      },
      {
        timeout: 15000, // Increased timeout
        enableHighAccuracy: true, // Request high accuracy
        maximumAge: 60000, // Allow slightly older cached positions (1 min) if needed
      }
    );
  }

  // Handle location changed from the map component (pin drag, click, etc.)
  function handleLocationChanged(event: CustomEvent) {
    const { lat, lng } = event.detail;
    console.log("Marker location changed via drag:", lat, lng);

    // Update coordinates without triggering immediate geocoding (which happens during drag)
    updateCoordinatesFromMap(lat, lng, false);

    // Only trigger geocoding when drag stops
    if (geocodeTimer) {
      clearTimeout(geocodeTimer);
    }

    // Set a timer to do geocoding after the dragging stops
    geocodeTimer = setTimeout(() => {
      if (geocoder && !isGeocodingAddress) {
        reverseGeocode(lat, lng);
      }
    }, 500);

    // Show confirmation
    showMapHint("Position updated! Getting address...", 2000);
  }

  // Handle map click for pin mode
  function handleMapClick(event: CustomEvent) {
    // Directly extract coordinates from the event
    const { lat, lng } = event.detail;
    console.log("Map clicked at:", lat, lng);

    // Update coordinate inputs and form data
    // Note: Pass false to prevent endless address lookups while dragging
    updateCoordinatesFromMap(lat, lng, true);

    // Add visual indicator for the tap
    try {
      addTapRippleEffect(lat, lng);

      // Clean up ripples after animation completes
      setTimeout(() => {
        if (mapElement) {
          const ripples = mapElement.querySelectorAll(".map-tap-ripple");
          ripples.forEach((ripple) => {
            if (ripple.parentNode) {
              ripple.parentNode.removeChild(ripple);
            }
          });
        }
      }, 700);
    } catch (error) {
      console.warn("Could not add ripple effect:", error);
    }

    // Show confirmation
    showMapHint(
      "Location set! You can drag the marker to adjust position.",
      3000
    );
  }

  // Helper function to add ripple effect
  function addTapRippleEffect(lat: number, lng: number) {
    if (!map || !mapElement) return;

    const ripple = document.createElement("div");
    ripple.className = "map-tap-ripple";
    ripple.style.position = "absolute";
    ripple.style.width = "20px";
    ripple.style.height = "20px";
    ripple.style.borderRadius = "50%";
    ripple.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    ripple.style.transform = "translate(-50%, -50%)";
    ripple.style.animation = "ripple 0.6s ease-out";

    try {
      // Convert geo coordinates to pixel coordinates
      const latLng = new google.maps.LatLng(lat, lng);
      const projection = map.getProjection();

      if (projection) {
        const point = projection.fromLatLngToPoint(latLng);
        if (point) {
          const scale = Math.pow(2, map.getZoom() || 15);

          const worldPoint = new google.maps.Point(
            point.x * scale,
            point.y * scale
          );

          // Position the ripple effect
          ripple.style.left = `${worldPoint.x}px`;
          ripple.style.top = `${worldPoint.y}px`;

          // Add to map container
          mapElement.appendChild(ripple);
        }
      }
    } catch (error) {
      console.warn("Error creating ripple effect:", error);
    }
  }

  // Centralized function to update coordinates from map interactions
  function updateCoordinatesFromMap(
    lat: number,
    lng: number,
    performGeocoding = true
  ) {
    // Save to history for potential undo
    mapInteractionHistory.push({ lat, lng });
    mapInteractionHistory = mapInteractionHistory;

    // Update center reactively
    center = [lat, lng];

    // Update input fields with precise values
    latInput = lat.toFixed(6);
    lngInput = lng.toFixed(6);

    // Update form value
    $customerInformationForm.mapAddress = `${lat},${lng}`;

    // Try to get the address for these coordinates, but only if requested
    // This prevents continuous lookups when the user is interacting with the map
    if (geocoder && performGeocoding && !isGeocodingAddress) {
      reverseGeocode(lat, lng);
    }

    // Center map on the new position if map exists
    if (map) {
      map.setCenter({ lat, lng });
    }

    // Indicate changes
    hasUnsavedChanges = true;
    showSaveBar = true;

    // Clear any previous errors
    coordinatesError = "";
  }

  // This function is now simplified as marker creation is handled by GoogleMaps component
  function placeMarkerAtCurrentCoordinates() {
    if (!map) return;

    // Just center the map on the current coordinates
    map.setCenter({ lat: center[0], lng: center[1] });

    // Zoom in slightly for better precision
    if (map && typeof map.getZoom === "function") {
      const currentZoom = map.getZoom() || 0;
      if (currentZoom < 15) {
        map.setZoom(15);
      }
    }
  }

  // Reverse geocode - convert coordinates to address
  async function reverseGeocode(lat: number, lng: number) {
    if (!geocoder || isGeocodingAddress) return;

    try {
      // Set loading state
      isGeocodingAddress = true;
      addressFromCoordinates = "Getting address...";

      // Debounce the geocoding request to prevent too many API calls
      if (geocodeTimer) {
        clearTimeout(geocodeTimer);
      }

      // Use a local variable to ensure geocoder is available in the closure
      const geocoderRef = geocoder;

      geocodeTimer = setTimeout(async () => {
        try {
          // Make the geocoding request
          const response = await geocoderRef.geocode({
            location: { lat, lng },
          });

          // Process the results
          if (response && response.results && response.results.length > 0) {
            // Get the most complete address from the results
            const result = response.results[0];

            // Save the formatted address
            addressFromCoordinates = result.formatted_address;

            // Store components
            if (isEditMode && !$customerInformationForm.physicalAddress) {
              // If user hasn't manually set an address yet, suggest this one
              $customerInformationForm.physicalAddress =
                result.formatted_address;
            }
          } else {
            addressFromCoordinates = "No address found for this location";
          }
        } catch (error) {
          console.error("Geocoding error:", error);
          addressFromCoordinates = "Could not determine address";
        } finally {
          isGeocodingAddress = false;
        }
      }, 500); // 500ms debounce
    } catch (error) {
      console.error("Error setting up geocoding:", error);
      addressFromCoordinates = "Could not determine address";
      isGeocodingAddress = false;
    }
  }

  // Initialize location and map-related services
  function initializeMap(detail: any) {
    console.log("Initializing map services...");

    if (!detail?.google || !detail?.map) {
      console.error("Failed to get Google Maps objects");
      return;
    }

    const google = detail.google;
    map = detail.map;

    // Initialize geocoder
    if (!geocoder) {
      geocoder = new google.maps.Geocoder();
      console.log("Geocoder initialized");
    }

    // Initialize PlacesService with a proper div element
    if (!placesService) {
      // Create a safe element for PlacesService that won't cause issues
      const placesDiv = document.createElement("div");
      placesDiv.style.display = "none";
      if (mapElement) {
        mapElement.appendChild(placesDiv);
        try {
          placesService = new google.maps.places.PlacesService(placesDiv);
          console.log("Places service initialized");
        } catch (e) {
          console.warn("Could not initialize PlacesService:", e);
        }
      }
    }

    // If we already have coordinates, place a marker
    if (center[0] && center[1]) {
      // Create or update marker
      placeMarkerAtCurrentCoordinates();

      // Get address at these coordinates
      if (geocoder) {
        reverseGeocode(center[0], center[1]);
      }
    }
  }

  // Handle map ready event to initialize services and place initial marker
  function handleMapReady(event: CustomEvent) {
    mapStatus.isLoaded = true;
    isMapReady = true;
    mapStatus.lastUpdate = `Map loaded: ${new Date().toISOString()}`;

    console.log(
      "Map ready event received",
      event.detail ? "with details" : "without details"
    );

    // Process map initialization with a small delay to ensure DOM is ready
    setTimeout(() => {
      initializeMap(event.detail);
      showMapHint("Map is ready! Tap anywhere to set your location.", 4000);
    }, 200);
  }

  // Force reinitialize the map when entering location tab
  $: if (
    formSection === "location" &&
    isLocationTabActive &&
    map &&
    !marker &&
    center[0] &&
    center[1]
  ) {
    console.log("Forcing marker placement on tab activation");
    setTimeout(() => {
      placeMarkerAtCurrentCoordinates();
    }, 300);
  }

  // Handle map errors
  function handleMapError(event: CustomEvent) {
    console.error("Google Maps error:", event.detail);
    mapStatus.error = event.detail.message || "Error loading map";
    coordinatesError = "There was an issue with the map: " + mapStatus.error;
    showNotification("Map error: " + mapStatus.error, "error");
  }

  // Update coordinates when center changes
  $: if (center && center.length === 2) {
    // Only update if values have actually changed to avoid cursor position resets
    if (latInput !== center[0].toString()) {
      latInput = center[0].toString();
    }
    if (lngInput !== center[1].toString()) {
      lngInput = center[1].toString();
    }

    // Ensure the form mapAddress is always in sync
    $customerInformationForm.mapAddress = `${center[0]},${center[1]}`;
  }

  // Update map when coordinate inputs change
  function updateCoordinatesFromInput() {
    coordinatesError = "";

    try {
      const lat = parseFloat(latInput);
      const lng = parseFloat(lngInput);

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error("Coordinates must be valid numbers");
      }

      if (lat < -90 || lat > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }

      if (lng < -180 || lng > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }

      // Save to history
      mapInteractionHistory.push({ lat, lng });
      mapInteractionHistory = mapInteractionHistory;

      // Update center if everything is valid
      center = [lat, lng];

      // Try to get address from these coordinates
      if (geocoder) {
        reverseGeocode(lat, lng);
      }

      // Indicate changes
      hasUnsavedChanges = true;
      showSaveBar = true;

      // Show success feedback
      showMapHint("Coordinates updated successfully!", 2000);

      return true;
    } catch (error) {
      if (error instanceof Error) {
        coordinatesError = error.message;
        showNotification(error.message, "error");
      } else {
        coordinatesError = "Invalid coordinates format";
        showNotification("Invalid coordinates format", "error");
      }
      return false;
    }
  }

  // Real-time validation as user types
  function validateCoordinateInput() {
    try {
      const lat = parseFloat(latInput);
      const lng = parseFloat(lngInput);

      if (isNaN(lat) || isNaN(lng)) {
        coordinatesError = "Please enter valid numbers";
        return false;
      }

      if (lat < -90 || lat > 90) {
        coordinatesError = "Latitude must be between -90 and 90";
        return false;
      }

      if (lng < -180 || lng > 180) {
        coordinatesError = "Longitude must be between -180 and 180";
        return false;
      }

      // Clear error if valid
      coordinatesError = "";
      return true;
    } catch (error) {
      coordinatesError = "Invalid coordinates";
      return false;
    }
  }

  // Validate on input (debounced)
  let validationTimeout: number | null = null;
  function handleCoordinateInput() {
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    validationTimeout = setTimeout(() => {
      validateCoordinateInput();
      validationTimeout = null;
    }, 300) as unknown as number;
  }

  // Undo last map action
  function undoLastMapAction() {
    if (mapInteractionHistory.length > 1) {
      // Remove current position
      mapInteractionHistory.pop();
      // Get previous position
      const prevPosition =
        mapInteractionHistory[mapInteractionHistory.length - 1];
      // Update map
      center = [prevPosition.lat, prevPosition.lng];
      latInput = prevPosition.lat.toString();
      lngInput = prevPosition.lng.toString();

      // Update form
      $customerInformationForm.mapAddress = `${prevPosition.lat},${prevPosition.lng}`;

      // Get address
      if (geocoder) {
        reverseGeocode(prevPosition.lat, prevPosition.lng);
      }

      // Update state
      mapInteractionHistory = mapInteractionHistory;
      showMapHint("Last action undone!", 2000);
    } else {
      showMapHint("Nothing to undo", 2000);
    }
  }

  // Function to check if an image exists
  async function checkImageExists(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (e) {
      console.error("Error checking image:", e);
      return false;
    }
  }

  // Update the image upload handler
  const handleFormSubmit: SubmitFunction = ({ formData }) => {
    if (!data.session) return;

    formData.set(
      "profileKey",
      `customerProfilePicture/${data.session.customerData.id}`
    );

    return async ({ update, result }) => {
      try {
        await update();
        console.log("Image upload result:", result);

        // Handle different result types safely
        if (result.type === "success") {
          // For success type, we need to check if the data property exists
          if (result.data && typeof result.data === "object") {
            const responseData = result.data as any;

            if (responseData.success && responseData.data?.imgUrl) {
              // Add a timestamp to prevent caching
              const imageUrl = `${responseData.data.imgUrl}?t=${Date.now()}`;

              // Get the proxy URL from the response or create one
              const proxyUrl =
                responseData.data.proxyImgUrl ||
                `/api/images/${encodeURIComponent(responseData.data.imgUrl.split("?")[0])}?t=${Date.now()}`;

              console.log("Using image URLs:", {
                direct: imageUrl,
                proxy: proxyUrl,
              });

              // First try to verify the proxy URL exists
              try {
                const proxyImageExists = await checkImageExists(proxyUrl);

                if (proxyImageExists) {
                  data.imgUrl = imageUrl;
                  data.proxyImgUrl = proxyUrl;
                  showNotification(
                    "Profile picture updated successfully!",
                    "success"
                  );
                  return;
                } else {
                  console.warn(
                    "Proxy URL verification failed, trying direct URL"
                  );
                }
              } catch (err) {
                console.error("Error checking proxy URL:", err);
              }

              // If proxy fails, try the direct URL
              try {
                const imageExists = await checkImageExists(imageUrl);

                if (imageExists) {
                  data.imgUrl = imageUrl;
                  data.proxyImgUrl = proxyUrl; // Still set the proxy URL for future attempts
                  showNotification(
                    "Profile picture updated successfully!",
                    "success"
                  );
                } else {
                  console.error(
                    "Image URL returned but image not found:",
                    imageUrl
                  );
                  showNotification("Error: Image not found on server", "error");
                }
              } catch (err) {
                console.error("Error checking direct URL:", err);
                // Still set the URLs and hope they work when displayed
                data.imgUrl = imageUrl;
                data.proxyImgUrl = proxyUrl;
                showNotification(
                  "Profile picture updated, but verification failed",
                  "info"
                );
              }
            } else {
              showNotification("Error: No image URL in response", "error");
            }
          } else {
            showNotification("Invalid response format", "error");
          }
        } else if (result.type === "failure") {
          // For failure type, extract error message if available
          const responseData = result.data as any;
          const message =
            responseData?.errorMessage || "Failed to upload image";
          showNotification(message, "error");
        } else {
          showNotification("Unknown error uploading image", "error");
        }
      } catch (error) {
        console.error("Error handling upload response:", error);
        showNotification("Error processing upload", "error");
      } finally {
        isUploadingImage = false;
      }
    };
  };

  function handleImageUpload(e: Event) {
    if (!data.session) return;
    isUploadingImage = true;
    const target = e.currentTarget as HTMLInputElement;

    // Check if there's a file selected
    if (target.files && target.files.length > 0) {
      const file = target.files[0];

      // Validate file type
      if (!file.type.startsWith("image/")) {
        showNotification("Please select an image file", "error");
        isUploadingImage = false;
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showNotification("Image is too large. Maximum size is 5MB", "error");
        isUploadingImage = false;
        return;
      }

      // Show appropriate message based on whether we're updating or adding
      if (data.imgUrl) {
        showNotification("Updating profile picture...", "info");
      } else {
        showNotification("Uploading profile picture...", "info");
      }

      target.form?.requestSubmit();
    } else {
      // No file selected
      isUploadingImage = false;
      showNotification("No image selected", "error");
    }
  }

  function toggleEditMode() {
    isEditMode = !isEditMode;
    if (isEditMode) {
      // When entering edit mode, initialize the coordinate inputs
      latInput = center[0].toString();
      lngInput = center[1].toString();
      showNotification(
        "Edit mode activated. Make your changes and save when ready.",
        "info",
        2500
      );
    } else {
      // When exiting edit mode without saving
      if (hasUnsavedChanges) {
        // Ask for confirmation
        const confirmDiscard = confirm(
          "You have unsaved changes. Are you sure you want to discard them?"
        );
        if (!confirmDiscard) {
          isEditMode = true;
          return;
        }
        // If confirmed, reset form
        hasUnsavedChanges = false;
        showSaveBar = false;
        showNotification("Changes discarded.", "info", 2000);
      }
    }
  }

  function toggleMapExpanded() {
    mapExpanded = !mapExpanded;
  }

  function moveToSection(section: "personal" | "business" | "location") {
    formSection = section;
  }

  // Function to save changes from any section
  function saveChanges() {
    // Show notification for action acknowledgment
    showNotification("Saving your information...", "info");

    // Make sure location data is updated from manual input if needed
    if (formSection === "location") {
      updateCoordinatesFromInput();
      // Update the hidden input with the current coordinates
      $customerInformationForm.mapAddress = `${center[0]},${center[1]}`;
    }

    // Submit the form programmatically
    const form = document.querySelector('form[action="?/updateCustomer"]');
    if (form) {
      // Use type assertion to avoid TypeScript error
      (form as HTMLFormElement).requestSubmit();
    }
  }

  $: if (form?.updatedCustomer) {
    goto("/");
    hasUnsavedChanges = false;
    isSavingInProgress = false;
    showSaveBar = false;
  }

  $: mapAddress = `${center[0]},${center[1]}`;
  $: hasCompletedPersonalInfo =
    !!$customerInformationForm.userName &&
    !!$customerInformationForm.email &&
    !!$customerInformationForm.phoneNumber;

  // Handler for deleting profile picture
  const handleDeleteProfilePicture: SubmitFunction = () => {
    if (!data.session) return;

    isDeletingImage = true;
    showNotification("Removing profile picture...", "info");

    return async ({ update, result }) => {
      try {
        await update();
        console.log("Delete profile picture result:", result);

        if (result.type === "success") {
          // Clear the image URLs
          data.imgUrl = "";
          data.proxyImgUrl = undefined;

          showNotification("Profile picture removed successfully", "success");
        } else if (result.type === "failure") {
          const responseData = result.data as any;
          const message =
            responseData?.errorMessage || "Failed to remove profile picture";
          showNotification(message, "error");
        } else {
          showNotification("Unknown error removing profile picture", "error");
        }
      } catch (error) {
        console.error("Error handling delete response:", error);
        showNotification("Error processing request", "error");
      } finally {
        isDeletingImage = false;
      }
    };
  };

  // Handle marker click event
  function handleMarkerClick(event: CustomEvent) {
    const { lat, lng } = event.detail;
    console.log("Marker clicked at:", lat, lng);

    // If we have a valid address, show an option to use it
    if (
      addressFromCoordinates &&
      addressFromCoordinates !== "Getting address..." &&
      addressFromCoordinates !== "No address found for this location" &&
      addressFromCoordinates !== "Could not determine address"
    ) {
      const confirmUse = confirm(
        `Would you like to use this address?\n\n${addressFromCoordinates}`
      );

      if (confirmUse) {
        $customerInformationForm.physicalAddress = addressFromCoordinates;
        showNotification("Address saved to your profile", "success");
      }
    } else {
      // If we don't have an address yet, tell the user we're working on it
      showNotification("Getting address for this location...", "info");

      // Ensure we're getting the address
      if (geocoder && !isGeocodingAddress) {
        reverseGeocode(lat, lng);
      }
    }
  }
</script>

<div class="safe-area flex flex-col min-h-screen bg-gray-50">
  <!-- Page header -->
  <header class="sticky top-0 z-10 bg-white shadow-sm px-4 py-3">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-gray-800">Profile</h1>
      {#if !isEditMode}
        <button
          on:click={toggleEditMode}
          class="flex items-center gap-1 text-secondary text-sm font-medium"
        >
          <EditIcon class_="w-4 h-4" />
          <span>Edit</span>
        </button>
      {/if}
    </div>
  </header>

  <main class="flex-grow p-4 md:max-w-md md:mx-auto w-full">
    <!-- Profile picture section -->
    <div class="flex flex-col items-center mb-6">
      <form
        method="post"
        action="?/uploadProfilePicture"
        enctype="multipart/form-data"
        class="relative"
        use:enhance={handleFormSubmit}
      >
        <label class="block relative cursor-pointer">
          <input
            class="hidden"
            type="file"
            name="profilePicture"
            accept="image/*"
            on:change={handleImageUpload}
          />
          <div class="relative">
            {#if data.imgUrl}
              <div class="relative group">
                <img
                  alt="Profile picture"
                  src={data.proxyImgUrl || data.imgUrl}
                  class="rounded-full h-24 w-24 object-cover border-2 border-white shadow-md"
                  on:error={() => {
                    console.error(
                      "Failed to load image:",
                      data.proxyImgUrl || data.imgUrl
                    );

                    // If we're using the proxy URL and it failed, show error
                    if (data.proxyImgUrl) {
                      console.error("Proxy URL failed to load the image");

                      // Show error notification
                      showNotification(
                        "Failed to load profile picture through proxy",
                        "error"
                      );
                      data.imgUrl = "";
                    }

                    // Show detailed error notification
                    showNotification(
                      "Error 403: Access to the image is forbidden. Please check R2 bucket permissions.",
                      "error",
                      8000
                    );
                  }}
                />

                <!-- Hover overlay with "Change" text -->
                <div
                  class="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
                  <span class="text-white text-xs font-medium"
                    >Change Photo</span
                  >
                </div>
              </div>
            {:else}
              <div
                class="bg-gray-200 rounded-full h-24 w-24 flex items-center justify-center group"
              >
                <ProfilePlaceholder class_="h-16 w-16 text-gray-400" />

                <!-- Hover overlay with "Add" text -->
                <div
                  class="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
                  <span class="text-white text-xs font-medium">Add Photo</span>
                </div>
              </div>
            {/if}

            <!-- Camera icon overlay -->
            <div
              class="absolute bottom-0 right-0 bg-secondary text-white rounded-full p-1.5 shadow-md"
            >
              <Camera class_="h-4 w-4" />
            </div>

            {#if isUploadingImage}
              <div
                class="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center"
              >
                <Spinner class_="h-8 w-8 text-white" />
              </div>
            {/if}
          </div>
        </label>
      </form>

      {#if data.imgUrl && !isUploadingImage}
        <form
          method="post"
          action="?/deleteProfilePicture"
          class="mt-2"
          use:enhance={handleDeleteProfilePicture}
        >
          <input
            type="hidden"
            name="profileKey"
            value={`customerProfilePicture/${data.session.customerData.id}`}
          />
          <button
            type="submit"
            class="text-xs text-red-600 hover:text-red-800 flex items-center"
            disabled={isDeletingImage}
          >
            {#if isDeletingImage}
              <Spinner class_="h-3 w-3 mr-1" />
              Removing...
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3 mr-1"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
              Remove Photo
            {/if}
          </button>
        </form>
      {/if}

      {#if !data.customerInformationForm.data.premium}
        <button
          class="mt-4 px-5 py-2 border border-secondary text-secondary text-sm font-medium rounded-full"
        >
          Upgrade to Premium
        </button>
      {/if}
    </div>

    <!-- Progress and section navigation -->
    {#if isEditMode}
      <div class="mb-6">
        <div class="flex justify-between text-sm mb-2">
          <span class="font-medium">Complete your profile</span>
          <span class="text-gray-500"
            >{hasCompletedPersonalInfo ? "2" : "1"}/3</span
          >
        </div>
        <div class="bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div
            class="bg-secondary h-full transition-all duration-300 ease-in-out"
            style={`width: ${formSection === "personal" ? "33%" : formSection === "business" ? "66%" : "100%"}`}
          ></div>
        </div>

        <!-- Section tabs -->
        <div class="flex gap-2 mt-4 border-b">
          <button
            class={`py-2 px-3 text-sm font-medium ${formSection === "personal" ? "text-secondary border-b-2 border-secondary" : "text-gray-500"}`}
            on:click={() => moveToSection("personal")}
          >
            Personal
          </button>
          {#if $customerInformationForm.customerType === "BUSINESS"}
            <button
              class={`py-2 px-3 text-sm font-medium ${formSection === "business" ? "text-secondary border-b-2 border-secondary" : "text-gray-500"}`}
              on:click={() => moveToSection("business")}
              disabled={!hasCompletedPersonalInfo}
            >
              Business
            </button>
          {/if}
          <button
            class={`py-2 px-3 text-sm font-medium ${formSection === "location" ? "text-secondary border-b-2 border-secondary" : "text-gray-500"}`}
            on:click={() => moveToSection("location")}
            disabled={!hasCompletedPersonalInfo ||
              ($customerInformationForm.customerType === "BUSINESS" &&
                formSection === "personal")}
          >
            Location
          </button>
        </div>
      </div>
    {/if}

    <!-- Form -->
    <form
      method="post"
      action="?/updateCustomer"
      class="w-full"
      use:customerInformationEnhance
    >
      <!-- Hidden inputs to ensure all required form fields are always included -->
      <input
        type="hidden"
        name="userName"
        value={$customerInformationForm.userName || ""}
      />
      <input
        type="hidden"
        name="email"
        value={$customerInformationForm.email || ""}
      />
      <input
        type="hidden"
        name="phoneNumber"
        value={$customerInformationForm.phoneNumber || ""}
      />
      <input
        type="hidden"
        name="customerType"
        value={$customerInformationForm.customerType || "INDIVIDUAL"}
      />
      <input
        type="hidden"
        name="premium"
        value={$customerInformationForm.premium || false}
      />
      <input
        type="hidden"
        name="physicalAddress"
        value={$customerInformationForm.physicalAddress || ""}
      />
      <input
        type="hidden"
        name="companyName"
        value={$customerInformationForm.companyName || ""}
      />
      <input
        type="hidden"
        name="tin"
        value={$customerInformationForm.tin || ""}
      />
      <!-- Using computed mapAddress value to ensure it's always up to date -->
      <input
        type="hidden"
        name="mapAddress"
        value={`${center[0]},${center[1]}`}
      />

      {#if isEditMode}
        <!-- Edit mode - Sectioned form -->
        {#if formSection === "personal"}
          <div class="space-y-4" transition:fade={{ duration: 150 }}>
            <!-- Customer type selection -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2"
                >Customer Type</label
              >
              <div class="flex gap-3">
                <button
                  type="button"
                  class={`flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border ${$customerInformationForm.customerType === "INDIVIDUAL" ? "border-secondary bg-secondary/5" : "border-gray-200"}`}
                  on:click={() =>
                    ($customerInformationForm.customerType = "INDIVIDUAL")}
                >
                  <PersonIcon
                    class_={`h-6 w-6 ${$customerInformationForm.customerType === "INDIVIDUAL" ? "text-secondary" : "text-gray-400"}`}
                  />
                  <span
                    class={`text-sm font-medium ${$customerInformationForm.customerType === "INDIVIDUAL" ? "text-secondary" : "text-gray-600"}`}
                    >Individual</span
                  >
                </button>
                <button
                  type="button"
                  class={`flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border ${$customerInformationForm.customerType === "BUSINESS" ? "border-secondary bg-secondary/5" : "border-gray-200"}`}
                  on:click={() =>
                    ($customerInformationForm.customerType = "BUSINESS")}
                >
                  <BusinessIcon
                    class_={`h-6 w-6 ${$customerInformationForm.customerType === "BUSINESS" ? "text-secondary" : "text-gray-400"}`}
                  />
                  <span
                    class={`text-sm font-medium ${$customerInformationForm.customerType === "BUSINESS" ? "text-secondary" : "text-gray-600"}`}
                    >Business</span
                  >
                </button>
              </div>
              {#if $allErrors.find((err) => err.path === "customerType")}
                <p class="text-red-500 text-xs mt-1">
                  {$allErrors.find((err) => err.path === "customerType")
                    ?.messages?.[0] || "Invalid customer type"}
                </p>
              {/if}
            </div>

            <!-- Personal information -->
            <div class="form-group">
              <label for="userName" class="form-label">Full Name</label>
              <input
                id="userName"
                class="form-input"
                type="text"
                name="userName"
                placeholder="Enter your full name"
                bind:value={$customerInformationForm.userName}
                {...$constraints.userName}
              />
              {#if $allErrors.find((err) => err.path === "userName")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "userName")
                    ?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="form-group">
              <label for="email" class="form-label">Email</label>
              <input
                id="email"
                class="form-input"
                type="email"
                name="email"
                placeholder="Enter your email"
                bind:value={$customerInformationForm.email}
                {...$constraints.email}
              />
              {#if $allErrors.find((err) => err.path === "email")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "email")
                    ?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="form-group">
              <label for="phoneNumber" class="form-label">Phone Number</label>
              <input
                id="phoneNumber"
                class="form-input bg-gray-100 cursor-not-allowed"
                type="tel"
                name="phoneNumber"
                placeholder="Enter your phone number"
                bind:value={$customerInformationForm.phoneNumber}
                readonly
                disabled
              />
              <p class="text-xs text-gray-500 mt-1">
                Phone number cannot be changed as it is used for login
              </p>
              {#if $allErrors.find((err) => err.path === "phoneNumber")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "phoneNumber")
                    ?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="flex justify-between mt-6">
              <button type="submit" class="btn-outline"> Save </button>
              <button
                type="button"
                class="btn-secondary"
                on:click={() => {
                  if (hasCompletedPersonalInfo) {
                    if ($customerInformationForm.customerType === "BUSINESS") {
                      moveToSection("business");
                    } else {
                      moveToSection("location");
                    }
                  }
                }}
                disabled={!hasCompletedPersonalInfo}
              >
                Next
              </button>
            </div>
          </div>
        {:else if formSection === "business" && $customerInformationForm.customerType === "BUSINESS"}
          <div class="space-y-4" transition:fade={{ duration: 150 }}>
            <div class="form-group">
              <label for="companyName" class="form-label">Company Name</label>
              <input
                id="companyName"
                class="form-input"
                type="text"
                name="companyName"
                placeholder="Enter company name"
                bind:value={$customerInformationForm.companyName}
                {...$constraints.companyName}
              />
              {#if $allErrors.find((err) => err.path === "companyName")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "companyName")
                    ?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="form-group">
              <label for="tin" class="form-label">TIN Number</label>
              <input
                id="tin"
                class="form-input"
                type="text"
                name="tin"
                placeholder="Enter TIN number"
                bind:value={$customerInformationForm.tin}
                {...$constraints.tin}
              />
              {#if $allErrors.find((err) => err.path === "tin")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "tin")?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="form-group">
              <label for="physicalAddress" class="form-label"
                >Business Address</label
              >
              <input
                id="physicalAddress"
                class="form-input"
                type="text"
                name="physicalAddress"
                placeholder="Enter business address"
                bind:value={$customerInformationForm.physicalAddress}
                {...$constraints.physicalAddress}
              />
              {#if $allErrors.find((err) => err.path === "physicalAddress")}
                <p class="form-error">
                  {$allErrors.find((err) => err.path === "physicalAddress")
                    ?.messages?.[0]}
                </p>
              {/if}
            </div>

            <div class="flex justify-between mt-6">
              <button
                type="button"
                class="btn-outline"
                on:click={() => moveToSection("personal")}
              >
                Back
              </button>
              <div class="flex gap-2">
                <button type="submit" class="btn-outline"> Save </button>

                <button
                  type="button"
                  class="btn-secondary"
                  on:click={() => moveToSection("location")}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        {:else if formSection === "location"}
          <div class="space-y-4" transition:fade={{ duration: 200 }}>
            <div class="form-group">
              <label class="form-label mb-3">Your Location on Map</label>

              <!-- Map interaction controls -->
              <div
                class="flex flex-col mb-3 bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <p class="text-sm font-medium text-gray-700 mb-3">
                  Set Your Location:
                </p>

                <!-- Primary location options -->
                <div class="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    class="py-3 px-4 bg-white border border-gray-200 rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-gray-50 transition-colors"
                    on:click={getUserLocation}
                    disabled={isGettingLocation}
                  >
                    {#if isGettingLocation}
                      <Spinner class_="h-5 w-5 text-secondary" />
                      <span class="text-sm font-medium text-gray-700"
                        >Getting location...</span
                      >
                    {:else}
                      <LocationIcon class_="h-5 w-5 text-secondary" />
                      <span class="text-sm font-medium text-gray-700"
                        >Use My Current Location</span
                      >
                    {/if}
                  </button>

                  <button
                    type="button"
                    class={`py-3 px-4 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${mapActionMode === "search" ? "bg-secondary text-white border border-secondary" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}
                    on:click={() => setMapMode("search")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span class="text-sm font-medium">Search For Location</span>
                  </button>
                </div>

                <!-- Instruction text -->
                <div
                  class="text-xs text-center text-gray-500 border-t border-gray-200 pt-2"
                >
                  {#if mapActionMode === "search"}
                    Enter a location name, landmark, or address to search
                  {:else}
                    <span class="flex items-center justify-center gap-1">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      <span
                        >Tap anywhere on the map to set your location pin</span
                      >
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Search input (conditionally shown) -->
              {#if mapActionMode === "search"}
                <div
                  class="mb-3"
                  transition:scale={{ duration: 200, easing: quintOut }}
                >
                  <div class="relative">
                    <input
                      type="text"
                      placeholder="Enter location or address..."
                      class="form-input pr-10 pl-3 py-3"
                      bind:value={searchQuery}
                      on:input={handleSearchInput}
                      on:keydown={(e) => e.key === "Enter" && searchPlaces()}
                    />
                    <button
                      type="button"
                      class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-secondary px-2 py-1"
                      on:click={searchPlaces}
                      disabled={isSearching || !searchQuery.trim()}
                    >
                      {#if isSearching}
                        <Spinner class_="h-5 w-5" />
                      {:else}
                        <span class="text-sm font-medium">Search</span>
                      {/if}
                    </button>
                  </div>
                </div>

                <!-- Search mode escape button -->
                <div class="text-center mb-3">
                  <button
                    type="button"
                    class="text-xs text-secondary"
                    on:click={() => setMapMode("place")}
                  >
                    Cancel search and return to place mode
                  </button>
                </div>
              {/if}

              <!-- Map hints and active mode indicator -->
              {#if activeMapHint}
                <div
                  class="bg-blue-50 border border-blue-100 rounded-md p-2 mb-2 text-sm text-blue-700 flex items-center"
                  transition:scale={{ duration: 200, easing: quintOut }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mr-1.5 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  {activeMapHint}
                </div>
              {/if}

              <!-- Map container with toggle for expansion -->
              <div
                class={`relative rounded-lg overflow-hidden border border-gray-200 transition-all duration-300 ${mapExpanded ? "h-[450px]" : "h-[250px]"}`}
                bind:this={mapElement}
              >
                <div id="map" class="h-full w-full">
                  {#if formSection === "location" && isLocationTabActive}
                    <!-- Only render the map component when the location tab is active and ready -->
                    <GoogleMaps
                      lat={center[0]}
                      lng={center[1]}
                      display={false}
                      showSearchBox={false}
                      on:locationChanged={handleLocationChanged}
                      on:mapClick={handleMapClick}
                      on:markerClick={handleMarkerClick}
                      on:mapReady={handleMapReady}
                      on:error={handleMapError}
                      key={mapKey}
                    />
                  {/if}
                </div>

                <div class="absolute top-2 right-2">
                  <button
                    type="button"
                    class="bg-white rounded-md shadow px-3 py-1.5 text-gray-700 text-xs z-10 flex items-center gap-1"
                    on:click={toggleMapExpanded}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d={mapExpanded
                          ? "M20 12H4"
                          : "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"}
                      />
                    </svg>
                    {mapExpanded ? "Collapse map" : "Expand map"}
                  </button>
                </div>
              </div>

              <!-- Map action buttons row below map -->
              <div class="flex justify-end mt-2 mb-3">
                <button
                  type="button"
                  class="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
                  on:click={undoLastMapAction}
                  disabled={mapInteractionHistory.length <= 1}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 10h10a4 4 0 0 1 0 8H9m-6-8l3-3m0 0L3 4m3 3H3"
                    />
                  </svg>
                  Undo Last Change
                </button>
              </div>

              <!-- Coordinates input section - redesigned for clarity and better UX -->
              <div class="mt-4 bg-gray-50 p-3 rounded-lg">
                <label class="form-label text-gray-700 mb-2"
                  >Location Coordinates</label
                >
                <div class="grid grid-cols-2 gap-4">
                  <div class="relative">
                    <label
                      for="latitude"
                      class="text-xs text-gray-500 mb-1 block font-medium"
                    >
                      Latitude
                    </label>
                    <input
                      id="latitude"
                      class="form-input text-sm"
                      type="number"
                      step="any"
                      placeholder="e.g. 9.0046464"
                      bind:value={latInput}
                      on:input={handleCoordinateInput}
                      on:change={updateCoordinatesFromInput}
                    />
                    <div
                      class="absolute right-2 top-[1.9rem] text-xs text-gray-400"
                    >
                      °N/S
                    </div>
                  </div>
                  <div class="relative">
                    <label
                      for="longitude"
                      class="text-xs text-gray-500 mb-1 block font-medium"
                    >
                      Longitude
                    </label>
                    <input
                      id="longitude"
                      class="form-input text-sm"
                      type="number"
                      step="any"
                      placeholder="e.g. 38.797312"
                      bind:value={lngInput}
                      on:input={handleCoordinateInput}
                      on:change={updateCoordinatesFromInput}
                    />
                    <div
                      class="absolute right-2 top-[1.9rem] text-xs text-gray-400"
                    >
                      °E/W
                    </div>
                  </div>
                </div>

                {#if coordinatesError}
                  <p class="form-error mt-2 flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {coordinatesError}
                  </p>
                {:else}
                  <p class="text-xs text-gray-500 mt-2 italic">
                    Update coordinates by typing values, searching, placing a
                    pin, or using your current location.
                  </p>
                {/if}
              </div>

              {#if addressFromCoordinates}
                <div
                  class="mt-3 bg-white rounded-lg border border-gray-200 overflow-hidden"
                >
                  <div
                    class="border-b border-gray-100 bg-gray-50 px-3 py-2 flex justify-between items-center"
                  >
                    <span
                      class="text-xs font-medium text-gray-700 flex items-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3.5 w-3.5 mr-1"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      Address at this location
                    </span>

                    {#if isGeocodingAddress}
                      <Spinner class_="h-3 w-3" />
                    {/if}
                  </div>

                  <div class="p-3">
                    {#if addressFromCoordinates === "Getting address..."}
                      <div class="flex items-center">
                        <Spinner class_="h-3 w-3 mr-2" />
                        <p class="text-sm text-gray-600">
                          Looking up address...
                        </p>
                      </div>
                    {:else}
                      <p class="text-sm text-gray-800 mb-3">
                        {addressFromCoordinates}
                      </p>

                      {#if isEditMode && addressFromCoordinates && addressFromCoordinates !== "No address found for this location" && addressFromCoordinates !== "Could not determine address"}
                        <button
                          type="button"
                          class="w-full py-2 bg-secondary text-white text-sm font-medium rounded-md flex items-center justify-center transition-colors"
                          on:click={() => {
                            $customerInformationForm.physicalAddress =
                              addressFromCoordinates;
                            showNotification(
                              "Address saved to your profile",
                              "success"
                            );
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 mr-1.5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"
                            />
                            <path
                              d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"
                            />
                          </svg>
                          Use this address
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            {#if $customerInformationForm.customerType === "INDIVIDUAL"}
              <div class="form-group">
                <label for="physicalAddress" class="form-label"
                  >Home Address</label
                >
                <input
                  id="physicalAddress"
                  class="form-input"
                  type="text"
                  name="physicalAddress"
                  placeholder="Enter your home address"
                  bind:value={$customerInformationForm.physicalAddress}
                  {...$constraints.physicalAddress}
                />
                {#if $allErrors.find((err) => err.path === "physicalAddress")}
                  <p class="form-error">
                    {$allErrors.find((err) => err.path === "physicalAddress")
                      ?.messages?.[0]}
                  </p>
                {/if}
              </div>
            {/if}

            <div class="flex justify-between mt-6">
              <button
                type="button"
                class="btn-outline"
                on:click={() =>
                  moveToSection(
                    $customerInformationForm.customerType === "BUSINESS"
                      ? "business"
                      : "personal"
                  )}
              >
                Back
              </button>
              <button
                type="submit"
                class="btn-secondary"
                disabled={$submitting || isSavingInProgress}
              >
                {#if $submitting || isSavingInProgress}
                  <Spinner class_="h-4 w-4 mr-2" />
                  {$delayed ? "Saving..." : "Processing..."}
                {:else}
                  Save Information
                {/if}
              </button>
            </div>
          </div>
        {/if}
      {:else}
        <!-- View mode - Display all information -->
        <div class="bg-white rounded-lg shadow-sm p-5 divide-y divide-gray-100">
          <div class="pb-4">
            <h2
              class="text-gray-500 text-xs font-medium uppercase tracking-wide mb-3"
            >
              Personal Information
            </h2>
            <div class="space-y-3">
              <div>
                <div class="text-xs text-gray-500">Full Name</div>
                <div class="text-gray-800">
                  {data.session?.userData.userName || "Not provided"}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Email</div>
                <div class="text-gray-800">
                  {data.session?.userData.email || "Not provided"}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Phone Number</div>
                <div class="text-gray-800">
                  {data.session?.userData.phoneNumber || "Not provided"}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Customer Type</div>
                <div class="text-gray-800">
                  {#if data.session?.customerData.customerType === "BUSINESS"}
                    Business
                  {:else if data.session?.customerData.customerType === "INDIVIDUAL"}
                    Individual
                  {:else}
                    Not provided
                  {/if}
                </div>
              </div>
            </div>
          </div>

          {#if data.session?.customerData.customerType === "BUSINESS"}
            <div class="py-4">
              <h2
                class="text-gray-500 text-xs font-medium uppercase tracking-wide mb-3"
              >
                Business Information
              </h2>
              <div class="space-y-3">
                <div>
                  <div class="text-xs text-gray-500">Company Name</div>
                  <div class="text-gray-800">
                    {data.session?.customerData.companyName || "Not provided"}
                  </div>
                </div>
                {#if data.session?.customerData.tinNumber}
                  <div>
                    <div class="text-xs text-gray-500">TIN Number</div>
                    <div class="text-gray-800">
                      {data.session?.customerData.tinNumber || "Not provided"}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <div class="pt-4">
            <h2
              class="text-gray-500 text-xs font-medium uppercase tracking-wide mb-3"
            >
              Location Information
            </h2>
            <div class="space-y-3 mb-4">
              <div>
                <div class="text-xs text-gray-500">Address</div>
                <div class="text-gray-800">
                  {data.session?.customerData.physicalAddress || "Not provided"}
                </div>
              </div>
              {#if data.session?.customerData.mapAddress}
                <div>
                  <div class="text-xs text-gray-500">Coordinates</div>
                  <div class="text-gray-800">
                    {#if data.session?.customerData.mapAddress}
                      {parseFloat(
                        data.session.customerData.mapAddress.split(",")[0]
                      ).toFixed(6)},
                      {parseFloat(
                        data.session.customerData.mapAddress.split(",")[1]
                      ).toFixed(6)}
                    {:else}
                      Not provided
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            {#if data.session?.customerData.mapAddress}
              <div
                class="rounded-lg overflow-hidden shadow-sm border border-gray-200"
              >
                <div class="relative">
                  <div id="view-map" class="h-[250px] w-full">
                    <GoogleMaps
                      lat={parseFloat(
                        data.session.customerData.mapAddress.split(",")[0]
                      )}
                      lng={parseFloat(
                        data.session.customerData.mapAddress.split(",")[1]
                      )}
                      display={false}
                      showSearchBox={false}
                      on:error={handleMapError}
                      key={0}
                    />
                  </div>
                  <div
                    class="absolute bottom-3 right-3 bg-white bg-opacity-95 rounded-lg shadow-md px-3 py-2 text-sm text-gray-700 flex items-center max-w-[80%]"
                  >
                    <LocationIcon
                      class_="h-4 w-4 mr-2 text-secondary flex-shrink-0"
                    />
                    <span class="truncate"
                      >{data.session?.customerData.physicalAddress ||
                        "Your saved location"}</span
                    >
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </form>

    <!-- Logout button -->
    <button
      on:click={() => signOut()}
      class="w-full mt-8 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg flex justify-center items-center"
    >
      Logout
    </button>
  </main>

  <!-- Persistent save bar when changes are made -->
  {#if isEditMode && showSaveBar && !$submitting && !isSavingInProgress}
    <div
      class="fixed bottom-0 left-0 right-0 bg-white shadow-top p-3 flex justify-between items-center safe-area-bottom"
      transition:fade={{ duration: 200 }}
    >
      <span class="text-sm text-gray-600">You have unsaved changes</span>
      <button
        type="button"
        class="btn-secondary"
        on:click={saveChanges}
        disabled={$submitting || isSavingInProgress}
      >
        Save Changes
      </button>
    </div>
  {/if}
</div>

<style>
  .safe-area {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .safe-area-bottom {
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0));
  }

  .shadow-top {
    box-shadow:
      0 -4px 6px -1px rgba(0, 0, 0, 0.1),
      0 -2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.25rem;
  }

  .form-input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  .form-input:focus {
    outline: none;
    ring: 1px;
    ring-color: var(--color-secondary);
    border-color: var(--color-secondary);
  }

  .form-error {
    color: #ef4444;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .btn-secondary {
    background-color: var(--color-secondary);
    color: white;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-outline {
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 500;
  }

  .btn-outline-sm {
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-weight: 500;
    font-size: 0.875rem;
  }

  /* Map tap animation */
  @keyframes ripple {
    0% {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 1;
    }
    70% {
      transform: translate(-50%, -50%) scale(2.5);
      opacity: 0.5;
    }
    100% {
      transform: translate(-50%, -50%) scale(3);
      opacity: 0;
    }
  }

  /* For visible tap feedback */
  .map-tap-ripple {
    pointer-events: none;
    z-index: 1000;
  }
</style>
