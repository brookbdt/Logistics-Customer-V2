<script lang="ts">
  import { enhance } from "$app/forms";
  import ArrowRight from "$lib/assets/icons/arrow-right.svg.svelte";
  import Add from "$lib/assets/shared/add.svg.svelte";
  import Search from "$lib/assets/shared/search.svg.svelte";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import dropOffIcon from "$lib/assets/shared/map/drop-off.svg";
  import pickUp from "$lib/assets/shared/map/pick-up.svg";
  import { createEventDispatcher, onMount } from "svelte";
  import type { ActionData } from "./$types";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { PageData } from "./$types";
  import { toast } from "@zerodevx/svelte-toast";
  import {
    calculatePrice,
    type PriceBreakdown,
    type PricingParams,
    normalizeCity,
    extractCityFromAddress,
    isRouteAvailable as checkPricingRoute,
  } from "$lib/utils/pricing";
  import { page } from "$app/stores";
  let dateInput: any;

  let className = "";
  let lat2: number = 9.01;
  let lng2: number = 38.74;
  let locationError: string | null = null;
  let isLoadingLocation = false;
  let addressSearchQuery = "";
  let addressSearchResults: Array<{
    place_id: string;
    description: string;
    address: string;
    lat: number;
    lng: number;
  }> = [];
  let isSearchingAddress = false;
  let placesService: google.maps.places.PlacesService | null = null;
  let autocompleteService: google.maps.places.AutocompleteService | null = null;
  let geocoder: google.maps.Geocoder | null = null;

  // For manual coordinate input
  let manualCoordinates = `${lat2},${lng2}`;

  export { className as class };
  const dispatch = createEventDispatcher();

  export let form: ActionData | undefined = undefined;
  export let data: PageData;

  export let receiversInfo: {
    id: Number;
    userName: string | null;
    phoneNumber: string | null;
    dropOffTime: string | null;
    dropOffLocation: string | null;
    dropOffMapLocation: string | null;
    inCity: string | null;
    receiverEmail: string | null;
    originCity?: string;
    destinationCity?: string;
    deliveryCity?: string;
  } = {
    id: 0,
    userName: null,
    phoneNumber: null,
    dropOffTime: null,
    dropOffLocation: null,
    dropOffMapLocation: null,
    inCity: null,
    receiverEmail: null,
  };
  export let lat1: number | null = null;
  export let lng1: number | null = null;

  // Add a reactive statement to check if coordinates are available
  $: if (lat1 && lng1 && lat2 && lng2) {
    console.log("All coordinates available, determining delivery type");
    console.log(
      "Existing city info - originCity:",
      originCity,
      "destinationCity:",
      destinationCity
    );

    // If we already have city information, we can set the delivery type directly
    if (originCity && destinationCity) {
      console.log("Using existing city information to determine delivery type");

      // Set the delivery type based on whether cities are the same
      if (originCity.toLowerCase() === destinationCity.toLowerCase()) {
        deliveryType = "IN_CITY";
        handleRadioChange(0); // Set to in-city
      } else {
        // Check if there's a route between these cities
        const routeAvailable = checkPricingRoute(
          originCity,
          destinationCity,
          data.pricingConfig
        );
        if (routeAvailable) {
          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities
        } else {
          // Fallback to distance-based logic if no route is available
          if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
            deliveryType = "BETWEEN_CITIES";
            handleRadioChange(1); // Set to between cities
          } else {
            deliveryType = "IN_CITY";
            handleRadioChange(0); // Set to in-city
          }
        }
      }
    } else {
      // If we don't have city information, try to determine it
      determineDeliveryType();
    }
  }

  let radio: number | null =
    receiversInfo.inCity !== null
      ? receiversInfo.inCity === "0"
        ? 0
        : 1
      : null;

  let searchResultVisible: boolean = false;
  let searchQuery = "";
  let isSearching = false;
  export let disableInput = false;

  // Validation
  let errors = {
    userName: false,
    phoneNumber: false,
    email: false,
    inCity: false,
    dropOffTime: false,
    dropOffLocation: false,
  };

  $: console.log("errors", errors);
  $: console.log("receiversInfo", receiversInfo);

  function validateForm() {
    errors = {
      userName: !receiversInfo.userName,
      phoneNumber: !receiversInfo.phoneNumber,
      email:
        !receiversInfo.receiverEmail ||
        !receiversInfo.receiverEmail.includes("@"),
      inCity: false,
      dropOffTime: !receiversInfo.dropOffTime,
      dropOffLocation: !receiversInfo.dropOffLocation,
    };

    return !Object.values(errors).some(Boolean);
  }

  $: console.log("receiversInfo", receiversInfo);

  function handleNext() {
    // Validate required fields
    let isValid = true;
    if (!receiversInfo.userName) {
      errors.userName = true;
      isValid = false;
    }
    if (!receiversInfo.phoneNumber) {
      errors.phoneNumber = true;
      isValid = false;
    }
    if (!receiversInfo.dropOffTime) {
      errors.dropOffTime = true;
      isValid = false;
    }
    if (!receiversInfo.dropOffLocation) {
      errors.dropOffLocation = true;
      isValid = false;
    }

    console.log("isValid 1", isValid);
    console.log("errors in handleNext 1", errors);
    console.log("isLocationInServiceArea 1", isLocationInServiceArea);
    console.log("deliveryType 1", deliveryType);

    // Check if location is in service area
    if (!isLocationInServiceArea) {
      isValid = false;
      if (!locationError) {
        locationError = "One or both locations are outside our service area.";
      }
      return;
    }

    // Check if we have determined a delivery type and set it if not
    if (!deliveryType && lat1 && lng1 && lat2 && lng2) {
      console.log("Setting fallback delivery type in handleNext");

      // Use the same distance-based logic as in determineDeliveryType
      if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
        deliveryType = "BETWEEN_CITIES";
        receiversInfo.inCity = "1";
        console.log("Setting fallback delivery type to BETWEEN_CITIES");
      } else {
        deliveryType = "IN_CITY";
        receiversInfo.inCity = "0";
        console.log("Setting fallback delivery type to IN_CITY");
      }

      // Set origin and destination city names if they're not set
      if (!originCity) originCity = "Addis Ababa";
      if (!destinationCity)
        destinationCity =
          deliveryType === "IN_CITY" ? originCity : "Other City";
      if (deliveryType === "IN_CITY") deliveryCity = originCity;

      // Store city information in receiversInfo
      receiversInfo.originCity = originCity;
      receiversInfo.destinationCity = destinationCity;
      if (deliveryType === "IN_CITY") receiversInfo.deliveryCity = deliveryCity;
    }

    // If the delivery type is still not set, show an error
    if (!deliveryType) {
      isValid = false;
      locationError =
        "Unable to determine delivery type. Please make sure both pickup and delivery locations are properly set.";
      return;
    }

    console.log("isValid 2", isValid);
    console.log("errors in handleNext 2", errors);
    console.log("deliveryType 2", deliveryType);
    console.log("receiversInfo.inCity", receiversInfo.inCity);

    if (isValid) {
      // Ensure price has been calculated
      if (!calculatedPrice && distanceInKm) {
        calculateLocalPrice();
      }

      // Always save the current coordinates in lat,lng format
      receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

      // Make sure inCity is properly set based on deliveryType
      receiversInfo.inCity = deliveryType === "IN_CITY" ? "0" : "1";
      console.log("Final receiversInfo.inCity", receiversInfo.inCity);

      // Ensure city information is stored in receiversInfo
      receiversInfo.originCity = originCity;
      receiversInfo.destinationCity = destinationCity;
      if (deliveryType === "IN_CITY") receiversInfo.deliveryCity = deliveryCity;

      // Pass comprehensive data to the parent component
      dispatch("next", {
        distanceInKm,
        estimatedTimeInMinutes,
        deliveryType,
        originCity,
        destinationCity,
        calculatedPrice,
        priceBreakdown,
        effectiveWeight: priceBreakdown?.effectiveWeight || 0,
        coordinates: {
          lat: lat2,
          lng: lng2,
        },
      });
    }
  }

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split("T")[0];

  // Handle radio change
  function handleRadioChange(value: number) {
    radio = value;
    receiversInfo.inCity = value.toString();
  }

  // Try to get user location with fallback
  function checkLocationPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!navigator.permissions) {
        resolve(true); // Can't check permissions, assume allowed
        return;
      }

      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          resolve(result.state === "granted" || result.state === "prompt");
        })
        .catch(() => resolve(true)); // If we can't check, assume allowed
    });
  }

  function checkLocationServices(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }

      // Try a quick position check
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            resolve(false);
          } else {
            resolve(true); // Other errors might be temporary
          }
        },
        { timeout: 3000, maximumAge: 0 }
      );
    });
  }

  // Replace the existing getUserLocation function with this improved version
  async function getUserLocation() {
    isLoadingLocation = true;
    locationError = null;

    try {
      // First check if location is available and permitted
      const [hasPermission, servicesEnabled] = await Promise.all([
        checkLocationPermission(),
        checkLocationServices(),
      ]);

      if (!hasPermission) {
        throw new Error("Location permission denied");
      }

      if (!servicesEnabled) {
        throw new Error("Location services are disabled");
      }

      // If checks pass, try to get location with improved options
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            // Add these if needed for iOS
            // @ts-ignore - These are non-standard but supported in iOS
            webkitEnableHighAccuracy: true,
            webkitTimeout: 10000,
          });
        }
      );

      // Success - handle the position
      console.log("Position obtained successfully:", position);

      lat2 = position.coords.latitude;
      lng2 = position.coords.longitude;
      // Always store in lat,lng format
      manualCoordinates = `${lat2},${lng2}`;
      // Ensure dropOffMapLocation is also updated to maintain consistent format
      receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

      // Attempt to reverse geocode the coordinates to get an address
      reverseGeocode(lat2, lng2);

      locationError = null;
      isLoadingLocation = false;

      // Show success notification if you have one
      // showLocationNotification("Your current location has been set as the delivery point.");
    } catch (error) {
      console.error("Geolocation error:", error);

      // Improved error handling with specific messages
      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            locationError =
              "Location access was denied. Please check your browser and system settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            locationError =
              "Unable to determine your location. Please check if location services are enabled and you have a clear GPS signal.";
            // Try IP geolocation as fallback
            await tryIPGeolocation();
            break;
          case error.TIMEOUT:
            locationError = "Location request timed out. Please try again.";
            // Try IP geolocation as fallback
            await tryIPGeolocation();
            break;
        }
      } else {
        locationError =
          "An unexpected error occurred while getting your location.";
        await tryIPGeolocation();
      }

      isLoadingLocation = false;
    }
  }

  // Add IP geolocation fallback
  async function tryIPGeolocation(): Promise<boolean> {
    try {
      console.log("Attempting IP-based geolocation...");

      // Try to fetch location from ipapi.co
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) {
        throw new Error(`IP geolocation failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("IP geolocation data:", data);

      if (
        data &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number"
      ) {
        // Update coordinates
        lat2 = data.latitude;
        lng2 = data.longitude;
        // Always store in lat,lng format
        manualCoordinates = `${lat2},${lng2}`;
        // Ensure dropOffMapLocation is also updated to maintain consistent format
        receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

        // Attempt to reverse geocode the coordinates to get an address
        if (geocoder) {
          reverseGeocode(lat2, lng2);
        } else {
          // If geocoder isn't available, use the city from IP data
          if (data.city) {
            receiversInfo.dropOffLocation = `${data.city}, ${data.country_name}`;
          }
        }

        locationError = null;
        isLoadingLocation = false;

        return true;
      } else {
        throw new Error("IP geolocation returned invalid data");
      }
    } catch (error) {
      console.error("IP geolocation failed:", error);

      // Try alternative IP geolocation service
      try {
        console.log("Trying alternative IP geolocation service...");
        const response = await fetch("https://get.geojs.io/v1/ip/geo.json");
        if (!response.ok) {
          throw new Error(
            `Alternative IP geolocation failed: ${response.statusText}`
          );
        }

        const data = await response.json();
        console.log("Alternative IP geolocation data:", data);

        if (
          data &&
          typeof data.latitude === "string" &&
          typeof data.longitude === "string"
        ) {
          // Update coordinates
          lat2 = parseFloat(data.latitude);
          lng2 = parseFloat(data.longitude);
          // Always store in lat,lng format
          manualCoordinates = `${lat2},${lng2}`;
          // Ensure dropOffMapLocation is also updated to maintain consistent format
          receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

          // Attempt to reverse geocode the coordinates to get an address
          if (geocoder) {
            reverseGeocode(lat2, lng2);
          } else if (data.city) {
            receiversInfo.dropOffLocation = `${data.city}, ${data.country}`;
          }

          locationError = null;
          isLoadingLocation = false;

          return true;
        } else {
          throw new Error("Alternative IP geolocation returned invalid data");
        }
      } catch (altError) {
        console.error("Alternative IP geolocation failed:", altError);
        // Use default location as fallback
        useDefaultLocation();
        return false;
      }
    }
  }

  // Add default location function
  function useDefaultLocation(): void {
    console.log("Using default location (Addis Ababa)");

    // Use Addis Ababa coordinates as fallback
    lat2 = 9.01;
    lng2 = 38.74;
    // Always store in lat,lng format
    manualCoordinates = `${lat2},${lng2}`;
    // Ensure dropOffMapLocation is also updated to maintain consistent format
    receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

    // Attempt to reverse geocode the coordinates to get an address
    reverseGeocode(lat2, lng2);

    locationError = null;
    isLoadingLocation = false;
  }

  function requestGeolocation() {
    // Set a timeout to handle slow location requests
    const locationTimeout = setTimeout(() => {
      if (isLoadingLocation) {
        isLoadingLocation = false;
        locationError =
          "Location request timed out. You can set your location manually.";
      }
    }, 10000);

    if (navigator.geolocation) {
      try {
        // Try high accuracy first
        navigator.geolocation.getCurrentPosition(
          (position) => {
            handlePositionSuccess(position, locationTimeout);
          },
          (error) => {
            console.error(
              "Error getting user location with high accuracy:",
              error
            );

            // If high accuracy fails, try again with low accuracy
            if (error.code === 2) {
              console.log("Retrying with low accuracy...");
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  handlePositionSuccess(position, locationTimeout);
                },
                (finalError) => {
                  handlePositionError(finalError, locationTimeout);
                },
                {
                  enableHighAccuracy: false,
                  timeout: 8000,
                  maximumAge: 60000, // Accept positions up to 1 minute old
                }
              );
            } else {
              handlePositionError(error, locationTimeout);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          }
        );
      } catch (e) {
        clearTimeout(locationTimeout);
        console.error("Exception when getting location:", e);
        locationError =
          "There was an unexpected error accessing your location.";
        isLoadingLocation = false;
      }
    } else {
      clearTimeout(locationTimeout);
      locationError =
        "Geolocation is not supported by your browser. Please enter your location manually.";
      isLoadingLocation = false;
    }
  }

  function handlePositionSuccess(
    position: GeolocationPosition,
    timeoutId: ReturnType<typeof setTimeout>
  ) {
    clearTimeout(timeoutId);
    console.log("Location obtained successfully:", position.coords);
    lat2 = position.coords.latitude;
    lng2 = position.coords.longitude;
    manualCoordinates = `${lat2},${lng2}`;
    // Attempt to reverse geocode the coordinates to get an address
    reverseGeocode(lat2, lng2);
    locationError = null;
    isLoadingLocation = false;
  }

  function handlePositionError(
    error: GeolocationPositionError,
    timeoutId: ReturnType<typeof setTimeout>
  ) {
    clearTimeout(timeoutId);
    console.error("Final error getting user location:", error);

    // Provide helpful error messages based on error code
    if (error.code === 1) {
      locationError =
        "Location access was denied. Please check your browser settings and try again.";
    } else if (error.code === 2) {
      locationError =
        "Your location couldn't be determined. This might be due to:" +
        "\n• Poor GPS signal (if indoors)" +
        "\n• Device location services being disabled" +
        "\n• Browser location permission not being granted" +
        "\n\nPlease check your device settings and try again, or enter your location manually.";
    } else if (error.code === 3) {
      locationError =
        "Location request timed out. Please try again or enter your location manually.";
    } else {
      locationError =
        "There was an issue accessing your location. Please try again later.";
    }

    isLoadingLocation = false;
  }

  // Handle manual coordinate input
  function updateCoordinatesFromInput() {
    try {
      const coords = manualCoordinates
        .split(",")
        .map((coord) => parseFloat(coord.trim()));

      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        let newLat = coords[0];
        let newLng = coords[1];

        // Check if coordinates might be reversed (first value outside normal latitude range)
        if (Math.abs(newLat) > 90 && Math.abs(newLng) <= 90) {
          // Coordinates are likely reversed (lng,lat format)
          console.log("Detected reversed coordinates in input, fixing order");
          const temp = newLat;
          newLat = newLng;
          newLng = temp;
        }

        // Validate the coordinates are in reasonable ranges
        if (Math.abs(newLat) <= 90 && Math.abs(newLng) <= 180) {
          lat2 = newLat;
          lng2 = newLng;
          // Always store in lat,lng format
          manualCoordinates = `${lat2},${lng2}`;
          // Ensure dropOffMapLocation is also updated to maintain consistent format
          receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

          // Attempt to reverse geocode the coordinates to get an address
          reverseGeocode(lat2, lng2);

          // Check if location is within service region
          checkServiceRegion(lat2, lng2);
        } else {
          // Invalid range
          manualCoordinates = `${lat2},${lng2}`;
        }
      } else {
        // Invalid format
        manualCoordinates = `${lat2},${lng2}`;
      }
    } catch (e) {
      // Reset to current values if parsing fails
      manualCoordinates = `${lat2},${lng2}`;
    }
  }

  // Add a variable to track if the search results should be shown
  let showSearchResults = false;

  // Function to handle clicks outside the search area
  function handleClickOutside(event: MouseEvent) {
    const searchContainer = document.getElementById("addressSearchContainer");
    if (searchContainer && !searchContainer.contains(event.target as Node)) {
      showSearchResults = false;
    }
  }

  // Add event listener on mount and remove on destroy
  onMount(() => {
    // Add click outside listener
    document.addEventListener("click", handleClickOutside);

    // Initialize Google Maps services if the API is already loaded
    if (window.google && window.google.maps) {
      initializeGoogleServices(window.google);
    }

    // Initialize city information from receiversInfo if available
    if (receiversInfo.originCity) {
      originCity = receiversInfo.originCity;
      console.log("Restored origin city from receiversInfo:", originCity);
    }

    if (receiversInfo.destinationCity) {
      destinationCity = receiversInfo.destinationCity;
      console.log(
        "Restored destination city from receiversInfo:",
        destinationCity
      );
    }

    if (receiversInfo.deliveryCity) {
      deliveryCity = receiversInfo.deliveryCity;
      console.log("Restored delivery city from receiversInfo:", deliveryCity);
    }

    // Check if user already has coordinates saved
    if (
      receiversInfo.dropOffMapLocation &&
      receiversInfo.dropOffMapLocation !== ""
    ) {
      try {
        // Parse coordinates from dropOffMapLocation (format: "lat,lng")
        const coords = receiversInfo.dropOffMapLocation
          .split(",")
          .map((coord) => parseFloat(coord.trim()));

        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          // Get coordinates from the saved location
          let savedLat = coords[0];
          let savedLng = coords[1];

          // Check if coordinates might be reversed (first value outside normal latitude range)
          if (Math.abs(savedLat) > 90 && Math.abs(savedLng) <= 90) {
            // Coordinates are likely reversed (lng,lat format)
            console.log("Detected reversed coordinates, fixing order");
            const temp = savedLat;
            savedLat = savedLng;
            savedLng = temp;
          }

          // Validate the coordinates are in reasonable ranges
          if (Math.abs(savedLat) <= 90 && Math.abs(savedLng) <= 180) {
            // Valid coordinates found in dropOffMapLocation
            lat2 = savedLat;
            lng2 = savedLng;
            // Always store in lat,lng format
            manualCoordinates = `${lat2},${lng2}`;
            // Ensure dropOffMapLocation is also updated to maintain consistent format
            receiversInfo.dropOffMapLocation = `${lat2},${lng2}`;

            console.log(
              "Using previously saved delivery location:",
              lat2,
              lng2
            );

            // If we have pickup coordinates and city information, determine delivery type
            if (lat1 && lng1) {
              // If we have city information, we can determine the delivery type immediately
              if (originCity && destinationCity) {
                console.log(
                  "Using stored city information to determine delivery type"
                );

                // Set the delivery type based on whether cities are the same
                if (
                  originCity.toLowerCase() === destinationCity.toLowerCase()
                ) {
                  deliveryType = "IN_CITY";
                  handleRadioChange(0); // Set to in-city
                } else {
                  deliveryType = "BETWEEN_CITIES";
                  handleRadioChange(1); // Set to between cities
                }
              } else {
                // If we don't have city information, try to determine it
                determineDeliveryType();
              }
            }
          } else {
            throw new Error("Coordinates out of valid range");
          }
        } else {
          throw new Error("Invalid coordinate format");
        }
      } catch (error) {
        console.error("Error parsing saved delivery coordinates:", error);
        // If there's an error parsing the saved coordinates,
        // we'll keep the current coordinates
      }
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });
  // Update the searchAddress function to show results
  async function searchAddress() {
    if (!addressSearchQuery.trim() || !autocompleteService) return;

    isSearchingAddress = true;
    addressSearchResults = [];
    showSearchResults = true;

    try {
      // First search for geocode (addresses)
      searchForType("geocode");

      // Then search for establishments if needed
      setTimeout(() => {
        if (addressSearchResults.length < 3) {
          searchForType("establishment");
        } else {
          // If we already have enough results from geocode, make sure to reset the flag
          isSearchingAddress = false;
        }

        // Add a safety timeout to ensure the flag is reset even if something goes wrong
        setTimeout(() => {
          isSearchingAddress = false;
        }, 3000);
      }, 300);
    } catch (error) {
      console.error("Error in place search:", error);
      isSearchingAddress = false;
    }
  }

  // Initialize Google Maps services when the map is ready
  function initializeGoogleServices(google: any) {
    if (!directionsService) {
      directionsService = new google.maps.DirectionsService();
    }
  }

  // Extend your existing map ready handler
  function handleMapReady(event: any) {
    const { google } = event.detail;

    // Create a dummy div for PlacesService (required but not used directly)
    const dummyElement = document.createElement("div");
    placesService = new google.maps.places.PlacesService(dummyElement);

    // Initialize autocomplete service
    autocompleteService = new google.maps.places.AutocompleteService();

    // Initialize geocoder
    geocoder = new google.maps.Geocoder();

    // Initialize directions service
    initializeGoogleServices(google);

    // Remove the code that creates the green marker and polyline
    // as we're using the directionsRenderer to show the route

    console.log("Google Maps services initialized from map component");

    // Trigger delivery type determination if we have both coordinates
    if (lat1 && lng1 && lat2 && lng2) {
      determineDeliveryType();
    }
  }

  // Helper function to search for a specific type
  function searchForType(type: "geocode" | "establishment") {
    if (!autocompleteService) {
      isSearchingAddress = false;
      return;
    }

    const request: google.maps.places.AutocompletionRequest = {
      input: addressSearchQuery,
      types: [type],
      // Optional: restrict to a specific region
      // componentRestrictions: { country: 'et' } // Ethiopia
    };

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
        // Process each prediction to get details
        const processedResults = predictions.slice(0, 5); // Limit to 5 results

        // If no results, reset the flag if this is the last search type
        if (processedResults.length === 0 && type === "establishment") {
          isSearchingAddress = false;
          return;
        }

        // For each prediction, get place details to extract coordinates
        let completedRequests = 0;
        processedResults.forEach((prediction) => {
          if (placesService) {
            placesService.getDetails(
              { placeId: prediction.place_id },
              (place, detailsStatus) => {
                completedRequests++;

                if (
                  detailsStatus === google.maps.places.PlacesServiceStatus.OK &&
                  place &&
                  place.geometry &&
                  place.geometry.location
                ) {
                  // Check if this place is already in results (avoid duplicates)
                  const isDuplicate = addressSearchResults.some(
                    (result) => result.place_id === prediction.place_id
                  );

                  if (!isDuplicate) {
                    // Add to results with coordinates
                    addressSearchResults = [
                      ...addressSearchResults,
                      {
                        place_id: prediction.place_id,
                        description: prediction.description,
                        address:
                          place.formatted_address || prediction.description,
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                      },
                    ];
                  }
                }

                // If this is the last request and the last search type, reset the flag
                if (
                  completedRequests === processedResults.length &&
                  type === "establishment"
                ) {
                  isSearchingAddress = false;
                }
              }
            );
          }
        });
      } else {
        // No results or error
        if (status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          console.error(`Place Autocomplete failed for type ${type}:`, status);
        }

        // Reset the flag if this is the last search type
        if (type === "establishment") {
          isSearchingAddress = false;
        }
      }
    });
  }

  // Select an address from search results
  function selectAddress(result: {
    place_id: string;
    description: string;
    address: string;
    lat: number;
    lng: number;
  }) {
    lat2 = result.lat;
    lng2 = result.lng;
    manualCoordinates = `${lat2},${lng2}`;
    receiversInfo.dropOffLocation = result.address;

    // Reverse geocode to get city information and check service region
    reverseGeocode(lat2, lng2);

    // Check if location is within service region
    checkServiceRegion(lat2, lng2);

    addressSearchResults = []; // Clear results after selection
    isSearchingAddress = false; // Reset the searching flag
    showSearchResults = false; // Hide search results
  }

  // Real implementation of reverse geocoding using Google Geocoder
  function reverseGeocode(latitude: number, longitude: number) {
    if (!geocoder) {
      console.error("Geocoder not initialized");
      return;
    }

    const latlng = { lat: latitude, lng: longitude };

    geocoder.geocode({ location: latlng }, (results, status) => {
      console.log(
        "Geocoder results for coordinates:",
        latitude,
        longitude,
        results
      );
      if (status === "OK" && results && results.length > 0) {
        // Get the most detailed result
        const address = results[0].formatted_address;
        receiversInfo.dropOffLocation = address;

        // Extract city information from address components
        let city = null;
        for (const component of results[0].address_components) {
          if (
            component.types.includes("locality") ||
            component.types.includes("administrative_area_level_2") ||
            component.types.includes("administrative_area_level_1")
          ) {
            city = component.long_name;
            console.log(
              "Found city component:",
              city,
              "type:",
              component.types
            );
            break;
          }
        }

        // If we still don't have a city, try to extract from the formatted address
        if (!city && results[0].formatted_address) {
          const extractedCity = extractCityFromAddress(
            results[0].formatted_address,
            data.pricingConfig.cities
          );
          if (extractedCity && extractedCity !== "Default City Used") {
            city = extractedCity;
            console.log("Extracted city from formatted address:", city);
          }
        }

        // Check if the city is in our pricing config
        if (city) {
          destinationCity = city;
          receiversInfo.destinationCity = city; // Store in receiversInfo
          console.log("city in receiver-info", city);
          // Check if this city is in our pricing config
          const cityInConfig = checkCityInPricingConfig(city);

          if (!cityInConfig) {
            // Try to find a nearby city in our pricing config
            const nearbyCity = findNearestConfiguredCity(latitude, longitude);
            if (nearbyCity) {
              console.log("Using nearby configured city:", nearbyCity);
              destinationCity = nearbyCity;
              receiversInfo.destinationCity = nearbyCity;
              locationError = null;
              isLocationInServiceArea = true;
            } else {
              locationError = `We don't currently service ${city} for delivery. Please select a location within our service areas.`;
              isLocationInServiceArea = false;
              // Update UI to show the location is outside service area
              receiversInfo.dropOffLocation =
                address + " (Outside service area)";
            }
          } else {
            locationError = null;
            isLocationInServiceArea = true;

            // Get the exact city name as it appears in the config
            const exactCityName = getServiceCityName(city);
            if (exactCityName) {
              destinationCity = exactCityName;
              receiversInfo.destinationCity = exactCityName; // Store in receiversInfo
            }

            // If we have both origin and destination cities, determine delivery type
            if (originCity && destinationCity) {
              determineDeliveryType();
            }
          }
        } else {
          // If we couldn't extract a city, try to find the nearest city in our config
          const nearbyCity = findNearestConfiguredCity(latitude, longitude);
          if (nearbyCity) {
            console.log("Found nearest city:", nearbyCity);
            destinationCity = nearbyCity;
            receiversInfo.destinationCity = nearbyCity;
            locationError = null;
            isLocationInServiceArea = true;

            // Update UI with the city we found
            receiversInfo.dropOffLocation = `${address} (Near ${nearbyCity})`;

            // If we have both origin and destination cities, determine delivery type
            if (originCity && destinationCity) {
              determineDeliveryType();
            }
          } else {
            // If we still couldn't determine a city, mark as outside service area
            locationError =
              "Could not determine city from this location. Please select a location within our service areas.";
            isLocationInServiceArea = false;
            receiversInfo.dropOffLocation = address + " (City not recognized)";
          }
        }
      } else {
        console.error("Geocoder failed due to: " + status);
        // Fallback to coordinates if geocoding fails
        receiversInfo.dropOffLocation = `Location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        locationError =
          "Could not determine address from these coordinates. Please select a different location.";
        isLocationInServiceArea = false;
      }

      // Always update the map location
      receiversInfo.dropOffMapLocation = `${latitude},${longitude}`;

      // Check service region with the updated city information
      checkServiceRegion(latitude, longitude);
    });
  }

  // Helper function to find the nearest city in our pricing config
  function findNearestConfiguredCity(latitude: number, longitude: number) {
    if (!data || !data.pricingConfig || !data.pricingConfig.cities) {
      return null;
    }

    const configuredCities = data.pricingConfig.cities;

    // Default coordinates for common cities if not found via geocoding
    const cityCoordinates: Record<string, { lat: number; lng: number }> = {
      "Addis Ababa": { lat: 9.0222, lng: 38.7468 },
      Adama: { lat: 8.5547, lng: 39.271 },
      Hawassa: { lat: 7.06, lng: 38.47 },
      "Bahir Dar": { lat: 11.5886, lng: 37.3909 },
      Mekelle: { lat: 13.4967, lng: 39.4667 },
      "Dire Dawa": { lat: 9.5908, lng: 41.8661 },
      Jimma: { lat: 7.6682, lng: 36.8347 },
      // Add more cities as needed
    };

    let closestCity = null;
    let smallestDistance = Infinity;

    for (const city of configuredCities) {
      if (cityCoordinates[city]) {
        const distance = calculateDistance(
          latitude,
          longitude,
          cityCoordinates[city].lat,
          cityCoordinates[city].lng
        );

        // If this city is closer than the current closest
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestCity = city;
        }
      }
    }

    // Only return the closest city if it's within a reasonable distance (e.g., 50km)
    if (smallestDistance <= 50) {
      return closestCity;
    }

    return null;
  }

  // Update manual coordinates when lat/lng change - always in lat,lng format
  $: manualCoordinates = `${lat2},${lng2}`;

  // Check service region whenever lat/lng changes
  $: {
    if (lat2 && lng2) {
      checkServiceRegion(lat2, lng2);
    }
  }

  // Delivery type determination
  let deliveryType: "IN_CITY" | "BETWEEN_CITIES" | null = null;
  let originCity = receiversInfo.originCity || "";
  let destinationCity = receiversInfo.destinationCity || "";
  let deliveryCity = receiversInfo.deliveryCity || "";
  let isLocationInServiceArea = true;

  // Distance and time calculation
  let distanceInKm: number | null = null;
  let estimatedTimeInMinutes: number | null = null;
  let directionsService: google.maps.DirectionsService | null = null;

  // Pricing variables
  let orderType = "STANDARD";
  let goodsType = "NORMAL";
  let packagingType = "STANDARD_BOX";
  let actualWeight = 0.5;
  let length: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let calculatedPrice = 0;
  let priceBreakdown: PriceBreakdown | null = null;
  let canCalculatePrice = false;
  let vehicleType: "BIKE" | "CAR" | "TRUCK" = "CAR";

  // Pricing parameters for the utility function
  let pricingParams: PricingParams | null = null;

  // Computed properties
  $: dimensionalWeight =
    length && width && height ? (length * width * height) / 5000 : 0;

  $: effectiveWeight = Math.max(actualWeight || 0, dimensionalWeight || 0);

  // Check if a point is inside a polygon (for region checking)
  function isPointInPolygon(point: number[], polygon: number[][]) {
    const x = point[0];
    const y = point[1];
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  // Add a helper function to check if a point is in a polygon
  function findRegionForPoint(lat: number, lng: number, regions: any[]) {
    if (!regions || regions.length === 0) {
      console.log("No regions data available");
      return null;
    }

    for (const region of regions) {
      if (
        !region.coordinates ||
        !Array.isArray(region.coordinates) ||
        region.coordinates.length === 0
      ) {
        console.log(
          `Invalid coordinates for region ${region.name || region.id}`
        );
        continue;
      }

      // Check if point is in polygon using ray casting algorithm
      let inside = false;
      const x = lng;
      const y = lat;

      for (
        let i = 0, j = region.coordinates.length - 1;
        i < region.coordinates.length;
        j = i++
      ) {
        const xi = region.coordinates[i][1]; // lng
        const yi = region.coordinates[i][0]; // lat
        const xj = region.coordinates[j][1]; // lng
        const yj = region.coordinates[j][0]; // lat

        const intersect =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
      }

      if (inside) {
        return region;
      }
    }

    return null;
  }

  // Original function with improvements
  async function determineDeliveryType() {
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      console.log("Missing coordinates");
      return;
    }

    console.log("All coordinates available, determining delivery type");
    console.log("originCity:", originCity, "destinationCity:", destinationCity);

    try {
      // First, we need to get the city names from the coordinates
      if (!originCity || originCity.startsWith("Location at")) {
        console.log("Origin city not valid, checking receiversInfo");

        // Check if we have a valid city in receiversInfo (passed from sender)
        if (
          receiversInfo.originCity &&
          !receiversInfo.originCity.startsWith("Location at")
        ) {
          console.log(
            "Using originCity from receiversInfo:",
            receiversInfo.originCity
          );
          originCity = receiversInfo.originCity;
        } else {
          console.log("No valid city found, using fallback");
          // Use coordinates as city names in this fallback case
          originCity = `Location at ${lat1.toFixed(4)}, ${lng1.toFixed(4)}`;
          receiversInfo.originCity = originCity;
        }
      }

      if (!destinationCity || destinationCity.startsWith("Location at")) {
        // Default fallback - set to between cities if coordinates are far apart
        if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
          // If distance is greater than 10km, assume between cities
          console.log(
            "Using distance-based fallback to determine delivery type"
          );
          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities

          // For destination, we'll still use coordinates if we don't have a good city
          destinationCity = `Location at ${lat2.toFixed(4)}, ${lng2.toFixed(4)}`;

          // Store in receiversInfo
          receiversInfo.destinationCity = destinationCity;
        } else {
          // If distance is less than 10km, assume in-city
          console.log(
            "Using distance-based fallback to determine delivery type (in-city)"
          );
          deliveryType = "IN_CITY";
          handleRadioChange(0); // Set to in-city

          // If we have a valid origin city, use it for destination too
          if (originCity && !originCity.startsWith("Location at")) {
            destinationCity = originCity;
            deliveryCity = originCity;
          } else {
            // Use default city
            destinationCity = "Addis Ababa";
            deliveryCity = "Addis Ababa";

            // If we don't have a valid origin city either, set it to default too
            if (!originCity || originCity.startsWith("Location at")) {
              originCity = "Addis Ababa";
            }
          }

          // Store in receiversInfo
          receiversInfo.originCity = originCity;
          receiversInfo.destinationCity = destinationCity;
          receiversInfo.deliveryCity = deliveryCity;
        }
      }

      // Check if both cities are in service regions using pricing config
      const originInConfig = checkCityInPricingConfig(originCity);
      const destinationInConfig = checkCityInPricingConfig(destinationCity);
      console.log(
        "Origin in config:",
        originInConfig,
        "Destination in config:",
        destinationInConfig
      );

      if (!originInConfig || !destinationInConfig) {
        console.log("One or both cities are outside service regions");
        toast.push(
          "One or both locations are outside our service regions. Please select different locations."
        );
        // Set inCity to between cities by default if regions can't be determined
        // Use distance-based fallback
        if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities
        } else {
          deliveryType = "IN_CITY";
          handleRadioChange(0); // Set to in-city
        }
        return;
      }

      // Get the exact city names as they appear in the config
      const exactOriginCity = getServiceCityName(originCity);
      const exactDestinationCity = getServiceCityName(destinationCity);
      console.log(
        "Exact origin city:",
        exactOriginCity,
        "Exact destination city:",
        exactDestinationCity
      );

      if (!exactOriginCity || !exactDestinationCity) {
        console.log("Could not find exact city names in config");
        // Use distance-based fallback
        if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities
        } else {
          deliveryType = "IN_CITY";
          handleRadioChange(0); // Set to in-city
        }
        return;
      }

      // If both locations are in the same city, it's in-city
      if (
        exactOriginCity.toLowerCase() === exactDestinationCity.toLowerCase()
      ) {
        console.log("Locations are in the same city - in-city delivery");
        originCity = exactOriginCity;
        destinationCity = exactDestinationCity;
        deliveryCity = exactOriginCity;

        // Store in receiversInfo
        receiversInfo.originCity = exactOriginCity;
        receiversInfo.destinationCity = exactDestinationCity;
        receiversInfo.deliveryCity = exactOriginCity;

        deliveryType = "IN_CITY";
        handleRadioChange(0); // Set to in-city
        toast.push(`In-city delivery within ${exactOriginCity} detected.`);
      } else {
        // Check if there's a route between these cities in the pricing matrix
        const routeAvailable = checkPricingRoute(
          exactOriginCity,
          exactDestinationCity,
          data.pricingConfig
        );
        console.log("Route available:", routeAvailable);

        if (routeAvailable) {
          console.log(
            "Locations are in different cities with available route - between cities"
          );
          originCity = exactOriginCity;
          destinationCity = exactDestinationCity;

          // Store in receiversInfo
          receiversInfo.originCity = exactOriginCity;
          receiversInfo.destinationCity = exactDestinationCity;

          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities
          toast.push(
            `Between cities delivery from ${exactOriginCity} to ${exactDestinationCity} detected.`
          );
        } else {
          console.log("No route available between these cities");
          toast.push(
            `We don't currently offer delivery service from ${exactOriginCity} to ${exactDestinationCity}. Please select different locations.`
          );
          // Set inCity to between cities by default
          deliveryType = "BETWEEN_CITIES"; // Still set a delivery type
          handleRadioChange(1); // Set to between cities
        }
      }

      // Calculate distance between points using Google Maps Directions Service
      // This will be handled by the GoogleMaps component's routeCalculated event
    } catch (error: any) {
      console.error("Error determining delivery type:", error);
      toast.push(
        "Error determining delivery type: " + (error.message || "Unknown error")
      );

      // Set a default delivery type even on error
      // Use distance-based fallback
      if (calculateDistance(lat1, lng1, lat2, lng2) > 10) {
        deliveryType = "BETWEEN_CITIES";
        handleRadioChange(1); // Set to between cities
      } else {
        deliveryType = "IN_CITY";
        handleRadioChange(0); // Set to in-city
      }
    }
  }

  // Helper function to calculate straight-line distance between two points
  function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  // Handle route calculation from Google Maps component
  function handleRouteCalculated(event: CustomEvent) {
    const { distance, duration, route } = event.detail;

    // Update the distance and time for use in the UI
    distanceInKm = distance;
    estimatedTimeInMinutes = duration;

    console.log(`Google Maps route calculated:`);
    console.log(`- Driving distance: ${distance.toFixed(2)} km`);
    console.log(`- Estimated driving time: ${duration} minutes`);
    console.log(`- Route details:`, route);

    // For between cities, make sure the distance is realistic
    if (deliveryType === "BETWEEN_CITIES") {
      // If distance is suspiciously small for between cities (< 10km),
      // check if we're dealing with Addis Ababa to Adama route
      if (
        distance < 10 &&
        originCity &&
        destinationCity &&
        originCity.toLowerCase().includes("addis") &&
        destinationCity.toLowerCase().includes("adama")
      ) {
        console.log(
          "Distance appears too small for Addis Ababa to Adama route, using manual distance"
        );
        // Addis Ababa to Adama is approximately 90km
        distanceInKm = 90;
        estimatedTimeInMinutes = 120; // About 2 hours
        console.log(
          `Using manual distance: ${distanceInKm} km and time: ${estimatedTimeInMinutes} min`
        );
      }
    }

    // Now that we have accurate distance, we can calculate price
    calculateLocalPrice();
  }

  // Calculate price based on all factors
  function calculateLocalPrice() {
    if (!deliveryType || !distanceInKm) {
      calculatedPrice = 0;
      priceBreakdown = null;
      return;
    }

    try {
      console.log("Calculating price with delivery type:", deliveryType);
      console.log("Origin city:", originCity);
      console.log("Destination city:", destinationCity);
      console.log("Distance:", distanceInKm);
      console.log("Time:", estimatedTimeInMinutes);

      // Get pricing config with proper type checking
      const pricingConfig = data?.pricingConfig || {};

      // Get customer type with fallback
      const customerType =
        (data as any)?.session?.customerData?.customerType || "INDIVIDUAL";

      console.log(
        "Customer type from session:",
        (data as any)?.session?.customerData?.customerType
      );
      console.log("Using customer type:", customerType);

      // Check if customer has premium status
      const isPremium = !!(data as any)?.session?.customerData?.premium;
      console.log("Premium status:", isPremium);

      // Make sure origin and destination cities are normalized
      const normalizedOriginCity = normalizeCity(
        originCity,
        pricingConfig.cities
      );
      const normalizedDestinationCity = normalizeCity(
        destinationCity,
        pricingConfig.cities
      );

      // Prepare pricing parameters
      pricingParams = {
        deliveryType: deliveryType === "IN_CITY" ? "IN_CITY" : "BETWEEN_CITIES",
        originCity: normalizedOriginCity,
        destinationCity: normalizedDestinationCity,
        distanceInKm,
        estimatedTimeInMinutes: estimatedTimeInMinutes || 0,
        customerType,
        hasSubscription: !!data?.session,
        isPremium,
        orderType,
        goodsType,
        packagingType,
        actualWeight: actualWeight || 0,
        dimensionalWeight: dimensionalWeight || 0,
        vehicleType,
      };

      console.log("Pricing parameters:", pricingParams);

      // Calculate price using the utility function
      const result = calculatePrice(pricingParams, pricingConfig);

      console.log("Price calculation result:", result);

      // Update the calculated price
      calculatedPrice = result.totalCost;

      // Store the price breakdown
      priceBreakdown = result;

      // Enable price display
      canCalculatePrice = true;

      console.log("Price calculation complete:", priceBreakdown);
    } catch (error: any) {
      console.error("Error calculating price:", error);
      // Use the toast library
      toast.push(
        "Error calculating price: " + (error.message || "Unknown error")
      );
    }
  }

  // Watch for changes in location data
  $: if (lat1 && lng1 && lat2 && lng2) {
    determineDeliveryType();
  }

  // Recalculate price when relevant factors change
  $: if (deliveryType && distanceInKm) {
    calculateLocalPrice();
  }

  // Also recalculate when these factors change
  $: if (
    orderType ||
    goodsType ||
    packagingType ||
    vehicleType ||
    actualWeight ||
    length ||
    width ||
    height
  ) {
    if (deliveryType && distanceInKm) {
      calculateLocalPrice();
    }
  }

  // Helper function to get vehicle multiplier safely
  function getVehicleMultiplier(): number {
    try {
      const city = originCity || "Addis Ababa";
      // Normalize vehicle type to match the case in the config (first letter uppercase)
      const normalizedVehicleType =
        vehicleType.charAt(0).toUpperCase() +
        vehicleType.slice(1).toLowerCase();

      if (
        data?.pricingConfig?.vehicleTypes &&
        data.pricingConfig.vehicleTypes[city] &&
        data.pricingConfig.vehicleTypes[city][normalizedVehicleType]
      ) {
        return data.pricingConfig.vehicleTypes[city][normalizedVehicleType];
      }
    } catch (error) {
      console.error("Error getting vehicle multiplier:", error);
    }
    return 1.0;
  }

  // Helper function to check if it's peak hour
  function isPeakHour(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= 17 && currentHour <= 19;
  }

  // Helper function to check if there's a peak hour multiplier in the config
  function hasPeakHourMultiplier(): boolean {
    try {
      const city = originCity || "Addis Ababa";
      return !!data?.pricingConfig?.inCityPricing?.[city]?.peakHourMultiplier;
    } catch (error) {
      return false;
    }
  }

  // Helper function to get peak hour multiplier safely
  function getPeakHourMultiplier(): number {
    try {
      const city = originCity || "Addis Ababa";
      if (
        data?.pricingConfig?.inCityPricing &&
        data.pricingConfig.inCityPricing[city] &&
        data.pricingConfig.inCityPricing[city].peakHourMultiplier
      ) {
        return data.pricingConfig.inCityPricing[city].peakHourMultiplier;
      }
    } catch (error) {
      console.error("Error getting peak hour multiplier:", error);
    }
    return 1.2; // Default peak hour multiplier if not found in config
  }

  // Add a helper function to check if a city is in the pricing configuration
  function checkCityInPricingConfig(city: string): boolean {
    if (!city) return false;

    // Normalize city name for comparison
    const normalizedCity = normalizeCity(city, data.pricingConfig.cities);
    console.log("normalizedCity", normalizedCity);

    // Check if the city is in the cities list
    const inCitiesList = data.pricingConfig.cities.some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // Check if the city is in inCityPricing
    const inCityPricing = Object.keys(
      data.pricingConfig.inCityPricing || {}
    ).some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // Check if the city is in vehicleTypes
    const inVehicleTypes = Object.keys(
      data.pricingConfig.vehicleTypes || {}
    ).some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // Check if the city is in additionalFees
    const inAdditionalFees = Object.keys(
      data.pricingConfig.additionalFees || {}
    ).some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // Check if the city is in pricingMatrix (as origin)
    const inPricingMatrix = Object.keys(
      data.pricingConfig.pricingMatrix || {}
    ).some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // If the city is in any of these lists, it's a service region
    return (
      inCitiesList ||
      inCityPricing ||
      inVehicleTypes ||
      inAdditionalFees ||
      inPricingMatrix
    );
  }

  // Get the exact city name as it appears in the config (preserving case)
  function getServiceCityName(city: string): string | null {
    if (!city) return null;

    return normalizeCity(city, data.pricingConfig.cities);
  }

  // Check if a route between two cities is available in the pricing matrix
  function isRouteAvailable(
    originCity: string,
    destinationCity: string
  ): boolean {
    return checkPricingRoute(originCity, destinationCity, data.pricingConfig);
  }

  // Function to check if coordinates are within service regions
  function checkServiceRegion(latitude: number, longitude: number) {
    // If we already have a city from location, check if it's in the pricing config
    if (destinationCity) {
      return checkCityInPricingConfig(destinationCity);
    }

    // If no city information yet, we'll need to wait for reverse geocoding
    // The reverseGeocode function will call checkCityInPricingConfig when it gets the city

    // Default to false until we can determine the city
    isLocationInServiceArea = false;
    return false;
  }

  // Accept originCity prop from parent component

  // Add this function to check if a string contains GPS coordinates format
  function isCoordinatesString(str: string): boolean {
    return (
      str.startsWith("Location at") ||
      /Location at \d+\.\d+, \d+\.\d+/.test(str)
    );
  }
