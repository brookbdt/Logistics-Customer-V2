<script lang="ts">
  import dropOffIcon from "$lib/assets/shared/map/drop-off.svg";
  import pickUp from "$lib/assets/shared/map/pick-up.svg";
  import Search from "$lib/assets/shared/search.svg.svelte";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import {
    calculatePrice,
    isRouteAvailable as checkPricingRoute,
    extractCityFromAddress,
    normalizeCity,
    type PriceBreakdown,
    type PricingParams,
  } from "$lib/utils/pricing";
  import { toast } from "@zerodevx/svelte-toast";
  import { createEventDispatcher, onMount } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type { PageData } from "./$types";
  // Import SuperForm types
  import type {
    CreateOrderFormInput,
    createOrderSchema,
  } from "$lib/utils/schemas/create-order";
  import type { SuperValidated } from "sveltekit-superforms";
  import { dateProxy, superForm } from "sveltekit-superforms/client";
  import { z } from "zod";
  import { debounce } from "$lib/utils/debounce";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { page } from "$app/stores";

  let className = "";
  export { className as class };
  const dispatch = createEventDispatcher();

  export let data: PageData;
  // Use SuperForm instead of the local receiversInfo object
  export let orderForm: ReturnType<typeof superForm<CreateOrderFormInput>>;

  const { form, errors, enhance, constraints, message, submitting } = orderForm;
  const dropOffDateProxy = dateProxy(form, "dropOffTime", { format: "date" });

  export let lat1: number | null = null;
  export let lng1: number | null = null;

  // Search functionality variables
  let searchQuery = "";
  let isSearching = false;
  let customerSearchResults: any[] = [];
  let searchResultVisible = false;

  // Create a debounced search function
  const debouncedSearch = debounce(async (query: string) => {
    if (query.length < 2) {
      customerSearchResults = [];
      searchResultVisible = false;
      return;
    }

    isSearching = true;

    // Update URL with search parameter
    if (browser) {
      const url = new URL(window.location.href);
      url.searchParams.set("searchCustomer", query);
      goto(url.toString(), { replaceState: true, noScroll: true });
    }
  }, 300);

  // Initialize customer search results from page data
  $: if (data?.customerSearchResults) {
    customerSearchResults = data.customerSearchResults;
    searchResultVisible = customerSearchResults.length > 0;
    isSearching = false;

    if (customerSearchResults.length === 0 && searchQuery.length >= 2) {
      toast.push("No customers found matching your search", {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
    }
  }

  // Handle input changes for the search
  function handleSearchInputChange() {
    debouncedSearch(searchQuery);
  }

  // Handle clicks outside the search results to close them
  function handleSearchResultsClickOutside(event: MouseEvent) {
    const searchResultsElement = document.querySelector(".search-results");
    if (
      searchResultsElement &&
      !searchResultsElement.contains(event.target as Node)
    ) {
      searchResultVisible = false;
    }
  }

  // State variables
  let lat2: number = 8.9864; // Saris, Addis Ababa latitude
  let lng2: number = 38.7955; // Saris, Addis Ababa longitude
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
  let dateInput: HTMLInputElement;

  // Reference to the GoogleMaps component
  let googleMapsComponent: any;

  // For manual coordinate input
  let manualCoordinates = `${lat2},${lng2}`;

  // Sync $form.dropOffMapAddress -> lat2, lng2
  $: {
    if ($form.dropOffMapAddress) {
      try {
        const [latStr, lngStr] = $form.dropOffMapAddress.split(",");
        const formLat = parseFloat(latStr.trim());
        const formLng = parseFloat(lngStr.trim());
        if (
          !isNaN(formLat) &&
          !isNaN(formLng) &&
          (formLat !== lat2 || formLng !== lng2)
        ) {
          lat2 = formLat;
          lng2 = formLng;
          manualCoordinates = $form.dropOffMapAddress;
          console.log("Updated lat2/lng2 from form:", lat2, lng2);
        }
      } catch (e) {
        console.error(
          "Error parsing form coordinates:",
          $form.dropOffMapAddress,
          e
        );
      }
    }
  }

  $: console.log("lat2", lat2);
  $: console.log("lng2", lng2);

  export let disableInput = false;

  // Validation
  let validationErrors = {
    userName: false,
    phoneNumber: false,
    email: false,
    inCity: false,
    dropOffTime: false,
    dropOffLocation: false,
  };

  // Add a function to handle customer selection from search results
  function handleCustomerSelect(customer: any) {
    // Close search results
    searchResultVisible = false;

    // Update form values with selected customer data
    $form.receiverUsername = customer.User?.userName || "";
    $form.receiverPhoneNumber = customer.User?.phoneNumber || "";
    $form.receiverEmail = customer.User?.email || "";
    $form.receiverId = customer.id.toString();

    // If customer has address information, use it
    if (customer.physicalAddress) {
      $form.dropOffLocation = customer.physicalAddress;
    }

    // If customer has map coordinates, use them
    if (customer.mapAddress) {
      // Update the form value, the reactive statement will handle the rest
      $form.dropOffMapAddress = customer.mapAddress;
      console.log(
        "Set dropOffMapAddress from customer:",
        $form.dropOffMapAddress
      );
      // No need for setTimeout or manual parsing/setting of lat2/lng2/manualCoordinates here
    }

    // Show a success toast
    toast.push(`Selected ${customer.User?.userName} as receiver`, {
      theme: {
        "--toastBackground": "#4ade80",
        "--toastColor": "#064e3b",
        "--toastBarBackground": "#10b981",
      },
      duration: 3000,
    });
  }

  // Helper function to search for a specific type
  function searchForType(type: "geocode" | "establishment") {
    if (!autocompleteService) {
      console.error("AutocompleteService not initialized in searchForType");
      isSearchingAddress = false;
      return;
    }

    if (!placesService) {
      console.error("PlacesService not initialized in searchForType");
      isSearchingAddress = false;
      return;
    }

    console.log(`Searching for ${type} with query: ${addressSearchQuery}`);

    const request: google.maps.places.AutocompletionRequest = {
      input: addressSearchQuery,
      types: [type],
      // Optional: restrict to a specific region (consider enabling for your region)
      // componentRestrictions: { country: 'et' } // Ethiopia
    };

    try {
      autocompleteService.getPlacePredictions(
        request,
        (predictions, status) => {
          console.log(
            `Autocomplete results for ${type}:`,
            status,
            predictions?.length || 0
          );

          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            predictions &&
            predictions.length > 0
          ) {
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
                    console.log(
                      `Place details for ${prediction.description}:`,
                      detailsStatus
                    );

                    if (
                      detailsStatus ===
                        google.maps.places.PlacesServiceStatus.OK &&
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
                    } else {
                      console.warn(
                        `Failed to get details for ${prediction.description}:`,
                        detailsStatus
                      );
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
            if (
              status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
            ) {
              console.error(
                `Place Autocomplete failed for type ${type}:`,
                status
              );
            } else {
              console.log(`No results found for ${type} search`);
            }

            // Reset the flag if this is the last search type
            if (type === "establishment") {
              isSearchingAddress = false;
            }
          }
        }
      );
    } catch (error) {
      console.error(`Error in searchForType(${type}):`, error);
      if (type === "establishment") {
        isSearchingAddress = false;
      }
    }
  }

  // Select an address from search results
  async function selectAddress(result: {
    place_id: string;
    description: string;
    address: string;
    lat: number;
    lng: number;
  }) {
    // Update lat2/lng2 directly, reactivity will update the form
    lat2 = result.lat;
    lng2 = result.lng;
    $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
    $form.dropOffLocation = result.address;

    // Force route recalculation
    if (googleMapsComponent) await googleMapsComponent.forceRouteUpdate();

    // Reverse geocode to get city information and check service region
    reverseGeocode(lat2, lng2);

    // Check if location is within service region
    checkServiceRegion(lat2, lng2);

    addressSearchResults = [];
    isSearchingAddress = false;
    showSearchResults = false;
  }

  // Real implementation of reverse geocoding using Google Geocoder
  function reverseGeocode(latitude: number, longitude: number) {
    if (!geocoder) {
      console.error("Geocoder not initialized");
      // Set fallback address format using coordinates when geocoder isn't available
      $form.dropOffLocation = `Location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      // Still ensure the dropOffMapAddress is set correctly
      $form.dropOffMapAddress = `${latitude},${longitude}`;
      // Use "Addis Ababa" as default city for destination
      destinationCity = "Addis Ababa";
      $form.destinationCity = "Addis Ababa";

      // Mark location as in service area since we're using a default service city
      isLocationInServiceArea = true;
      locationError = null;

      // Show notification about using coordinates
      toast.push("Using coordinates as dropoff point (geocoder unavailable)", {
        theme: {
          "--toastBackground": "#D1FAE5",
          "--toastBarBackground": "#10B981",
          "--toastColor": "#065F46",
        },
        duration: 4000,
      });

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
        $form.dropOffLocation = address;

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
          $form.destinationCity = city; // Store in form
          console.log("city in receiver-info", city);
          // Check if this city is in our pricing config
          const cityInConfig = checkCityInPricingConfig(city);

          if (!cityInConfig) {
            // Try to find a nearby city in our pricing config
            const nearbyCity = findNearestConfiguredCity(latitude, longitude);
            if (nearbyCity) {
              console.log("Using nearby configured city:", nearbyCity);
              destinationCity = nearbyCity;
              $form.destinationCity = nearbyCity;
              locationError = null;
              isLocationInServiceArea = true;
            } else {
              locationError = `We don't currently service ${city} for delivery. Please select a location within our service areas.`;
              isLocationInServiceArea = false;
              // Update UI to show the location is outside service area
              $form.dropOffLocation = address + " (Outside service area)";
            }
          } else {
            locationError = null;
            isLocationInServiceArea = true;

            // Get the exact city name as it appears in the config
            const exactCityName = getServiceCityName(city);
            if (exactCityName) {
              destinationCity = exactCityName;
              $form.destinationCity = exactCityName; // Store in form
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
            $form.destinationCity = nearbyCity;
            locationError = null;
            isLocationInServiceArea = true;

            // Update UI with the city we found
            $form.dropOffLocation = `${address} (Near ${nearbyCity})`;

            // If we have both origin and destination cities, determine delivery type
            if (originCity && destinationCity) {
              determineDeliveryType();
            }
          } else {
            // If we still couldn't determine a city, mark as outside service area
            locationError =
              "Could not determine city from this location. Please select a location within our service areas.";
            isLocationInServiceArea = false;
            $form.dropOffLocation = address + " (City not recognized)";
          }
        }
      } else {
        console.error("Geocoder failed due to: " + status);
        // Fallback to coordinates if geocoding fails
        $form.dropOffLocation = `Location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        // Set fallback to Saris, Addis Ababa for billing issue fallback
        if (status === "REQUEST_DENIED") {
          // Fallback to Addis Ababa
          destinationCity = "Addis Ababa";
          $form.destinationCity = "Addis Ababa";
          isLocationInServiceArea = true;
          locationError = null;

          toast.push(
            "Geocoding temporarily unavailable. Using Addis Ababa as the city.",
            {
              theme: {
                "--toastBackground": "#FEF3C7",
                "--toastBarBackground": "#F59E0B",
                "--toastColor": "#92400E",
              },
              duration: 4000,
            }
          );

          // If we have both origin and destination cities, determine delivery type
          if (originCity) {
            determineDeliveryType();
          }
        } else {
          locationError =
            "Could not determine address from these coordinates. Please select a different location.";
          isLocationInServiceArea = false;
        }
      }

      // Always update the map location
      // MODIFIED: Use setTimeout to delay setting dropOffMapAddress
      setTimeout(() => {
        if (mapInitialized) {
          $form.dropOffMapAddress = `${latitude},${longitude}`;
          console.log(
            "Set dropOffMapAddress from reverseGeocode:",
            $form.dropOffMapAddress
          );
        }
      }, 100);

      // Check service region with the updated city information
      checkServiceRegion(latitude, longitude);
    });
  }

  // Also add a missing function for searchAddress and other variables that might be referenced
  let showSearchResults = false;

  // Function to handle address search
  async function searchAddress() {
    if (!addressSearchQuery.trim()) {
      return;
    }

    if (!autocompleteService) {
      console.error("AutocompleteService not initialized");
      toast.push("Search service not available. Please try again later.", {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
      return;
    }

    isSearchingAddress = true;
    addressSearchResults = [];
    showSearchResults = true;

    try {
      // Log the search request
      console.log("Searching for address:", addressSearchQuery);

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
      toast.push("Error searching for locations. Please try again.", {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
    }
  }

  // Function to handle radio button changes for delivery type
  function handleRadioChange(value: number) {
    radio = value;
    $form.inCity = value.toString();

    // Update delivery type based on radio selection
    deliveryType = value === 0 ? "IN_CITY" : "BETWEEN_CITIES";

    // Recalculate price if we have all needed information
    if (distanceInKm && lat1 && lng1 && lat2 && lng2) {
      calculateOrderPrice();
    }
  }

  // Initialize radio button state
  let radio: number | null =
    $form.inCity !== null && $form.inCity !== undefined
      ? $form.inCity === "0"
        ? 0
        : 1
      : null;

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split("T")[0];

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

  // Add helper functions to check city availability
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

  // Function to determine delivery type
  async function determineDeliveryType() {
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      console.log("Missing coordinates");
      return;
    }

    console.log("All coordinates available, determining delivery type");
    console.log("originCity:", originCity, "destinationCity:", destinationCity);

    try {
      // Calculate distance between points
      distanceInKm = calculateDistance(lat1, lng1, lat2, lng2);
      console.log("Calculated distance:", distanceInKm);

      // MODIFIED: Use setTimeout to delay setting dropOffMapAddress
      // This prevents interference with map initialization
      setTimeout(() => {
        if (mapInitialized) {
          $form.dropOffMapAddress = `${lat2},${lng2}`;
          console.log(
            "Set dropOffMapAddress after map initialization:",
            $form.dropOffMapAddress
          );
        }
      }, 100);

      // First, we need to get the city names from the coordinates
      if (!originCity || originCity.startsWith("Location at")) {
        console.log("Origin city not valid, checking form");

        // Check if we have a valid city in form (passed from sender)
        if ($form.originCity && !$form.originCity.startsWith("Location at")) {
          console.log("Using originCity from form:", $form.originCity);
          originCity = $form.originCity;
        } else {
          console.log("No valid city found, using fallback");
          // Use coordinates as city names in this fallback case
          originCity = `Location at ${lat1.toFixed(4)}, ${lng1.toFixed(4)}`;
          $form.originCity = originCity;
        }
      }

      if (!destinationCity || destinationCity.startsWith("Location at")) {
        // Default fallback - set to between cities if coordinates are far apart
        if (distanceInKm > 10) {
          // If distance is greater than 10km, assume between cities
          console.log(
            "Using distance-based fallback to determine delivery type"
          );
          deliveryType = "BETWEEN_CITIES";
          handleRadioChange(1); // Set to between cities

          // For destination, we'll still use coordinates if we don't have a good city
          destinationCity = `Location at ${lat2.toFixed(4)}, ${lng2.toFixed(4)}`;

          // Store in form
          $form.destinationCity = destinationCity;
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

          // Store in form
          $form.originCity = originCity;
          $form.destinationCity = destinationCity;
          $form.deliveryCity = deliveryCity;
        }
      } else {
        // We have valid city names for both origin and destination

        // Check if the origin and destination cities are the same
        if (normalizeCity(originCity) === normalizeCity(destinationCity)) {
          console.log("Same city delivery");
          deliveryType = "IN_CITY";
          handleRadioChange(0); // Set to in-city
          deliveryCity = originCity; // Use origin city as the delivery city
          $form.deliveryCity = deliveryCity;
        } else {
          // Different cities - check if we have a route between them
          console.log("Different cities, checking route");
          const routeAvailable = checkPricingRoute(
            originCity,
            destinationCity,
            data.pricingConfig
          );

          if (routeAvailable) {
            console.log("Route available");
            deliveryType = "BETWEEN_CITIES";
            handleRadioChange(1); // Set to between cities
          } else {
            console.log("Route not available in pricing matrix");
            // If no direct route, check distance and make a best guess
            if (distanceInKm > 10) {
              console.log("Using distance to determine between cities");
              deliveryType = "BETWEEN_CITIES";
              handleRadioChange(1); // Set to between cities
            } else {
              console.log("Short distance, assuming in-city");
              deliveryType = "IN_CITY";
              handleRadioChange(0); // Set to in-city
              deliveryCity = originCity; // Use origin city as delivery city
              $form.deliveryCity = deliveryCity;
            }
          }
        }
      }

      // Store the delivery type in the form using inCity field
      $form.inCity = deliveryType === "IN_CITY" ? "0" : "1";

      // Calculate price with the determined delivery type
      calculateOrderPrice();

      // After determining delivery type, validate the next button state
      if (validationErrors) {
        validationErrors.inCity = !deliveryType;
      }
    } catch (error: any) {
      console.error("Error determining delivery type:", error);
      toast.push(
        "Error determining delivery type: " + (error.message || "Unknown error")
      );

      // Set a default delivery type even on error
      // Use distance-based fallback
      if (distanceInKm && distanceInKm > 10) {
        deliveryType = "BETWEEN_CITIES";
        handleRadioChange(1); // Set to between cities
      } else {
        deliveryType = "IN_CITY";
        handleRadioChange(0); // Set to in-city
      }

      // Store the delivery type in the form using inCity field
      $form.inCity = deliveryType === "IN_CITY" ? "0" : "1";
    }
  }

  // Function to calculate the order price
  function calculateOrderPrice() {
    if (!distanceInKm || !deliveryType) {
      console.log("Missing required data for price calculation");
      calculatedPrice = 0;
      canCalculatePrice = false;
      return;
    }

    try {
      // Prepare pricing parameters
      const pricingParams: PricingParams = {
        // Location info
        deliveryType: deliveryType,
        originCity: originCity,
        destinationCity: destinationCity,
        distanceInKm: distanceInKm,
        // Fix the estimatedTimeInMinutes type issue
        estimatedTimeInMinutes: estimatedTimeInMinutes
          ? estimatedTimeInMinutes
          : undefined,

        // Customer info
        customerType: customerType,
        hasSubscription: hasSubscription,

        // Order details
        orderType: orderType,
        goodsType: goodsType,
        packagingType: packagingType,

        // Package details
        actualWeight: actualWeight,
        dimensionalWeight: dimensionalWeight,

        // Vehicle type
        vehicleType: vehicleType,
      };

      // Calculate the price
      const priceResult = calculatePrice(pricingParams, data.pricingConfig);
      calculatedPrice = priceResult?.totalCost || 0;
      canCalculatePrice = true;

      // Store the calculated price in form fields
      $form.priceBreakdown = priceResult;
      $form.totalCost = calculatedPrice;

      if (estimatedTimeInMinutes) {
        $form.estimatedTimeInMinutes = estimatedTimeInMinutes;
      }

      console.log("Calculated price:", calculatedPrice, priceResult);
    } catch (error) {
      console.error("Error calculating price:", error);
      toast.push("Error calculating price. Please try again.");
      calculatedPrice = 0;
      canCalculatePrice = false;
    }
  }

  // Delivery type and related variables
  let deliveryType: "IN_CITY" | "BETWEEN_CITIES" | null = null;
  let originCity = $form.originCity || "";
  let destinationCity = $form.destinationCity || "";
  let deliveryCity = $form.deliveryCity || "";
  let isLocationInServiceArea = true;
  let actualWeight: number = 1; // Default to 1 kg
  let dimensionalWeight: number = 1; // Default dimensional weight
  let customerType: string = "STANDARD"; // Default customer type
  let hasSubscription: boolean = false; // Default subscription status

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

  // Add missing functions and variables used in the template
  let distanceInKm: number | null = null;
  let estimatedTimeInMinutes: number | null = null;
  let calculatedPrice: number = 0;
  let canCalculatePrice = false;
  let orderType: string = "STANDARD";
  let vehicleType: string = "Standard";
  let goodsType: string = "General";
  let packagingType: string = "BOX";

  // Function to handle marker click events
  function handleMarkerClick(event: CustomEvent) {
    // Process marker click
    console.log("Marker clicked:", event.detail);
  }

  // Function to handle route calculation events
  function handleRouteCalculated(event: CustomEvent) {
    const detail = event.detail;
    console.log("Route calculated:", detail);

    // Update distance and time estimates
    distanceInKm = detail.distance;
    estimatedTimeInMinutes = detail.duration;

    // Store the distance and time in the form
    $form.distanceInKm = distanceInKm || 0;
    $form.estimatedTimeInMinutes = estimatedTimeInMinutes || 0;

    // Determine delivery type if needed
    if (
      distanceInKm &&
      radio !== null &&
      !deliveryType &&
      lat1 &&
      lng1 &&
      lat2 &&
      lng2
    ) {
      determineDeliveryType();
    }
    // If we already have a delivery type, simply calculate price
    else if (distanceInKm && deliveryType) {
      calculateOrderPrice();
    }
  }

  // Function to handle map ready events
  let mapInitialized = false;

  function handleMapReady(event: CustomEvent) {
    console.log("Map is ready:", event.detail);

    // Set map initialized flag
    mapInitialized = true;

    // Get the Google Maps services
    const google = event.detail.google;
    if (google && google.maps) {
      // Initialize services
      const dummyElement = document.createElement("div");
      placesService = new google.maps.places.PlacesService(dummyElement);
      autocompleteService = new google.maps.places.AutocompleteService();
      geocoder = new google.maps.Geocoder();

      console.log("Google Maps services initialized:", {
        placesService: !!placesService,
        autocompleteService: !!autocompleteService,
        geocoder: !!geocoder,
      });
    } else {
      console.error(
        "Google Maps API not available in mapReady event:",
        event.detail
      );
    }
  }

  // Function to update coordinates from the input field
  async function updateCoordinatesFromInput() {
    try {
      // Parse coordinates from input
      const [latStr, lngStr] = manualCoordinates.split(",");
      const newLat = parseFloat(latStr.trim());
      const newLng = parseFloat(lngStr.trim());

      // Validate coordinates
      if (!isNaN(newLat) && !isNaN(newLng)) {
        lat2 = newLat;
        lng2 = newLng;
        $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
        manualCoordinates = `${lat2},${lng2}`; // Keep manualCoordinates in sync here

        // Force route recalculation
        if (googleMapsComponent) await googleMapsComponent.forceRouteUpdate();

        // Reverse geocode to get address and check if in service area
        reverseGeocode(newLat, newLng);
        checkServiceRegion(newLat, newLng);

        // Also update delivery type if pickup location is set
        if (lat1 && lng1) {
          determineDeliveryType();
        }
      } else {
        toast.push(
          "Invalid coordinates format. Please use format: latitude, longitude",
          {
            theme: {
              "--toastBackground": "#FEF3C7",
              "--toastBarBackground": "#F59E0B",
              "--toastColor": "#92400E",
            },
          }
        );
      }
    } catch (error) {
      console.error("Error parsing coordinates:", error);
      toast.push(
        "Invalid coordinates format. Please use format: latitude, longitude",
        {
          theme: {
            "--toastBackground": "#FEF3C7",
            "--toastBarBackground": "#F59E0B",
            "--toastColor": "#92400E",
          },
        }
      );
    }
  }

  // Function to get the user's current location
  function getUserLocation() {
    if (navigator.geolocation) {
      isLoadingLocation = true;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          lat2 = position.coords.latitude;
          lng2 = position.coords.longitude;
          $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
          manualCoordinates = `${lat2},${lng2}`; // Keep manualCoordinates in sync here

          // Force route recalculation
          if (googleMapsComponent) await googleMapsComponent.forceRouteUpdate();

          // Reverse geocode to get address
          reverseGeocode(lat2, lng2);

          isLoadingLocation = false;

          // Show success message
          toast.push("Location updated successfully", {
            theme: {
              "--toastBackground": "#D1FAE5",
              "--toastBarBackground": "#10B981",
              "--toastColor": "#065F46",
            },
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
          isLoadingLocation = false;

          // Show specific error based on error code
          if (error.code === 1) {
            // Permission denied
            locationError =
              "Location permission denied. Please check your browser settings and allow location access.";
          } else if (error.code === 2) {
            // Position unavailable
            locationError =
              "Unable to determine your location. Please try again or enter coordinates manually.";
          } else if (error.code === 3) {
            // Timeout
            locationError =
              "Location request timed out. Please try again or enter coordinates manually.";
          } else {
            locationError =
              "Error getting your location. Please try again or enter coordinates manually.";
          }

          toast.push(locationError, {
            theme: {
              "--toastBackground": "#FEF3C7",
              "--toastBarBackground": "#F59E0B",
              "--toastColor": "#92400E",
            },
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      locationError =
        "Geolocation is not supported by your browser. Please enter coordinates manually.";
      toast.push(locationError, {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
    }
  }

  // Function to check if current time is peak hour
  function isPeakHour(): boolean {
    const now = new Date();
    const hour = now.getHours();

    // Define peak hours (e.g., 7-10 AM and 4-7 PM)
    return (hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 19);
  }

  // Function to handle the next button click
  function handleNext() {
    // Validate all required fields
    let hasErrors = false;

    if (!$form.receiverUsername) {
      validationErrors.userName = true;
      hasErrors = true;
    } else {
      validationErrors.userName = false;
    }

    if (!$form.receiverPhoneNumber) {
      validationErrors.phoneNumber = true;
      hasErrors = true;
    } else {
      validationErrors.phoneNumber = false;
    }

    if (!$form.receiverEmail) {
      validationErrors.email = true;
      hasErrors = true;
    } else {
      validationErrors.email = false;
    }

    if ($form.inCity === null || $form.inCity === undefined) {
      validationErrors.inCity = true;
      hasErrors = true;
    } else {
      validationErrors.inCity = false;
    }

    if (!$dropOffDateProxy) {
      validationErrors.dropOffTime = true;
      hasErrors = true;
    } else {
      validationErrors.dropOffTime = false;
    }

    if (!$form.dropOffLocation) {
      validationErrors.dropOffLocation = true;
      hasErrors = true;
    } else {
      validationErrors.dropOffLocation = false;
    }

    if (hasErrors) {
      toast.push("Please fill in all required fields", {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
      return;
    }

    // If not in service area, but we have coordinates and billing issue (REQUEST_DENIED)
    // Allow to proceed with Addis Ababa as default city
    if (!isLocationInServiceArea && lat2 && lng2) {
      // Check if we're using the fallback city
      if (
        destinationCity === "Addis Ababa" &&
        $form.destinationCity === "Addis Ababa"
      ) {
        isLocationInServiceArea = true;
      } else {
        toast.push("Please select a location within our service area", {
          theme: {
            "--toastBackground": "#FEF3C7",
            "--toastBarBackground": "#F59E0B",
            "--toastColor": "#92400E",
          },
        });
        return;
      }
    }

    // Ensure delivery type is set
    if (!deliveryType) {
      // Try to determine delivery type one more time before proceeding
      if (lat1 && lng1 && lat2 && lng2) {
        determineDeliveryType();
        // If we still don't have a delivery type, use distance-based fallback
        if (!deliveryType) {
          const distance = calculateDistance(lat1, lng1, lat2, lng2);
          deliveryType = distance > 10 ? "BETWEEN_CITIES" : "IN_CITY";
          $form.inCity = deliveryType === "IN_CITY" ? "0" : "1";
        }
      } else {
        toast.push("Please set both pickup and delivery locations", {
          theme: {
            "--toastBackground": "#FEF3C7",
            "--toastBarBackground": "#F59E0B",
            "--toastColor": "#92400E",
          },
        });
        return;
      }
    }

    // Update distance if not already set
    if (!$form.distanceInKm && lat1 && lng1 && lat2 && lng2) {
      $form.distanceInKm = calculateDistance(lat1, lng1, lat2, lng2);
    }

    // Make one final attempt to calculate price if not already done
    if (!$form.totalCost && deliveryType) {
      calculateOrderPrice();
    }

    // Pass all relevant data to parent component
    const receiverInfo = {
      distanceInKm: distanceInKm,
      estimatedTimeInMinutes: estimatedTimeInMinutes,
      originCity: originCity,
      destinationCity: destinationCity,
      deliveryCity: deliveryCity,
      deliveryType: deliveryType,
      totalCost: calculatedPrice,
      priceBreakdown: $form.priceBreakdown,
      coordinates: { lat: lat2, lng: lng2 },
    };

    // If all validation passes, proceed to next step
    dispatch("next", receiverInfo);
  }

  // Add this function after the existing functions
  function updateMapMarker() {
    // Force the map marker to update by changing the markerKey
    // This will trigger the reactive statement in the GoogleMaps component
    setTimeout(() => {
      // Create a timestamp-based key to ensure uniqueness
      const timestamp = new Date().getTime();
      const mapElement = document.getElementById("receiver-map");
      if (mapElement) {
        // Dispatch a custom event to force map update
        const updateEvent = new CustomEvent("forceMapUpdate", {
          detail: { lat: lat2, lng: lng2, timestamp },
        });
        mapElement.dispatchEvent(updateEvent);

        // Log the update
        console.log("Forced map marker update:", { lat: lat2, lng: lng2 });
      }
    }, 100);
  }

  // At the top, add a reactive marker key
  $: markerKey = `${lat2},${lng2},${Date.now()}`;
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
      <div>
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
                bind:value={searchQuery}
                on:input={handleSearchInputChange}
                type="search"
              />
              {#if isSearching}
                <div
                  class="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <svg
                    class="animate-spin h-5 w-5 text-gray-400"
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
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if customerSearchResults.length > 0 && searchResultVisible}
    <div
      class="mb-6 search-results"
      in:fly={{ y: 20, duration: 300, easing: cubicOut }}
    >
      <h3 class="text-sm font-medium text-gray-700 mb-2">Search Results</h3>
      <div class="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        {#each customerSearchResults as customer}
          <button
            class="w-full text-left hover:bg-gray-100 transition-colors p-4 border-b border-gray-200 last:border-b-0"
            type="button"
            on:click|preventDefault={() => handleCustomerSelect(customer)}
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
        bind:value={$form.receiverUsername}
        class="w-full p-3 border {$errors.receiverUsername ||
        validationErrors.userName
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="receiverUsername"
        placeholder="Full name"
      />
      {#if $errors.receiverUsername || validationErrors.userName}
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
        bind:value={$form.receiverPhoneNumber}
        class="w-full p-3 border {$errors.receiverPhoneNumber ||
        validationErrors.phoneNumber
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="receiverPhoneNumber"
        placeholder="Phone number"
      />
      {#if $errors.receiverPhoneNumber || validationErrors.phoneNumber}
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
        bind:value={$form.receiverEmail}
        class="w-full p-3 border {$errors.receiverEmail ||
        validationErrors.email
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="email"
        name="receiverEmail"
        placeholder="Email address"
      />
      {#if $errors.receiverEmail || validationErrors.email}
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
        bind:value={$dropOffDateProxy}
        bind:this={dateInput}
        on:click={() => {
          dateInput && dateInput.showPicker();
        }}
        class="w-full p-3 border {$errors.dropOffTime ||
        validationErrors.dropOffTime
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="date"
        min={today}
        name="dropOffTime"
      />
      {#if $errors.dropOffTime || validationErrors.dropOffTime}
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
        bind:value={$form.dropOffLocation}
        class="w-full p-3 border {$errors.dropOffLocation ||
        validationErrors.dropOffLocation
          ? 'border-red-500'
          : 'border-gray-300'} rounded-lg text-gray-700 focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-colors"
        type="text"
        name="dropOffLocation"
        placeholder="Enter full address"
      />
      {#if $errors.dropOffLocation || validationErrors.dropOffLocation}
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
          <div
            class="h-56 rounded-lg overflow-hidden border border-gray-300 shadow-inner"
          >
            <GoogleMaps
              bind:this={googleMapsComponent}
              bind:lat={lat2}
              bind:lng={lng2}
              mapId="receiver-map"
              destinationLat={lat1 || 0}
              destinationLng={lng1 || 0}
              display={false}
              showSearchBox={false}
              showRoute={lat1 !== null && lng1 !== null}
              on:locationChanged={({ detail }) => {
                if (!disableInput) {
                  lat2 = detail.lat;
                  lng2 = detail.lng;
                  $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form

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
              on:mapClick={(event) => {
                // When user clicks on map to place marker, check service region
                const detail = event.detail;
                lat2 = detail.lat;
                lng2 = detail.lng;
                $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form

                checkServiceRegion(lat2, lng2);
                reverseGeocode(lat2, lng2);

                // Trigger delivery type determination when delivery location changes
                if (lat1 && lng1) {
                  determineDeliveryType();
                }

                // Create visual ripple effect
                if (event && event.detail && event.detail.nativeEvent) {
                  const nativeEvent = event.detail.nativeEvent;
                  const mapElement = document.querySelector("#receiver-map"); // <-- Use correct ID
                  if (mapElement) {
                    // Create ripple element
                    const ripple = document.createElement("div");
                    ripple.style.position = "absolute";
                    ripple.style.width = "50px";
                    ripple.style.height = "50px";
                    ripple.style.borderRadius = "50%";
                    ripple.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
                    ripple.style.transform = "translate(-50%, -50%)";
                    ripple.style.pointerEvents = "none";
                    ripple.style.zIndex = "999";
                    ripple.style.animation = "ripple 1s ease-out";

                    // Add keyframes animation to head if not already present
                    if (!document.querySelector("#ripple-keyframes")) {
                      const style = document.createElement("style");
                      style.id = "ripple-keyframes";
                      style.textContent = `
                          @keyframes ripple {
                            0% {
                              transform: translate(-50%, -50%) scale(0);
                              opacity: 1;
                            }
                            100% {
                              transform: translate(-50%, -50%) scale(2);
                              opacity: 0;
                            }
                          }
                        `;
                      document.head.appendChild(style);
                    }

                    // Position ripple at click location
                    const rect = mapElement.getBoundingClientRect();
                    const x = nativeEvent.clientX - rect.left;
                    const y = nativeEvent.clientY - rect.top;

                    ripple.style.left = x + "px";
                    ripple.style.top = y + "px";

                    // Add to map and remove after animation
                    mapElement.appendChild(ripple);
                    setTimeout(() => {
                      if (ripple.parentNode) {
                        ripple.parentNode.removeChild(ripple);
                      }
                    }, 1000);
                  }
                }

                // Show a toast notification to confirm the tap
                toast.push({
                  msg: "Delivery location updated",
                  theme: {
                    "--toastBackground": "#4F46E5",
                    "--toastColor": "white",
                  },
                  duration: 2000,
                });
              }}
              on:markerClick={handleMarkerClick}
              on:routeCalculated={handleRouteCalculated}
              on:mapReady={handleMapReady}
              on:error={({ detail }) => {
                console.error("Google Maps error:", detail);
                locationError =
                  "There was an issue loading the map: " + detail.message;
              }}
            />
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
              bind:value={$form.dropOffMapAddress}
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
              on:click={async () => {
                lat2 = 9.01;
                lng2 = 38.74;
                $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
                // Force route recalculation
                if (googleMapsComponent)
                  await googleMapsComponent.forceRouteUpdate();
                reverseGeocode(lat2, lng2);
              }}
            >
              Addis Ababa
            </button>
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={async () => {
                lat2 = 8.9864;
                lng2 = 38.7955;
                manualCoordinates = `${lat2},${lng2}`;
                $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
                // Force route recalculation
                if (googleMapsComponent)
                  await googleMapsComponent.forceRouteUpdate();
                reverseGeocode(lat2, lng2);
              }}
            >
              Saris
            </button>
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={async () => {
                lat2 = 8.9806;
                lng2 = 38.7578;
                manualCoordinates = `${lat2},${lng2}`;
                $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
                // Force route recalculation
                if (googleMapsComponent)
                  await googleMapsComponent.forceRouteUpdate();
                reverseGeocode(lat2, lng2);
              }}
            >
              Bole
            </button>
            <button
              type="button"
              disabled={disableInput}
              class="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              on:click={async () => {
                lat2 = 9.0092;
                lng2 = 38.7645;
                manualCoordinates = `${lat2},${lng2}`;
                $form.dropOffMapAddress = `${lat2},${lng2}`; // Update form
                // Force route recalculation
                if (googleMapsComponent)
                  await googleMapsComponent.forceRouteUpdate();
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
          <div class="bg-secondary/10 px-3 py-1 rounded-full">
            <span class="text-secondary font-semibold">Ready</span>
          </div>
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

              <!-- Continue button hint -->
              <div
                class="mt-3 pt-3 border-t border-gray-200 flex justify-center"
              >
                <div
                  class="bg-blue-50 px-4 py-2 rounded-full border border-blue-100"
                >
                  <p
                    class="text-xs text-blue-800 font-medium flex items-center"
                  >
                    <svg
                      class="h-4 w-4 mr-1.5 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Continue to customize your package and see pricing
                  </p>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Remove the pricing section and replace with a simple message -->
    <div class="mb-6">
      <div class="bg-gray-50 p-5 rounded-lg border border-gray-200">
        <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
          Delivery Details
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

        <!-- Next step prompt -->
        {#if isLocationInServiceArea && lat1 && lng1 && lat2 && lng2}
          <div class="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
            <div class="flex items-center">
              <div class="mr-3 flex-shrink-0">
                <svg
                  class="h-6 w-6 text-blue-500"
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
              </div>
              <div>
                <p class="text-sm font-medium text-gray-800">
                  Ready for the next step!
                </p>
                <p class="text-xs text-gray-600 mt-0.5">
                  Continue to customize your package and see pricing details
                </p>
              </div>
            </div>
          </div>
        {:else if !isLocationInServiceArea && lat2 && lng2}
          <div class="p-4 bg-white rounded-lg border border-red-100 shadow-sm">
            <p class="text-sm text-red-600">
              Please select a location within our service area to proceed.
            </p>
          </div>
        {:else}
          <div class="p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
            <p class="text-sm text-gray-600">
              Complete all required fields to proceed to the next step.
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- In-City vs Between Cities Selection -->
    <!-- <div class="mb-6">
      <label class="block text-sm font-medium text-gray-700 mb-3">
        Delivery Type <span class="text-red-500">*</span>
      </label>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label
          class="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 {radio ===
          0
            ? 'border-secondary bg-secondary/5'
            : 'border-gray-200'}"
        >
          <input
            type="radio"
            name="deliveryType"
            value="0"
            bind:group={radio}
            on:change={() => handleRadioChange(0)}
            class="text-secondary focus:ring-secondary h-4 w-4"
          />
          <div class="ml-3">
            <span class="block text-sm font-medium text-gray-900">In City</span>
            <span class="text-xs text-gray-500"
              >Delivery within {originCity || "the same city"}</span
            >
          </div>
        </label>

        <label
          class="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 {radio ===
          1
            ? 'border-secondary bg-secondary/5'
            : 'border-gray-200'}"
        >
          <input
            type="radio"
            name="deliveryType"
            value="1"
            bind:group={radio}
            on:change={() => handleRadioChange(1)}
            class="text-secondary focus:ring-secondary h-4 w-4"
          />
          <div class="ml-3">
            <span class="block text-sm font-medium text-gray-900"
              >Between Cities</span
            >
            <span class="text-xs text-gray-500">Delivery to another city</span>
          </div>
        </label>
      </div>
    </div> -->

    <!-- Navigation Buttons -->
    <div class="flex justify-between mt-8">
      <button
        type="button"
        on:click={() => dispatch("back")}
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 mr-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>

      <button
        type="button"
        on:click={handleNext}
        class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-secondary hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-offset-2"
        disabled={!isLocationInServiceArea}
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
</div>
