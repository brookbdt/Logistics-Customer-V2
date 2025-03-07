<script lang="ts">
  import { Loader } from "@googlemaps/js-api-loader";
  import { browser } from "$app/environment";
  import { PUBLIC_GOOGLE_MAPS_API } from "$env/static/public";
  import deliveryMarker from "$lib/assets/shared/map/delivery.svg";
  import dropOffIcon from "$lib/assets/shared/map/drop-off.svg";
  import pickUp from "$lib/assets/shared/map/pick-up.svg";
  import { createEventDispatcher, onMount } from "svelte";

  const dispatch = createEventDispatcher();

  export let lat: number;
  export let lng: number;
  export let destinationLat: number = 0;
  export let destinationLng: number = 0;
  export let deliveryLat: number = 0;
  export let deliveryLng: number = 0;
  export let display: boolean = false;
  export let showSearchBox: boolean = true;
  export let showRoute: boolean = false;

  let map: google.maps.Map | null = null;
  let marker: google.maps.Marker | null = null;
  let markers: google.maps.Marker[] = [];
  let mapInitialized = false;
  let directionsRenderer: google.maps.DirectionsRenderer | null = null;
  let directionsService: google.maps.DirectionsService | null = null;

  // Function to initialize the map
  async function initMap() {
    if (!browser || mapInitialized) return;

    try {
      // Check if API key is available
      if (!PUBLIC_GOOGLE_MAPS_API) {
        console.error("Google Maps API key is missing");
        dispatch("error", { message: "Google Maps API key is missing" });
        return;
      }

      // Add error handler for Google Maps API errors - using type assertion
      (window as any).gm_authFailure = () => {
        console.error("Google Maps authentication failed");
        dispatch("error", {
          message:
            "Google Maps authentication failed. Please check your API key and billing settings.",
        });
      };

      const loader = new Loader({
        apiKey: PUBLIC_GOOGLE_MAPS_API,
        version: "weekly",
        libraries: ["places", "geocoding"],
        retries: 3, // Add retries for better reliability
      });

      try {
        console.log("Loading Google Maps API...");

        // Set a timeout for the API loading
        const loadPromise = loader.load();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("Google Maps API loading timed out"));
          }, 20000); // 20 second timeout
        });

        // Race the load against the timeout
        await Promise.race([loadPromise, timeoutPromise]);

        if (!google || !google.maps) {
          throw new Error("Google Maps failed to load properly");
        }

        console.log("Google Maps API loaded successfully");

        try {
          // Import the maps library with error handling
          const mapsLibraryPromise = google.maps.importLibrary(
            "maps"
          ) as Promise<google.maps.MapsLibrary>;
          const mapsLibraryTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("Maps library import timed out"));
            }, 10000); // 10 second timeout
          });

          const mapsLibrary = (await Promise.race([
            mapsLibraryPromise,
            mapsLibraryTimeoutPromise,
          ])) as google.maps.MapsLibrary;
          const { Map } = mapsLibrary;

          // Check if the map element exists
          const mapElement = document.getElementById("map");
          if (!mapElement) {
            throw new Error("Map container element not found");
          }

          map = new Map(mapElement, {
            center: { lat: lat, lng: lng },
            minZoom: 1,
            zoom: 10,
            mapTypeId: "roadmap",
            disableDefaultUI: true,
            gestureHandling: "cooperative", // Improve mobile handling
          });

          // Initialize directions service and renderer
          directionsService = new google.maps.DirectionsService();
          directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: "#4F46E5",
              strokeOpacity: 0.8,
              strokeWeight: 5,
            },
          });

          if (display) {
            // Display mode with multiple markers
            setupDisplayMode(map);
          } else {
            // Interactive mode with single draggable marker
            setupInteractiveMode(map);
          }

          // Setup search box if enabled
          if (showSearchBox) {
            setupSearchBox(map);
          }

          // Draw route if needed
          if (showRoute && destinationLat !== 0 && destinationLng !== 0) {
            calculateAndDisplayRoute();
          }

          mapInitialized = true;

          // Dispatch event that map is ready
          dispatch("mapReady", {
            map,
            google,
          });

          console.log("Map initialized successfully");
        } catch (mapError) {
          console.error("Error creating map:", mapError);

          // Check for specific error types
          const errorMessage =
            mapError instanceof Error ? mapError.message : String(mapError);

          if (
            errorMessage.includes("404") ||
            errorMessage.includes("not authorized")
          ) {
            dispatch("error", {
              message:
                "Google Maps API access error. This may be due to API key restrictions or billing issues.",
              error: mapError,
            });
          } else {
            dispatch("error", {
              message: "Failed to create map. Please try refreshing the page.",
              error: mapError,
            });
          }
        }
      } catch (loadError) {
        console.error("Error loading Google Maps:", loadError);

        // Check for specific error types
        const errorMessage =
          loadError instanceof Error ? loadError.message : String(loadError);

        if (
          errorMessage.includes("404") ||
          errorMessage.includes("not authorized")
        ) {
          dispatch("error", {
            message:
              "Google Maps API access error. This may be due to API key restrictions or billing issues.",
            error: loadError,
          });
        } else if (errorMessage.includes("timeout")) {
          dispatch("error", {
            message:
              "Google Maps API loading timed out. Please check your internet connection and try again.",
            error: loadError,
          });
        } else {
          dispatch("error", {
            message:
              "Failed to load Google Maps. Please check your internet connection and try again.",
            error: loadError,
          });
        }
      }
    } catch (error) {
      console.error("Error initializing Google Maps:", error);
      dispatch("error", {
        message: "Failed to initialize Google Maps",
        error,
      });
    }
  }

  function setupDisplayMode(map: google.maps.Map) {
    // const pickupMarker = new google.maps.Marker({
    //   position: { lat: lat, lng: lng },
    //   map,
    //   icon: {
    //     url: pickUp,
    //     scaledSize: new google.maps.Size(40, 40),
    //   },
    // });
    // markers.push(pickupMarker);
    // if (destinationLat !== 0 && destinationLng !== 0) {
    //   const dropOffMarker = new google.maps.Marker({
    //     position: { lat: destinationLat, lng: destinationLng },
    //     map,
    //     icon: {
    //       url: dropOffIcon,
    //       scaledSize: new google.maps.Size(40, 40),
    //     },
    //   });
    //   markers.push(dropOffMarker);
    //   // If we have both pickup and destination, calculate and display the route
    //   if (showRoute) {
    //     calculateAndDisplayRoute();
    //     // We don't need to draw a straight line here since the directions service will handle the route
    //   }
    // }
    // // Create a new bounds object
    // const bounds = new google.maps.LatLngBounds();
    // // Add all markers to bounds
    // markers.forEach((marker) => {
    //   bounds.extend(marker.getPosition() as google.maps.LatLng);
    // });
    // if (deliveryLat !== 0 && deliveryLng !== 0) {
    //   const deliveryManMarker = new google.maps.Marker({
    //     position: { lat: deliveryLat, lng: deliveryLng },
    //     map,
    //     icon: {
    //       url: deliveryMarker,
    //       scaledSize: new google.maps.Size(40, 40),
    //     },
    //   });
    //   markers.push(deliveryManMarker);
    //   bounds.extend(deliveryManMarker.getPosition() as google.maps.LatLng);
    // }
    // // Adjust the map's viewport to fit the bounds
    // map.fitBounds(bounds);
  }

  function setupInteractiveMode(map: google.maps.Map) {
    // Create a draggable marker
    marker = new google.maps.Marker({
      position: { lat: lat, lng: lng },
      map,
      draggable: true,
      animation: google.maps.Animation.DROP,
    });

    // Add marker to the markers array
    markers.push(marker);

    // Listen for marker drag events
    marker.addListener("dragend", () => {
      const position = marker?.getPosition();
      if (position) {
        lat = position.lat();
        lng = position.lng();
        dispatch("locationChanged", { lat, lng });
      }
    });

    // Listen for map click events
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng && marker) {
        // Update marker position
        marker.setPosition(e.latLng);

        // Update coordinates
        lat = e.latLng.lat();
        lng = e.latLng.lng();

        // Dispatch event
        dispatch("locationChanged", { lat, lng });
      }
    });
  }

  function setupSearchBox(map: google.maps.Map) {
    const input = document.getElementById("pac-input") as HTMLInputElement;
    if (!input) return;

    const searchBox = new google.maps.places.SearchBox(input);

    // Bias the SearchBox results towards current map's viewport
    map.addListener("bounds_changed", () => {
      searchBox.setBounds(map.getBounds() as google.maps.LatLngBounds);
    });

    searchBox.addListener("places_changed", () => {
      const places = searchBox.getPlaces();

      if (!places || places.length === 0) {
        return;
      }

      // Get the first place
      const place = places[0];

      if (!place.geometry || !place.geometry.location) {
        console.log("Returned place contains no geometry");
        return;
      }

      // Update the map
      if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else {
        map.setCenter(place.geometry.location);
        map.setZoom(17);
      }

      // Update the marker
      if (marker) {
        marker.setPosition(place.geometry.location);
      }

      // Update coordinates
      lat = place.geometry.location.lat();
      lng = place.geometry.location.lng();

      // Dispatch event with place details
      dispatch("placeSelected", {
        lat,
        lng,
        place_id: place.place_id,
        address: place.formatted_address,
        name: place.name,
      });
    });
  }

  // Function to calculate and display route between points
  function calculateAndDisplayRoute() {
    if (!directionsService || !directionsRenderer || !map) return;

    const origin = { lat: lat, lng: lng };
    const destination = { lat: destinationLat, lng: destinationLng };

    // Clear any existing markers when showing route
    if (showRoute) {
      // Keep only the main marker if in interactive mode
      if (!display) {
        markers.forEach((m, i) => {
          if (i > 0) {
            // Keep the first marker (main marker)
            m.setMap(null);
          }
        });
        markers = markers.slice(0, 1);
      }
    }

    // Create custom markers for origin and destination
    if (showRoute) {
      // Clear any existing markers first
      markers.forEach((m) => m.setMap(null));
      markers = [];

      // Create origin marker (green)
      const originMarker = new google.maps.Marker({
        position: origin,
        map,
        icon: {
          url: pickUp,
          scaledSize: new google.maps.Size(40, 40),
        },
        title: "Pickup Location",
      });
      markers.push(originMarker);

      // Create destination marker (red)
      const destinationMarker = new google.maps.Marker({
        position: destination,
        map,
        icon: {
          url: dropOffIcon,
          scaledSize: new google.maps.Size(40, 40),
        },
        title: "Delivery Location",
      });
      markers.push(destinationMarker);

      // Create bounds to fit both markers
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      map.fitBounds(bounds);
    }

    directionsService.route(
      {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      (response, status) => {
        if (status === "OK" && response) {
          // Display the route on the map
          directionsRenderer?.setDirections(response);

          // Extract route information
          const route = response.routes[0];
          if (route && route.legs && route.legs.length > 0) {
            const leg = route.legs[0];

            // Dispatch route details
            if (leg.distance && leg.duration) {
              dispatch("routeCalculated", {
                distance: leg.distance.value / 1000, // Convert to km
                duration: Math.ceil(leg.duration.value / 60), // Convert to minutes
                route: route,
              });
            }
          }
        } else {
          console.error("Directions request failed due to " + status);
          dispatch("error", {
            message: "Failed to calculate route: " + status,
          });
        }
      }
    );
  }

  // Update marker position when lat/lng changes
  $: if (
    map &&
    marker &&
    (marker.getPosition()?.lat() !== lat || marker.getPosition()?.lng() !== lng)
  ) {
    marker.setPosition({ lat, lng });
    map.panTo({ lat, lng });
  }

  // Recalculate route when coordinates change
  $: if (
    mapInitialized &&
    showRoute &&
    directionsService &&
    directionsRenderer &&
    destinationLat !== 0 &&
    destinationLng !== 0
  ) {
    calculateAndDisplayRoute();
  }
  $: console.log("markers", markers);
  // Initialize map on component mount
  onMount(() => {
    initMap();

    // Cleanup on component destroy
    return () => {
      markers.forEach((marker) => marker.setMap(null));
      markers = [];
      if (directionsRenderer) {
        directionsRenderer.setMap(null);
      }
      map = null;
      mapInitialized = false;
    };
  });
</script>

<div id="map" class="w-full h-72" />
{#if showSearchBox}
  <input
    id="pac-input"
    class="w-full control p-3 text-sm mt-4 rounded border-b-2 border-complementary"
    type="text"
    placeholder="Bole, Merkato, ...."
  />
{/if}
