<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import { toast } from "@zerodevx/svelte-toast";
  import { createEventDispatcher, onMount } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type { PageData } from "./$types";
  // Import SuperForm types
  import type { CreateOrderFormInput } from "$lib/utils/schemas/create-order";

  import { dateProxy, superForm } from "sveltekit-superforms/client";

  // Create dispatcher for emitting events back to parent
  const dispatch = createEventDispatcher<{
    next: { coordinates?: { lat: number; lng: number }; senderInfo: any };
    back: undefined;
  }>();

  export let data: PageData;
  export let orderForm: ReturnType<typeof superForm<CreateOrderFormInput>>;
  export let className = "";

  const { form, errors, enhance, constraints, message, submitting } = orderForm;

  // Default coordinates (central location in service area)
  let lat: number = 9.01;
  let lng: number = 38.74;
  let dateInput: HTMLInputElement;

  // State variables
  let isLoadingLocation = false;
  let locationError: string | null = null;
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
  let manualCoordinates = `${lat},${lng}`;
  let isMapVisible = true;
  let pickupDate: string = "";
  let pickupTime: string = "";

  // Region validation
  let isInServiceRegion = false;
  let currentRegion: any = null;
  let cityFromLocation: string | null = null;
  let serviceCityName: string | null = null;

  // Quick location highlight
  let quickLocationHighlight = false;
  let locationNotification: string | null = null;
  let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split("T")[0];

  // Initialize form values from session data in onMount
  onMount(() => {
    // Set default values from session if available
    if ($page.data.session?.userData) {
      if (!$form.userName && $page.data.session?.userData?.userName) {
        $form.userName = $page.data.session.userData.userName;
      }
      if (!$form.phoneNumber && $page.data.session?.userData?.phoneNumber) {
        $form.phoneNumber = $page.data.session.userData.phoneNumber;
      }
    }

    if ($page.data.session?.customerData) {
      if (
        !$form.pickUpLocation &&
        $page.data.session?.customerData?.physicalAddress
      ) {
        $form.pickUpLocation = $page.data.session.customerData.physicalAddress;
      }
      if (!$form.mapAddress && $page.data.session?.customerData?.mapAddress) {
        $form.mapAddress = $page.data.session.customerData.mapAddress;
      }
    }

    // Initialize date and time from form when component loads
    if ($form.pickUpTime) {
      try {
        const dateTime = new Date($form.pickUpTime);
        if (!isNaN(dateTime.getTime())) {
          pickupDate = dateTime.toISOString().split("T")[0];
          pickupTime = dateTime.toTimeString().substring(0, 5);
        }
      } catch (e) {
        console.error("Error parsing pickup time:", e);
      }
    }

    // Check if user already has coordinates saved in mapAddress
    if ($form.mapAddress && $form.mapAddress !== "") {
      try {
        // Parse coordinates from mapAddress
        const coords = $form.mapAddress
          .split(",")
          .map((coord) => parseFloat(coord.trim()));

        // Check if we have two valid numbers
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          // Always treat the first value as latitude and second as longitude
          // This ensures consistency regardless of how they were stored
          let savedLat = coords[0];
          let savedLng = coords[1];

          // Validate the coordinates are in reasonable ranges
          // If they appear to be reversed (lng, lat instead of lat, lng), swap them
          if (Math.abs(savedLat) > 90 && Math.abs(savedLng) <= 90) {
            // Coordinates are likely reversed (lng,lat format)
            console.log("Detected reversed coordinates, fixing order");
            const temp = savedLat;
            savedLat = savedLng;
            savedLng = temp;
          }

          // Final validation of coordinate ranges
          if (Math.abs(savedLat) <= 90 && Math.abs(savedLng) <= 180) {
            // Valid coordinates found in mapAddress
            lat = savedLat;
            lng = savedLng;
            // Always store coordinates in lat,lng format for consistency
            manualCoordinates = `${lat},${lng}`;

            // Check if location is within service region
            checkServiceRegion(lat, lng);

            // Reverse geocode to get the address
            setTimeout(() => {
              if (geocoder) {
                reverseGeocode(lat, lng, true);
              }
            }, 1000);
          }
        }
      } catch (error) {
        console.error("Error parsing saved coordinates:", error);
        // If there's an error parsing the saved coordinates,
        // we'll try to get the user's location instead
        setTimeout(() => {
          tryGetUserLocation();
        }, 1000);
      }
    } else {
      // No saved location, try to get user location immediately
      setTimeout(() => {
        tryGetUserLocation();
        showLocationNotification(
          "Setting your current location as the pickup point..."
        );
      }, 1000);
    }

    // Initial region check with current coordinates
    checkServiceRegion(lat, lng);
  });

  $: pickUpDateProxy = dateProxy(orderForm, "pickUpTime", {
    format: "datetime-local",
  });

  // Helper functions for location permissions
  function checkLocationPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!navigator.permissions) {
        resolve(true); // Can't check permissions, assume allowed
        return;
      }

      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
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

  // Function to check if coordinates are within any service region
  function checkServiceRegion(latitude: number, longitude: number) {
    // If we already have a city from location, check if it's in the pricing config
    if (cityFromLocation) {
      return checkCityInPricingConfig(cityFromLocation);
    }

    // Default to false until we can determine the city
    isInServiceRegion = false;
    return false;
  }

  // Helper function to check if a city is in the pricing configuration
  function checkCityInPricingConfig(city: string) {
    if (!city) return false;

    // Normalize city name for comparison (lowercase and trim)
    const normalizedCity = city.trim();

    // Check if the city is in the cities list
    const inCitiesList = data.pricingConfig.cities.some(
      (configCity) => configCity.toLowerCase() === normalizedCity.toLowerCase()
    );

    // Check if the city is in inCityPricing
    const inCityPricing = Object.keys(data.pricingConfig.inCityPricing).some(
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
    isInServiceRegion =
      inCitiesList ||
      inCityPricing ||
      inVehicleTypes ||
      inAdditionalFees ||
      inPricingMatrix;

    if (isInServiceRegion) {
      // Find the exact city name as it appears in the config (preserving case)
      if (inCitiesList) {
        serviceCityName =
          data.pricingConfig.cities.find(
            (configCity) =>
              configCity.toLowerCase() === normalizedCity.toLowerCase()
          ) || null;
      } else if (inCityPricing) {
        serviceCityName =
          Object.keys(data.pricingConfig.inCityPricing).find(
            (configCity) =>
              configCity.toLowerCase() === normalizedCity.toLowerCase()
          ) || null;
      } else if (inVehicleTypes && data.pricingConfig.vehicleTypes) {
        serviceCityName =
          Object.keys(data.pricingConfig.vehicleTypes).find(
            (configCity) =>
              configCity.toLowerCase() === normalizedCity.toLowerCase()
          ) || null;
      } else if (inAdditionalFees && data.pricingConfig.additionalFees) {
        serviceCityName =
          Object.keys(data.pricingConfig.additionalFees).find(
            (configCity) =>
              configCity.toLowerCase() === normalizedCity.toLowerCase()
          ) || null;
      } else if (inPricingMatrix && data.pricingConfig.pricingMatrix) {
        serviceCityName =
          Object.keys(data.pricingConfig.pricingMatrix).find(
            (configCity) =>
              configCity.toLowerCase() === normalizedCity.toLowerCase()
          ) || null;
      }
    } else {
      serviceCityName = null;
    }

    return isInServiceRegion;
  }

  // Try to get user's current location
  async function tryGetUserLocation() {
    const isAutoRequest = !isLoadingLocation;

    if (!isAutoRequest) {
      isLoadingLocation = true;
      locationNotification = "Requesting your location...";
    }

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
          });
        }
      );

      // Success - handle the position
      lat = position.coords.latitude;
      lng = position.coords.longitude;
      // Always store in lat,lng format
      manualCoordinates = `${lat},${lng}`;

      // Save the location to mapAddress
      $form.mapAddress = `${lat},${lng}`;

      checkServiceRegion(lat, lng);
      reverseGeocode(lat, lng, isAutoRequest);

      locationError = null;
      if (!isAutoRequest) {
        isLoadingLocation = false;
        showLocationNotification(
          "Your current location has been set as the pickup point."
        );
      }
    } catch (error) {
      console.error("Geolocation error:", error);

      // Try IP geolocation as fallback
      await tryIPGeolocation(isAutoRequest);

      if (!isAutoRequest) {
        isLoadingLocation = false;
      }
    }
  }

  // Use IP-based geolocation as a fallback
  async function tryIPGeolocation(isAutoRequest: boolean): Promise<boolean> {
    try {
      console.log("Attempting IP-based geolocation...");

      // Try to fetch location from ipapi.co
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) {
        throw new Error(`IP geolocation failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (
        data &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number"
      ) {
        // Update coordinates
        lat = data.latitude;
        lng = data.longitude;
        // Always store in lat,lng format
        manualCoordinates = `${lat},${lng}`;

        // Save the location to mapAddress
        $form.mapAddress = `${lat},${lng}`;

        // Check if location is within service region
        checkServiceRegion(lat, lng);

        // Attempt to reverse geocode the coordinates to get an address
        if (geocoder) {
          reverseGeocode(lat, lng, isAutoRequest);
        } else if (data.city) {
          cityFromLocation = data.city;
          $form.pickUpLocation = `${data.city}, ${data.country_name}`;
        }

        locationError = null;
        if (!isAutoRequest) isLoadingLocation = false;

        // Show a success notification
        if (!isAutoRequest) {
          showLocationNotification(
            "Your approximate location has been set as the pickup point."
          );
        } else {
          showLocationNotification(
            "Using your approximate location as the pickup point."
          );
        }

        return true;
      } else {
        throw new Error("IP geolocation returned invalid data");
      }
    } catch (error) {
      console.error("IP geolocation failed:", error);

      // Try alternative IP geolocation service
      try {
        const response = await fetch("https://get.geojs.io/v1/ip/geo.json");
        if (!response.ok) {
          throw new Error(
            `Alternative IP geolocation failed: ${response.statusText}`
          );
        }

        const data = await response.json();

        if (
          data &&
          typeof data.latitude === "string" &&
          typeof data.longitude === "string"
        ) {
          // Update coordinates
          lat = parseFloat(data.latitude);
          lng = parseFloat(data.longitude);
          // Always store in lat,lng format
          manualCoordinates = `${lat},${lng}`;

          // Save the location to mapAddress
          $form.mapAddress = `${lat},${lng}`;

          // Check if location is within service region
          checkServiceRegion(lat, lng);

          // Attempt to reverse geocode the coordinates to get an address
          if (geocoder) {
            reverseGeocode(lat, lng, isAutoRequest);
          } else if (data.city) {
            cityFromLocation = data.city;
            $form.pickUpLocation = `${data.city}, ${data.country}`;
          }

          locationError = null;
          if (!isAutoRequest) isLoadingLocation = false;

          // Show a success notification
          if (!isAutoRequest) {
            showLocationNotification(
              "Your approximate location has been set as the pickup point."
            );
          }

          return true;
        } else {
          throw new Error("Alternative IP geolocation returned invalid data");
        }
      } catch (altError) {
        console.error("Alternative IP geolocation failed:", altError);
        // Use default location as fallback
        useDefaultLocation(isAutoRequest);
        return false;
      }
    }
  }

  // Set default location (Addis Ababa)
  function useDefaultLocation(isAutoRequest: boolean): void {
    console.log("Using default location (Addis Ababa)");

    // Use Addis Ababa coordinates as fallback
    lat = 9.01;
    lng = 38.74;
    // Always store in lat,lng format
    manualCoordinates = `${lat},${lng}`;

    // Save the location to mapAddress
    $form.mapAddress = `${lat},${lng}`;

    // Check if location is within service region
    checkServiceRegion(lat, lng);

    // Attempt to reverse geocode the coordinates to get an address
    reverseGeocode(lat, lng, isAutoRequest);

    locationError = null;
    if (!isAutoRequest) isLoadingLocation = false;

    // Show a notification about using default location
    if (!isAutoRequest) {
      showLocationNotification(
        "Using Addis Ababa as default location. Please adjust if needed."
      );
    } else {
      showLocationNotification("Using Addis Ababa as default location.");
    }
  }

  // Enhanced reverse geocoding to extract city information
  function reverseGeocode(
    latitude: number,
    longitude: number,
    isAutoRequest: boolean = false
  ) {
    if (!geocoder) {
      console.error("Geocoder not initialized");
      // Set fallback address format using coordinates
      $form.pickUpLocation = `Location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      // Still ensure the mapAddress is set correctly
      $form.mapAddress = `${latitude},${longitude}`;
      // Use Addis Ababa as the default city
      cityFromLocation = "Addis Ababa";
      checkCityInPricingConfig(cityFromLocation);

      showLocationNotification(
        "Using coordinates as pickup point (geocoder unavailable)."
      );
      return;
    }

    const latlng = { lat: latitude, lng: longitude };

    geocoder.geocode({ location: latlng }, (results, status) => {
      if (status === "OK" && results && results.length > 0) {
        // Get the most detailed result
        const address = results[0].formatted_address;
        $form.pickUpLocation = address;

        // Extract city information from address components
        let city = null;
        for (const component of results[0].address_components) {
          if (
            component.types.includes("locality") ||
            component.types.includes("administrative_area_level_2")
          ) {
            city = component.long_name;
            break;
          }
        }

        // Check if the city is in our pricing config
        if (city) {
          cityFromLocation = city;
          console.log("city in sender-info", city);
          // Check if this city is in our pricing config
          const cityInConfig = checkCityInPricingConfig(city);

          if (!cityInConfig) {
            locationError = `We don't currently service ${city}. Please select a location within our service areas.`;
          } else {
            locationError = null;

            // Show a notification for auto-requests
            if (isAutoRequest) {
              showLocationNotification(
                `Using your current location in ${city} as the pickup point.`
              );
            }
          }
        } else if (isAutoRequest) {
          // Generic notification if city couldn't be determined
          showLocationNotification(
            "Using your current location as the pickup point."
          );
        }
      } else {
        console.error("Geocoder failed due to: " + status);
        // Fallback to coordinates if geocoding fails
        $form.pickUpLocation = `Location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        // Still ensure the mapAddress is set correctly
        $form.mapAddress = `${latitude},${longitude}`;

        // If geocoding failed, set Addis Ababa as the default city
        cityFromLocation = "Addis Ababa";
        checkCityInPricingConfig(cityFromLocation);

        if (status === "REQUEST_DENIED") {
          showLocationNotification(
            "Geocoding temporarily unavailable. Using coordinates as pickup point."
          );
        } else if (isAutoRequest) {
          showLocationNotification(
            "Using your current location as the pickup point."
          );
        }
      }
    });
  }

  // Function to show a temporary notification
  function showLocationNotification(message: string) {
    // Clear any existing notification
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    // Show the new notification
    locationNotification = message;

    // Auto-hide after 5 seconds
    notificationTimeout = setTimeout(() => {
      locationNotification = null;
    }, 5000);
  }

  // Utility function to get user location
  function getUserLocation() {
    isLoadingLocation = true;
    tryGetUserLocation();
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
          lat = newLat;
          lng = newLng;
          // Always store in lat,lng format
          manualCoordinates = `${lat},${lng}`;

          // Save the location to mapAddress
          $form.mapAddress = `${lat},${lng}`;

          // Check if location is within service region
          checkServiceRegion(lat, lng);

          // Attempt to reverse geocode the coordinates to get an address
          reverseGeocode(lat, lng);

          // Show a notification that the location has been set
          showLocationNotification("Coordinates updated");
        } else {
          // Invalid range
          toast.push(
            "Invalid coordinates: values out of range. Latitude must be between -90 and 90, longitude between -180 and 180."
          );
        }
      } else {
        // Invalid format
        toast.push(
          "Invalid coordinates format. Please use format: latitude, longitude"
        );
      }
    } catch (e) {
      // Reset to current values if parsing fails
      manualCoordinates = `${lat},${lng}`;
      toast.push(
        "Invalid coordinates format. Please use format: latitude, longitude"
      );
    }
  }

  // Real implementation of address search using Google Places API
  async function searchAddress() {
    if (!addressSearchQuery.trim() || !autocompleteService) return;

    isSearchingAddress = true;
    addressSearchResults = [];

    try {
      // First search for geocode (addresses)
      searchForType("geocode");

      // Then search for establishments if needed
      setTimeout(() => {
        if (addressSearchResults.length < 3) {
          searchForType("establishment");
        }
      }, 300);
    } catch (error) {
      console.error("Error in place search:", error);
      isSearchingAddress = false;
    }
  }

  // Helper function to search for a specific type
  function searchForType(type: "geocode" | "establishment") {
    if (!autocompleteService) return;

    const request: google.maps.places.AutocompletionRequest = {
      input: addressSearchQuery,
      types: [type],
    };

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
        // Process each prediction to get details
        const processedResults = predictions.slice(0, 5); // Limit to 5 results

        // For each prediction, get place details to extract coordinates
        processedResults.forEach((prediction) => {
          if (placesService) {
            placesService.getDetails(
              { placeId: prediction.place_id },
              (place, detailsStatus) => {
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
              }
            );
          }
        });
      } else if (
        status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
      ) {
        console.error(`Place Autocomplete failed for type ${type}:`, status);
      }

      if (type === "establishment") {
        isSearchingAddress = false;
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
    // Validate the coordinates are in reasonable ranges
    if (Math.abs(result.lat) <= 90 && Math.abs(result.lng) <= 180) {
      lat = result.lat;
      lng = result.lng;
      manualCoordinates = `${lat},${lng}`;
      $form.pickUpLocation = result.address;

      // Save the location to mapAddress
      $form.mapAddress = `${lat},${lng}`;

      // Check if location is within service region
      checkServiceRegion(lat, lng);

      // Show a notification that the location has been set
      showLocationNotification(`Location set to: ${result.description}`);

      // Try to extract city information from the address
      if (geocoder) {
        const latlng = { lat: result.lat, lng: result.lng };
        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            // Extract city information from address components
            for (const component of results[0].address_components) {
              if (
                component.types.includes("locality") ||
                component.types.includes("administrative_area_level_2")
              ) {
                cityFromLocation = component.long_name;
                // Check if this city is in our pricing config
                checkCityInPricingConfig(cityFromLocation);
                break;
              }
            }
          }
        });
      }
    } else {
      // Invalid coordinates from search result
      console.error("Invalid coordinates from search result:", result);
      toast.push(
        "Invalid location coordinates received. Please try another location."
      );
    }

    addressSearchResults = []; // Clear results after selection
    addressSearchQuery = ""; // Clear the search query
  }

  // Function to validate the form before submission
  function validateForm() {
    let isValid = true;

    if (!$form.userName) {
      toast.push("Please enter your name");
      isValid = false;
    }

    if (!$form.phoneNumber) {
      toast.push("Please enter your phone number");
      isValid = false;
    }

    if (!$form.pickUpTime) {
      toast.push("Please select a pickup date and time");
      isValid = false;
    }

    if (!$form.pickUpLocation) {
      toast.push("Please enter a pickup location");
      isValid = false;
    }

    if (!$form.mapAddress) {
      toast.push("Please set your pickup location on the map");
      isValid = false;
    }

    // If geocoding failed but we have coordinates, don't block submission because of service region
    if (!isInServiceRegion && cityFromLocation !== "Addis Ababa") {
      toast.push("Please select a location within our service areas");
      isValid = false;
    }

    return isValid;
  }

  // Handle form submission
  function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    // If we don't have a service city due to geocoding failure but have coordinates, set a default
    if (!serviceCityName && cityFromLocation === "Addis Ababa") {
      serviceCityName = "Addis Ababa";
    }

    // Dispatch the next event with coordinates and sender info
    dispatch("next", {
      coordinates: lat && lng ? { lat, lng } : undefined,
      senderInfo: {
        userName: $form.userName,
        phoneNumber: $form.phoneNumber,
        pickUpTime: $form.pickUpTime,
        pickUpLocation: $form.pickUpLocation,
        mapLocation: $form.mapAddress,
        serviceCity: serviceCityName,
        city: cityFromLocation,
      },
    });
  }

  // Update manual coordinates when lat/lng change - always in lat,lng format
  $: manualCoordinates = `${lat},${lng}`;

  // Check service region whenever lat/lng changes
  $: {
    if (lat && lng) {
      checkServiceRegion(lat, lng);
    }
  }
</script>

<div class="{className} space-y-6" in:fade={{ duration: 300 }}>
  <div class="mb-6">
    <h2 class="text-xl font-bold text-gray-800 mb-2">Sender Information</h2>
    <p class="text-gray-600 text-sm">
      Please provide details about where we'll pick up your package
    </p>
  </div>

  <div class="space-y-5">
    <div class="transition-all duration-300 hover:shadow-sm rounded-lg">
      <label
        for="userName"
        class="block text-sm font-medium text-gray-700 mb-1.5"
      >
        Your Name <span class="text-red-500">*</span>
      </label>
      <div class="relative">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <input
          id="userName"
          bind:value={$form.userName}
          class="w-full pl-10 p-3 border {$errors.userName
            ? 'border-red-500 focus:ring-red-200'
            : 'border-gray-300 focus:ring-secondary/50'} rounded-lg text-gray-700 focus:ring-2 focus:border-secondary transition-colors"
          type="text"
          name="userName"
          placeholder="Full name"
        />
      </div>
      {#if $errors.userName}
        <p class="mt-1.5 text-sm text-red-500 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 mr-1"
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
          {$errors.userName}
        </p>
      {/if}
    </div>

    <div class="transition-all duration-300 hover:shadow-sm rounded-lg">
      <label
        for="phoneNumber"
        class="block text-sm font-medium text-gray-700 mb-1.5"
      >
        Phone Number <span class="text-red-500">*</span>
      </label>
      <div class="relative">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"
            />
          </svg>
        </div>
        <input
          id="phoneNumber"
          bind:value={$form.phoneNumber}
          class="w-full pl-10 p-3 border {$errors.phoneNumber
            ? 'border-red-500 focus:ring-red-200'
            : 'border-gray-300 focus:ring-secondary/50'} rounded-lg text-gray-700 focus:ring-2 focus:border-secondary transition-colors"
          type="tel"
          name="phoneNumber"
          placeholder="Phone number"
        />
      </div>
      {#if $errors.phoneNumber}
        <p class="mt-1.5 text-sm text-red-500 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 mr-1"
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
          {$errors.phoneNumber}
        </p>
      {/if}
    </div>

    <div class="transition-all duration-300 hover:shadow-sm rounded-lg">
      <label
        for="pickupDate"
        class="block text-sm font-medium text-gray-700 mb-1.5"
        >Pickup Date <span class="text-red-500">*</span></label
      >
      <div class="relative">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <input
          id="pickupDate"
          type="datetime-local"
          bind:value={$pickUpDateProxy}
          min={today}
          class="w-full pl-10 p-3 border {$errors.pickUpTime
            ? 'border-red-500 focus:ring-red-200'
            : 'border-gray-300 focus:ring-secondary/50'} rounded-lg text-gray-700 focus:ring-2 focus:border-secondary transition-colors appearance-none"
        />
      </div>
      {#if $errors.pickUpTime}
        <p class="mt-1.5 text-sm text-red-500 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 mr-1"
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
          {$errors.pickUpTime}
        </p>
      {/if}
      <p class="mt-1 text-xs text-gray-500">Select a date for pickup</p>
    </div>
  </div>

  <!-- Location Selection Section -->
  <div class="bg-gray-50 p-5 rounded-lg border border-gray-200">
    <h3 class="text-lg font-semibold text-gray-800 mb-3">Pickup Location</h3>

    <!-- Location Selection Tabs -->
    <div class="mb-5 border-b border-gray-200">
      <nav class="-mb-px flex space-x-6" aria-label="Tabs">
        <button
          class="border-secondary text-secondary font-medium py-3 px-1 border-b-2"
        >
          Map Selection
        </button>
      </nav>
    </div>

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
        <div class="flex">
          <input
            id="addressSearch"
            bind:value={addressSearchQuery}
            on:input={() => {
              if (addressSearchQuery.length > 2) {
                searchAddress();
              } else {
                addressSearchResults = [];
              }
            }}
            class="w-full p-3 border border-gray-300 rounded-l-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
            type="text"
            placeholder="Type to search for a location..."
          />
          <button
            type="button"
            class="bg-secondary text-white px-4 py-3 rounded-r-lg hover:bg-secondary/90 transition-colors flex items-center"
            on:click={searchAddress}
            disabled={isSearchingAddress || addressSearchQuery.length < 3}
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
        </div>

        <!-- Search Results Dropdown -->
        {#if addressSearchResults.length > 0}
          <div
            class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-60 overflow-auto"
          >
            {#each addressSearchResults as result}
              <button
                type="button"
                class="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                on:click={() => selectAddress(result)}
              >
                <div class="font-medium text-gray-800">
                  {result.description}
                </div>
                <div class="text-sm text-gray-500">{result.address}</div>
              </button>
            {/each}
          </div>
        {:else if isSearchingAddress}
          <div
            class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 p-4 text-center"
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
              <span class="text-gray-600">Searching locations...</span>
            </div>
          </div>
        {/if}
      </div>
      <p class="mt-1 text-xs text-gray-500">
        Search for a specific address, landmark, or area to pinpoint your
        location
      </p>
    </div>

    <!-- Map View with Clear Instructions -->
    <div class="mb-4">
      <div class="flex justify-between items-center mb-2">
        <label class="block text-sm font-medium text-gray-700">
          Interactive Map <span class="text-red-500">*</span>
        </label>
        <button
          type="button"
          class="text-xs bg-secondary text-white px-3 py-1.5 rounded-full hover:bg-secondary/90 transition-colors flex items-center gap-1"
          on:click={getUserLocation}
          disabled={isLoadingLocation}
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

      {#if locationNotification}
        <div
          class="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-3"
          in:fly={{ y: 10, duration: 300, easing: cubicOut }}
          out:fade={{ duration: 200 }}
        >
          <div class="flex">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p class="text-sm">{locationNotification}</p>
            </div>
          </div>
        </div>
      {/if}

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
              {#if locationError && locationError.includes("check your browser settings")}
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

      {#if $errors.mapAddress}
        <div
          class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3"
          in:fly={{ y: 10, duration: 300, easing: cubicOut }}
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
              <p class="text-sm font-medium">Location Required</p>
              <p class="text-sm mt-1">
                Please set a valid pickup location by using the map, searching
                for an address, or clicking "Use my location".
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Service Region Status -->
      {#if !isInServiceRegion && lat && lng}
        <div
          class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3"
          in:fly={{ y: 10, duration: 300, easing: cubicOut }}
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
                We don't currently service this location. Please select a pickup
                point within our service areas.
              </p>
              <div class="mt-2">
                <button
                  type="button"
                  class="text-xs bg-red-100 text-red-800 px-3 py-1.5 rounded-full hover:bg-red-200 transition-colors"
                  on:click={() => {
                    // Show available service regions
                    let regionsText = "Our service is available in:\n\n";
                    data.pricingConfig?.cities?.forEach((city) => {
                      regionsText += `• ${city}\n`;
                    });
                    // Also add cities from inCityPricing that aren't in the cities list
                    Object.keys(
                      data.pricingConfig?.inCityPricing || {}
                    ).forEach((city) => {
                      if (!data.pricingConfig?.cities?.includes(city)) {
                        regionsText += `• ${city}\n`;
                      }
                    });
                    alert(regionsText);
                  }}
                >
                  View service areas
                </button>
              </div>
            </div>
          </div>
        </div>
      {:else if isInServiceRegion && serviceCityName}
        <div
          class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-3"
          in:fly={{ y: 10, duration: 300, easing: cubicOut }}
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
                Your pickup location is in {serviceCityName}, which is within
                our service area.
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Map View with Clear Instructions -->
    <div class="relative">
      <div
        class="h-56 rounded-lg overflow-hidden border {$errors.mapAddress
          ? 'border-red-500'
          : 'border-gray-300'}"
      >
        {#if browser}
          <GoogleMaps
            bind:lat
            bind:lng
            mapId="sender-map"
            display={false}
            showSearchBox={false}
            on:locationChanged={({ detail }) => {
              lat = detail.lat;
              lng = detail.lng;
              // Update the form values
              $form.mapAddress = `${lat},${lng}`;
              // Check if location is within service region
              checkServiceRegion(lat, lng);
              reverseGeocode(lat, lng);
            }}
            on:mapClick={({ detail }) => {
              lat = detail.lat;
              lng = detail.lng;
              // Update the form values
              $form.mapAddress = `${lat},${lng}`;
              // Check if location is within service region
              checkServiceRegion(lat, lng);
              reverseGeocode(lat, lng);
            }}
            on:mapReady={({ detail }) => {
              // Initialize Google Maps services when the map is ready
              if (detail.google && !placesService) {
                // Create a dummy div for PlacesService (required but not used directly)
                const dummyElement = document.createElement("div");
                placesService = new detail.google.maps.places.PlacesService(
                  dummyElement
                );

                // Initialize autocomplete service
                autocompleteService =
                  new detail.google.maps.places.AutocompleteService();

                // Initialize geocoder
                geocoder = new detail.google.maps.Geocoder();

                // Initial region check
                checkServiceRegion(lat, lng);
              }
            }}
            on:error={(e) => {
              console.error("Google Maps error:", e);
              locationError = "There was an issue loading the map: " + e.detail;
            }}
          />
        {/if}
      </div>

      <!-- Map Instructions Overlay -->
      <div
        class="absolute top-2 right-2 bg-white/90 rounded-lg shadow-md p-2 max-w-[200px]"
      >
        <p class="text-xs text-gray-700">
          <span class="font-medium">Note:</span> The pin shows your pickup location.
          You can adjust it using the coordinates below.
        </p>
      </div>

      <!-- Service Region Overlay -->
      {#if data.pricingConfig.cities.length > 0}
        <div
          class="absolute bottom-2 left-2 bg-white/90 rounded-lg shadow-md p-2"
        >
          <p class="text-xs text-gray-700">
            <span class="font-medium">Service Areas:</span>
            {data.pricingConfig.cities.join(", ")}
          </p>
        </div>
      {/if}
    </div>

    <!-- Coordinates and Quick Locations -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Coordinates Input -->
      <div>
        <label
          for="coordinates"
          class="block text-sm font-medium text-gray-700 mb-1"
        >
          Coordinates <span class="text-red-500">*</span>
        </label>
        <div class="flex items-center">
          <input
            id="coordinates"
            bind:value={manualCoordinates}
            class="w-full p-2 border {$errors.mapAddress
              ? 'border-red-500'
              : 'border-gray-300'} rounded-lg text-gray-700 text-sm focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
            type="text"
            placeholder="e.g. 9.01, 38.74"
          />
          <button
            type="button"
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
        {#if $errors.mapAddress}
          <p class="mt-1 text-sm text-red-500">{$errors.mapAddress}</p>
        {/if}
      </div>

      <!-- Quick Locations -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Quick Locations
        </label>
        <div
          class="flex flex-wrap gap-2 {quickLocationHighlight
            ? 'animate-pulse'
            : ''}"
        >
          <button
            type="button"
            class="text-xs {quickLocationHighlight
              ? 'bg-blue-200 text-blue-800 border border-blue-300'
              : 'bg-gray-200 text-gray-700'} px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            on:click={() => {
              lat = 9.01;
              lng = 38.74;
              manualCoordinates = `${lat},${lng}`;
              $form.mapAddress = manualCoordinates;
              reverseGeocode(lat, lng);
              quickLocationHighlight = false;
            }}
          >
            Addis Ababa
          </button>
          <button
            type="button"
            class="text-xs {quickLocationHighlight
              ? 'bg-blue-200 text-blue-800 border border-blue-300'
              : 'bg-gray-200 text-gray-700'} px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            on:click={() => {
              lat = 8.9806;
              lng = 38.7578;
              manualCoordinates = `${lat},${lng}`;
              $form.mapAddress = manualCoordinates;
              reverseGeocode(lat, lng);
              quickLocationHighlight = false;
            }}
          >
            Bole
          </button>
          <button
            type="button"
            class="text-xs {quickLocationHighlight
              ? 'bg-blue-200 text-blue-800 border border-blue-300'
              : 'bg-gray-200 text-gray-700'} px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            on:click={() => {
              lat = 9.0092;
              lng = 38.7645;
              manualCoordinates = `${lat},${lng}`;
              $form.mapAddress = manualCoordinates;
              reverseGeocode(lat, lng);
              quickLocationHighlight = false;
            }}
          >
            Piazza
          </button>
        </div>
      </div>
    </div>

    <!-- Detailed Address Information -->
    <div class="mt-4">
      <label
        for="pickUpLocation"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Detailed Pickup Address <span class="text-red-500">*</span>
        <span class="text-xs font-normal text-gray-500 ml-1"
          >(building name, floor, landmarks, etc.)</span
        >
      </label>
      <textarea
        id="pickUpLocation"
        bind:value={$form.pickUpLocation}
        class="w-full p-3 border {$errors.pickUpLocation
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        rows="3"
        placeholder="Please provide specific details to help our courier find your exact location (e.g., Building name, Floor/Suite #, Nearby landmarks, Gate/Entry instructions)"
      ></textarea>
      {#if $errors.pickUpLocation}
        <p class="mt-1 text-sm text-red-500">{$errors.pickUpLocation}</p>
      {:else}
        <p class="mt-1 text-xs text-gray-500">
          Detailed address information helps our couriers locate your pickup
          point quickly and efficiently.
        </p>
      {/if}
    </div>
  </div>

  <!-- Navigation Buttons -->
  <div class="flex justify-end mt-8">
    <button
      type="button"
      on:click={handleSubmit}
      class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-secondary hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
    >
      Continue
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 ml-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>
  </div>
</div>