</script>

<div class="{className} space-y-6" in:fade={{ duration: 300 }}>
  <div class="mb-6">
    <h2 class="text-xl font-bold text-gray-800 mb-2">Receiver Information</h2>
    <p class="text-gray-600 text-sm">
      Please provide details about where we'll deliver your package
    </p>
  </div>

  {#if !disableInput}
    <div class="mb-6">
      <form
        method="post"
        action="?/searchCustomer"
        use:enhance={({ formElement }) => {
          searchQuery = formElement.searchCustomer.value;
          isSearching = true;
          return async ({ update }) => {
            await update();
            formElement.searchCustomer.value = searchQuery;
            searchResultVisible = true;
            isSearching = false;
          };
        }}
        on:submit|stopPropagation={() => {}}
      >
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Search for existing customer (optional)
        </label>
        <div class="relative">
          <div class="flex">
            <div class="relative flex-grow">
              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
              >
                <Search class="w-5 h-5 text-gray-400" />
              </div>
              <input
                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
                placeholder="Search by name, email or phone"
                name="searchCustomer"
                type="search"
              />
            </div>
            <button
              type="submit"
              class="ml-2 bg-secondary text-white px-4 py-2 rounded-lg hover:bg-secondary/90 transition-colors flex items-center"
            >
              {#if isSearching}
                <svg
                  class="animate-spin h-5 w-5 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              {/if}
              Search
            </button>
          </div>
        </div>
      </form>
    </div>
  {/if}

  {#if form?.customerFound && searchResultVisible}
    <div class="mb-6" in:fly={{ y: 20, duration: 300, easing: cubicOut }}>
      <h3 class="text-sm font-medium text-gray-700 mb-2">Search Results</h3>
      <div class="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        {#each form?.customerFound as customer}
          <button
            class="w-full text-left hover:bg-gray-100 transition-colors p-4 border-b border-gray-200 last:border-b-0"
            type="button"
            on:click|preventDefault={() => {
              receiversInfo = {
                id: customer.id,
                userName: customer.User.userName ?? null,
                phoneNumber: customer.User.phoneNumber ?? null,
                dropOffLocation: customer.physicalAddress ?? null,
                dropOffMapLocation: customer.mapAddress ?? null,
                dropOffTime: null,
                inCity: receiversInfo.inCity || "",
                receiverEmail: customer.User.email ?? null,
              };
              searchResultVisible = false;
            }}
          >
            <div class="flex items-start">
              <div class="bg-secondary/20 p-2 rounded-full mr-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 text-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-800">
                  {customer.User.userName}
                </p>
                <p class="text-sm text-gray-600">{customer.User.email}</p>
                <p class="text-sm text-gray-600">{customer.User.phoneNumber}</p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="space-y-4">
    <div>
      <label
        for="receiverUsername"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Receiver's Name <span class="text-red-500">*</span>
      </label>
      <input
        id="receiverUsername"
        disabled={disableInput}
        bind:value={receiversInfo.userName}
        class="w-full p-3 border {errors.userName
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="receiverUsername"
        placeholder="Full name"
      />
      {#if errors.userName}
        <p class="mt-1 text-sm text-red-500">
          Please enter the receiver's name
        </p>
      {/if}
    </div>

    <div>
      <label
        for="receiverPhoneNumber"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Receiver's Phone Number <span class="text-red-500">*</span>
      </label>
      <input
        id="receiverPhoneNumber"
        disabled={disableInput}
        bind:value={receiversInfo.phoneNumber}
        class="w-full p-3 border {errors.phoneNumber
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="receiverPhoneNumber"
        placeholder="Phone number"
      />
      {#if errors.phoneNumber}
        <p class="mt-1 text-sm text-red-500">
          Please enter a valid phone number
        </p>
      {/if}
    </div>

    <div>
      <label
        for="receiverEmail"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Receiver's Email <span class="text-red-500">*</span>
      </label>
      <input
        id="receiverEmail"
        disabled={disableInput}
        bind:value={receiversInfo.receiverEmail}
        class="w-full p-3 border {errors.email
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="email"
        name="receiverEmail"
        placeholder="Email address"
      />
      {#if errors.email}
        <p class="mt-1 text-sm text-red-500">
          Please enter a valid email address
        </p>
      {/if}
    </div>

    <div class="w-full h-px bg-gray-200 my-6"></div>

    <div>
      <label
        for="dropOffTime"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Preferred Delivery Date <span class="text-red-500">*</span>
      </label>
      <input
        id="dropOffTime"
        disabled={disableInput}
        bind:value={receiversInfo.dropOffTime}
        bind:this={dateInput}
        on:click={() => {
          dateInput && dateInput.showPicker();
        }}
        class="w-full p-3 border {errors.dropOffTime
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="date"
        min={today}
        name="dropOffTime"
      />
      {#if errors.dropOffTime}
        <p class="mt-1 text-sm text-red-500">Please select a delivery date</p>
      {/if}
    </div>

    <div>
      <label
        for="dropOffLocation"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Delivery Address <span class="text-red-500">*</span>
      </label>
      <input
        id="dropOffLocation"
        disabled={disableInput}
        bind:value={receiversInfo.dropOffLocation}
        class="w-full p-3 border {errors.dropOffLocation
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="dropOffLocation"
        placeholder="Enter full address"
      />
      {#if errors.dropOffLocation}
        <p class="mt-1 text-sm text-red-500">
          Please enter a valid delivery address
        </p>
      {/if}
    </div>

    <div class="bg-gray-50 p-5 rounded-lg border border-gray-200">
      <h3 class="text-lg font-semibold text-gray-800 mb-3">
        Delivery Location
      </h3>

      <!-- Address Search with Autocomplete -->
      <div class="mb-4">
        <label
          for="addressSearch"
          class="block text-sm font-medium text-gray-700 mb-1"
        >
          Search for a location <span class="text-gray-500 text-xs"
            >(street, landmark, area)</span
          >
        </label>
        <div class="relative">
          <div class="flex" id="addressSearchContainer">
            <input
              id="addressSearch"
              bind:value={addressSearchQuery}
              disabled={disableInput}
              on:input={() => {
                if (addressSearchQuery.length > 2) {
                  searchAddress();
                } else {
                  addressSearchResults = [];
                  showSearchResults = false;
                }
              }}
              class="w-full p-3 border border-gray-300 rounded-l-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
              type="text"
              placeholder="Type to search for a location..."
            />
            <button
              type="button"
              disabled={disableInput ||
                isSearchingAddress ||
                addressSearchQuery.length < 3}
              class="bg-secondary text-white px-4 py-3 rounded-r-lg hover:bg-secondary/90 transition-colors flex items-center"
              on:click={searchAddress}
            >
              {#if isSearchingAddress}
                <svg
                  class="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              {/if}
            </button>

            <!-- Search Results Dropdown -->
            {#if addressSearchResults.length > 0 && showSearchResults}
              <div
                class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-60 overflow-auto"
                style="top: 100%;"
              >
                {#each addressSearchResults as result}
                  <button
                    type="button"
                    class="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    on:click={() => {
                      selectAddress(result);
                      showSearchResults = false;
                    }}
                  >
                    <div class="font-medium text-gray-800">
                      {result.description}
                    </div>
                    <div class="text-sm text-gray-500">{result.address}</div>
                  </button>
                {/each}
              </div>
            {:else if isSearchingAddress && showSearchResults}
              <div
                class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 p-4 text-center"
                style="top: 100%;"
              >
                <div class="flex justify-center items-center space-x-2">
                  <svg
                    class="animate-spin h-5 w-5 text-secondary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Searching locations...</span>
                </div>
              </div>
            {/if}
          </div>
          <p class="mt-1 text-xs text-gray-500">
            Search for a specific address, landmark, or area to pinpoint the
            delivery location
          </p>
        </div>
      </div>

      <!-- Map View with Clear Instructions -->
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <label class="block text-sm font-medium text-gray-700">
            Interactive Map
          </label>
          <button
            type="button"
            class="text-xs bg-secondary text-white px-3 py-1.5 rounded-full hover:bg-secondary/90 transition-colors flex items-center gap-1"
            on:click={getUserLocation}
            disabled={isLoadingLocation || disableInput}
          >
            {#if isLoadingLocation}
              <svg
                class="animate-spin h-3.5 w-3.5 mr-1"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Locating...
            {:else}
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Use my location
            {/if}
          </button>
        </div>

        {#if locationError}
          <div
            class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-3"
          >
            <div class="flex">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p class="text-sm whitespace-pre-line">{locationError}</p>
                {#if locationError.includes("check your browser settings")}
                  <div class="mt-2">
                    <button
                      type="button"
                      class="text-xs bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full hover:bg-yellow-200 transition-colors"
                      on:click={() => {
                        // Open browser settings instructions
                        const isIOS = /iPad|iPhone|iPod/.test(
                          navigator.userAgent
                        );
                        const isAndroid = /Android/.test(navigator.userAgent);
                        let helpText = "To enable location access:\n\n";

                        if (isIOS) {
                          helpText +=
                            "• Go to Settings > Privacy > Location Services\n• Enable Location Services\n• Find your browser and set to 'While Using'";
                        } else if (isAndroid) {
                          helpText +=
                            "• Go to Settings > Location\n• Turn on Location\n• Go to Settings > Apps > Your Browser > Permissions > Location\n• Allow location access";
                        } else {
                          helpText +=
                            "• Click the lock/info icon in your browser's address bar\n• Find location permissions and enable them\n• Refresh the page and try again";
                        }

                        alert(helpText);
                      }}
                    >
                      How to enable location
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Service Region Status -->
        {#if !isLocationInServiceArea && lat2 && lng2}
          <div
            class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3"
          >
            <div class="flex">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p class="text-sm font-medium">Location Out of Service Area</p>
                <p class="text-sm mt-1">
                  {#if locationError}
                    {locationError}
                  {:else}
                    We don't currently service this location. Please select a
                    delivery point within our service areas.
                  {/if}
                </p>
                <div class="mt-2">
                  <button
                    type="button"
                    class="text-xs bg-red-100 text-red-800 px-3 py-1.5 rounded-full hover:bg-red-200 transition-colors"
                    on:click={() => {
                      // Show available service regions
                      let regionsText = "Our service is available in:\n\n";
                      data.pricingConfig.cities.forEach((city) => {
                        regionsText += `• ${city}\n`;
                      });
                      // Also add cities from inCityPricing that aren't in the cities list
                      Object.keys(data.pricingConfig.inCityPricing).forEach(
                        (city) => {
                          if (!data.pricingConfig.cities.includes(city)) {
                            regionsText += `• ${city}\n`;
                          }
                        }
                      );
                      alert(regionsText);
                    }}
                  >
                    View service areas
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else if isLocationInServiceArea && destinationCity}
          <div
            class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-3"
          >
            <div class="flex">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div>
                <p class="text-sm font-medium">Location in Service Area</p>
                <p class="text-sm mt-1">
                  Your delivery location is in {destinationCity}, which is
                  within our service area.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <div class="relative">
          <div class="h-56 rounded-lg overflow-hidden border border-gray-300">
            {#key [lat2, lng2, lat1, lng1]}
              <GoogleMaps
                bind:lat={lat2}
                bind:lng={lng2}
                destinationLat={lat1 || 0}
                destinationLng={lng1 || 0}
                display={false}
                showSearchBox={false}
                showRoute={lat1 !== null && lng1 !== null}
                on:locationChanged={({ detail }) => {
                  if (!disableInput) {
                    lat2 = detail.lat;
                    lng2 = detail.lng;

                    // Reverse geocode to get address and check service region
                    reverseGeocode(lat2, lng2);

                    // Check if location is within service region
                    checkServiceRegion(lat2, lng2);

                    // Trigger delivery type determination when delivery location changes
                    if (lat1 && lng1) {
                      determineDeliveryType();
                    }
                  }
                }}
                on:routeCalculated={handleRouteCalculated}
                on:mapReady={handleMapReady}
                on:error={({ detail }) => {
                  console.error("Google Maps error:", detail);
                  locationError =
                    "There was an issue loading the map: " + detail.message;
                }}
              />
            {/key}
          </div>

          <!-- Map Instructions Overlay -->
          <div
            class="absolute top-2 right-2 bg-white/90 rounded-lg shadow-md p-3 max-w-[250px] border-l-4 border-secondary"
          >
            <p class="text-xs text-gray-700 mb-1">
              <span class="font-medium text-secondary">Delivery Route:</span>
              {#if lat1 && lng1}
                <span class="block mt-1">
                  <img
                    src={pickUp}
                    alt="Pickup location"
                    class="inline-block w-4 h-4 mr-1 align-middle"
                  />
                  Pickup location
                </span>
                <span class="block mt-1">
                  <img
                    src={dropOffIcon}
                    alt="Delivery location"
                    class="inline-block w-4 h-4 mr-1 align-middle"
                  />
                  Delivery location
                </span>
                <span class="block mt-1">
                  <span
                    class="inline-block w-12 h-1.5 bg-primary rounded-full mr-1"
                  ></span>
                  Driving route
                </span>
              {:else}
                <span class="block mt-1"
                  >Set your delivery location by dragging the pin or clicking on
                  the map.</span
                >
              {/if}
            </p>

            {#if distanceInKm && estimatedTimeInMinutes}
              <div class="mt-2 pt-2 border-t border-gray-200">
                <div class="flex items-center text-xs text-gray-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 mr-1 text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  <span class="font-medium">{distanceInKm.toFixed(1)} km</span>
                </div>
                <div class="flex items-center text-xs text-gray-700 mt-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 mr-1 text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="font-medium">{estimatedTimeInMinutes} min</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Coordinates Input -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            for="coordinates"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Coordinates
          </label>
          <div class="flex items-center">
            <input
              id="coordinates"
              bind:value={manualCoordinates}
              disabled={disableInput}
              class="w-full p-2 border border-gray-300 rounded-lg text-gray-700 text-sm focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
              type="text"
              name="mapAddress"
              placeholder="e.g. 9.01, 38.74"
            />
            <button
              type="button"
              disabled={disableInput}
              class="ml-2 p-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors"
              on:click={updateCoordinatesFromInput}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Quick Locations -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Quick Locations
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={() => {
                lat2 = 9.01;
                lng2 = 38.74;
                manualCoordinates = `${lat2},${lng2}`;
                reverseGeocode(lat2, lng2);
              }}
            >
              Addis Ababa
            </button>
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={() => {
                lat2 = 8.9806;
                lng2 = 38.7578;
                manualCoordinates = `${lat2},${lng2}`;
                reverseGeocode(lat2, lng2);
              }}
            >
              Bole
            </button>
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={() => {
                lat2 = 9.0092;
                lng2 = 38.7645;
                manualCoordinates = `${lat2},${lng2}`;
                reverseGeocode(lat2, lng2);
              }}
            >
              Piazza
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Elegant Delivery Route Visualization -->
    {#if lat1 && lng1}
      <div
        class="mb-4 p-4 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow transition-all"
      >
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-medium text-gray-800">Delivery Route</h4>
          {#if distanceInKm && calculatedPrice > 0}
            <div class="bg-secondary/10 px-3 py-1 rounded-full">
              <span class="text-secondary font-semibold"
                >${calculatedPrice.toFixed(2)}</span
              >
            </div>
          {/if}
        </div>

        <!-- Route visualization with improved styling -->
        <div
          class="relative pl-6 border-l-2 border-dashed border-gray-200 mb-4"
        >
          <!-- Pickup location -->
          <div class="flex items-start mb-4 relative">
            <div
              class="absolute -left-[22px] bg-secondary/20 p-2 rounded-full flex-shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div class="flex-1 ml-3">
              <p class="text-sm font-medium text-gray-700">Pickup Location</p>
              <p class="text-xs text-gray-500 mt-0.5">
                {#if originCity}
                  <span class="font-medium">{originCity}</span> •
                {/if}
                <span>({lat1.toFixed(4)}, {lng1.toFixed(4)})</span>
              </p>
            </div>
          </div>

          <!-- Delivery location -->
          {#if lat2 && lng2}
            <div class="flex items-start relative">
              <div
                class="absolute -left-[22px] bg-primary/20 p-2 rounded-full flex-shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div class="flex-1 ml-3">
                <p class="text-sm font-medium text-gray-700">
                  Delivery Location
                </p>
                <p class="text-xs text-gray-500 mt-0.5">
                  {#if destinationCity}
                    <span class="font-medium">{destinationCity}</span> •
                  {/if}
                  <span>({lat2.toFixed(4)}, {lng2.toFixed(4)})</span>
                </p>
              </div>
            </div>
          {/if}
        </div>

        {#if distanceInKm && estimatedTimeInMinutes && deliveryType}
          <div class="rounded-lg border border-gray-100 overflow-hidden">
            <!-- Delivery summary -->
            <div class="p-3 bg-gray-50 border-b border-gray-100">
              <div class="flex justify-between items-center">
                <div>
                  <p class="text-sm font-medium text-gray-700">
                    {deliveryType === "IN_CITY"
                      ? "In-city delivery"
                      : "Between cities delivery"}
                  </p>
                  <p class="text-xs text-gray-600 mt-0.5">
                    {#if deliveryType === "IN_CITY"}
                      Within {originCity}
                    {:else}
                      From {originCity} to {destinationCity}
                    {/if}
                  </p>
                </div>
                <div class="flex items-center space-x-3">
                  <div class="text-right">
                    <p class="text-xs text-gray-600">Distance</p>
                    <p class="text-sm font-medium text-gray-700">
                      {distanceInKm.toFixed(1)} km
                    </p>
                  </div>
                  {#if calculatedPrice > 0}
                    <div class="text-right">
                      <p class="text-xs text-gray-600">Price</p>
                      <p class="text-sm font-bold text-secondary">
                        ${calculatedPrice.toFixed(2)}
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Delivery time estimate -->
            <div class="p-3 bg-white">
              <div class="flex items-center">
                <div class="relative mr-3">
                  <div
                    class="w-8 h-8 bg-secondary rounded-full flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div
                    class="absolute -top-1 -right-1 -left-1 -bottom-1 rounded-full border-2 border-secondary animate-ping opacity-75"
                  ></div>
                </div>
                <div class="flex-1">
                  <div class="flex justify-between items-center">
                    <p class="text-xs text-gray-600">
                      Estimated delivery timeframe
                    </p>
                    {#if orderType === "EXPRESS"}
                      <span
                        class="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-medium rounded-full uppercase"
                        >Express</span
                      >
                    {:else if orderType === "SAME_DAY"}
                      <span
                        class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full uppercase"
                        >Same Day</span
                      >
                    {/if}
                  </div>
                  <p class="text-sm font-medium mt-0.5">
                    {#if deliveryType === "IN_CITY"}
                      {#if orderType === "EXPRESS"}
                        <span class="text-rose-600 font-semibold"
                          >Priority delivery in {Math.max(
                            15,
                            Math.ceil((estimatedTimeInMinutes || 20) * 0.6)
                          )} minutes</span
                        >
                      {:else if orderType === "SAME_DAY"}
                        <span class="text-indigo-600 font-semibold"
                          >Today, within {Math.max(
                            30,
                            Math.ceil((estimatedTimeInMinutes || 30) * 0.8)
                          )} minutes</span
                        >
                      {:else}
                        <span class="text-green-600">
                          {#if (estimatedTimeInMinutes || 30) < 30}
                            Approximately 30-45 minutes
                          {:else if (estimatedTimeInMinutes || 45) < 60}
                            Within the hour
                          {:else}
                            Within {Math.ceil(
                              (estimatedTimeInMinutes || 60) / 15
                            ) * 15} minutes
                          {/if}
                        </span>
                      {/if}
                    {:else}
                      <!-- Between cities delivery estimates -->
                      {#if orderType === "EXPRESS"}
                        <span class="text-rose-600 font-semibold">
                          Expedited delivery to {destinationCity}
                          <span class="block text-xs text-rose-500"
                            >First available transit • Priority handling</span
                          >
                        </span>
                      {:else if orderType === "SAME_DAY"}
                        <span class="text-indigo-600 font-semibold">
                          Today, guaranteed by {new Date(
                            new Date().setHours(19, 0)
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          <span class="block text-xs text-indigo-500"
                            >Special routing • Quick turnaround</span
                          >
                        </span>
                      {:else}
                        <span class="text-gray-800 font-medium">
                          {#if originCity
                            .toLowerCase()
                            .includes("addis") && destinationCity
                              .toLowerCase()
                              .includes("adama")}
                            Tomorrow, before noon
                            <span class="block text-xs text-gray-500"
                              >Next-day delivery to Adama</span
                            >
                          {:else if distanceInKm < 150}
                            Tomorrow, by end of day
                            <span class="block text-xs text-gray-500"
                              >Standard intercity delivery</span
                            >
                          {:else}
                            1-2 business days
                            <span class="block text-xs text-gray-500"
                              >Standard service to {destinationCity}</span
                            >
                          {/if}
                        </span>
                      {/if}
                    {/if}
                  </p>
                </div>
              </div>

              <!-- Delivery guarantee section -->
              <div
                class="mt-3 bg-green-50 rounded-lg p-2 border border-green-100"
              >
                <div class="flex items-start">
                  <svg
                    class="h-5 w-5 text-green-600 mr-1.5 mt-0.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <div class="text-xs text-green-800">
                    <span class="font-medium">Delivery guarantee:</span> We'll
                    deliver on time or you'll receive a {orderType === "EXPRESS"
                      ? "100%"
                      : orderType === "SAME_DAY"
                        ? "75%"
                        : "50%"} refund on shipping.
                  </div>
                </div>
              </div>

              {#if calculatedPrice > 0}
                <div
                  class="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center"
                >
                  <div class="flex items-center space-x-1">
                    <span
                      class="inline-block px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700 font-medium"
                      >{vehicleType}</span
                    >
                    <span
                      class="inline-block px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700 font-medium"
                      >{goodsType}</span
                    >
                    <span
                      class="inline-block px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700 font-medium"
                      >{packagingType.replace("_", " ")}</span
                    >
                    {#if isPeakHour()}
                      <span
                        class="inline-block px-2 py-1 bg-yellow-100 rounded-full text-xs text-yellow-800 font-medium animate-pulse"
                        >PEAK HOURS</span
                      >
                    {/if}
                  </div>
                  <div class="flex items-center">
                    <div class="relative">
                      <span
                        class="inline-block h-2 w-2 bg-green-500 rounded-full mr-1.5 animate-ping absolute"
                      ></span>
                      <span
                        class="inline-block h-2 w-2 bg-green-500 rounded-full mr-1.5 relative"
                      ></span>
                    </div>
                    <span class="text-sm font-medium text-green-700"
                      >Ready for checkout</span
                    >
                  </div>
                </div>
              {/if}

              <!-- Limited time offer -->
              {#if isPeakHour() && deliveryType === "BETWEEN_CITIES"}
                <div class="mt-3 flex items-center justify-center">
                  <div
                    class="px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-full"
                  >
                    <p class="text-xs text-yellow-800 font-medium">
                      🔥 High demand for {destinationCity} routes – Limited spots
                      available
                    </p>
                  </div>
                </div>
              {:else if deliveryType === "IN_CITY" && !isPeakHour()}
                <div class="mt-3 flex items-center justify-center">
                  <div
                    class="px-3 py-1 bg-blue-50 border border-blue-200 rounded-full"
                  >
                    <p class="text-xs text-blue-800 font-medium">
                      ⚡ Off-peak special: Faster delivery times currently
                      available!
                    </p>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="mb-6">
      <div class="bg-gray-50 p-5 rounded-lg border border-gray-200">
        <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
          Delivery Details & Pricing
          {#if calculatedPrice > 0}
            <span
              class="ml-2 text-sm bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-normal"
            >
              ${calculatedPrice.toFixed(2)}
            </span>
          {/if}
        </h3>

        <!-- Delivery Type Information -->
        <div class="mb-4 p-3 bg-white rounded-lg border border-gray-100">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium text-gray-800">Delivery Type</h4>
              {#if deliveryType}
                <p class="text-sm mt-1">
                  {#if deliveryType === "IN_CITY"}
                    <span class="text-green-600 font-medium"
                      >In-City Delivery</span
                    >
                    <span class="text-gray-500 text-xs block mt-0.5">
                      Both pickup and delivery locations are within {deliveryCity}
                    </span>
                  {:else}
                    <span class="text-blue-600 font-medium">Between Cities</span
                    >
                    <span class="text-gray-500 text-xs block mt-0.5">
                      From {originCity} to {destinationCity}
                    </span>
                  {/if}
                </p>
              {:else}
                <p class="text-sm text-gray-500 mt-1">
                  Please select both pickup and delivery locations
                </p>
              {/if}
            </div>

            {#if deliveryType && distanceInKm}
              <div class="text-right">
                <span class="text-xs text-gray-500">Distance</span>
                <p class="font-medium text-gray-800">
                  {distanceInKm.toFixed(1)} km
                </p>
                {#if estimatedTimeInMinutes}
                  <p class="text-xs text-gray-500">
                    Est. time: {estimatedTimeInMinutes} min
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <!-- Real-time Price Estimation -->
        {#if canCalculatePrice && deliveryType}
          <span></span>
        {:else if lat1 && lng1 && lat2 && lng2}
          <div
            class="mb-4 p-4 bg-white rounded-lg border border-gray-100 text-center"
          >
            <p class="text-gray-600">
              {#if !isLocationInServiceArea}
                {#if locationError}
                  {locationError}
                {:else}
                  One or both locations are outside our service area.
                {/if}
              {:else}
                Please complete all required fields to see price estimate.
              {/if}
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="flex justify-between gap-4 mt-8">
    <button
      type="button"
      on:click|preventDefault={() => dispatch("back")}
      class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
    >
      <Add /> Back
    </button>

    <button
      type="button"
      on:click={handleNext}
      class="bg-secondary text-white font-medium py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
    >
      Continue <ArrowRight />
    </button>
  </div>
</div>
