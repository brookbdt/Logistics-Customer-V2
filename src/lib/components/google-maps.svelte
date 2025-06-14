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
  export let mapId: string = "map"; // Default ID, but expect unique ones

  // Export a method to force route recalculation
  export async function forceRouteUpdate() {
    console.log("forceRouteUpdate called with:", {
      mapInitialized,
      isInitializing,
      showRoute,
      hasDirectionsService: !!directionsService,
      hasDirectionsRenderer: !!directionsRenderer,
      hasDestination: destinationLat !== 0 && destinationLng !== 0,
      lat,
      lng,
    });

    // If map is not yet initialized, wait a moment and try again
    if (!map || !mapInitialized) {
      console.log("Map not initialized yet, waiting...");

      // Wait a short time and try again
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!map || !mapInitialized) {
        console.log("Map still not initialized after waiting");
        return;
      }
    }

    if (isInitializing) {
      console.log("Map is initializing, cannot update route yet");
      return;
    }

    if (
      showRoute &&
      directionsService &&
      directionsRenderer &&
      destinationLat !== 0 &&
      destinationLng !== 0
    ) {
      console.log("Force recalculating route");

      // Update marker position first if it exists
      if (marker) {
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
      }

      // Add a small delay before calculating route to ensure UI updates first
      await new Promise((resolve) => setTimeout(resolve, 50));

      calculateAndDisplayRoute();
    } else {
      console.log("Cannot recalculate route, missing requirements:", {
        showRoute,
        hasDirectionsService: !!directionsService,
        hasDirectionsRenderer: !!directionsRenderer,
        hasDestination: destinationLat !== 0 && destinationLng !== 0,
      });
    }
  }

  let map: google.maps.Map | null = null;
  let marker: google.maps.Marker | null = null;
  let markers: google.maps.Marker[] = [];
  let mapInitialized = false;
  let directionsRenderer: google.maps.DirectionsRenderer | null = null;
  let directionsService: google.maps.DirectionsService | null = null;
  let mapElement: HTMLElement | null = null;
  let isInitializing = false;

  // Add reactive block to update map on lat/lng change
  $: {
    if (map && marker && mapInitialized && !isInitializing) {
      console.log("Reactive statement triggered with lat/lng:", lat, lng);

      // Force update marker position and pan map
      marker.setPosition({ lat, lng });

      // Use smooth animation for better UX
      map.panTo({ lat, lng });

      // If marker is significantly off-screen, use setCenter with animation
      const bounds = map.getBounds();
      if (bounds) {
        const latLng = new google.maps.LatLng(lat, lng);
        if (!bounds.contains(latLng)) {
          console.log("Marker outside visible area, centering map");
          map.setCenter({ lat, lng });
        }
      }
    }
  }

  // Function to initialize the map
  async function initMap() {
    if (!browser || isInitializing) return;

    // Set initializing flag to prevent multiple concurrent initializations
    isInitializing = true;

    // If map is already initialized and the map element still exists, just update it
    if (mapInitialized && map && document.getElementById(mapId)) {
      // Update marker position and recalculate route if needed
      if (marker) {
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
      }

      if (
        showRoute &&
        directionsService &&
        directionsRenderer &&
        destinationLat !== 0 &&
        destinationLng !== 0
      ) {
        calculateAndDisplayRoute();
      }

      isInitializing = false;
      return;
    }

    // If we get here, we need to initialize the map from scratch
    // Clean up existing map objects
    markers.forEach((marker) => marker.setMap(null));
    markers = [];
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
    }
    map = null;
    mapInitialized = false;

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
          let mapElement = document.getElementById(mapId);
          if (!mapElement) {
            // Delay slightly and retry if element not found initially
            await new Promise((resolve) => setTimeout(resolve, 50));
            mapElement = document.getElementById(mapId);
            if (!mapElement) {
              console.error(
                `Map container element with id '${mapId}' not found`
              );
              isInitializing = false; // Reset flag on failure
              throw new Error(
                `Map container element with id '${mapId}' not found`
              );
            }
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

          // Reset initialization flag
          isInitializing = false;
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

        // Reset flag to allow retry
        isInitializing = false;
      }
    } catch (error) {
      console.error("Error initializing Google Maps:", error);
      dispatch("error", {
        message: "Failed to initialize Google Maps",
        error,
      });

      // Reset flag to allow retry
      isInitializing = false;
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
    // Create a draggable marker with custom styling - red for higher visibility
    marker = new google.maps.Marker({
      position: { lat: lat, lng: lng },
      map,
      draggable: true,
      animation: google.maps.Animation.DROP,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 15,
        fillColor: "#FF0000",
        fillOpacity: 0.9,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
        labelOrigin: new google.maps.Point(0, -10),
      },
      title: "Drag me to adjust location",
      zIndex: 999,
    });

    // Add marker to the markers array
    markers.push(marker);

    // Add a tooltip to show users they can drag the marker
    const infoWindow = new google.maps.InfoWindow({
      content:
        "<div style='padding:5px;font-size:12px;'>Drag to adjust position</div>",
      disableAutoPan: true,
    });

    // Show tooltip briefly when creating the marker
    if (!display) {
      infoWindow.open(map, marker);
      setTimeout(() => infoWindow.close(), 3000);
    }

    // Listen for marker drag events
    marker.addListener("dragend", () => {
      const position = marker?.getPosition();
      if (position) {
        lat = position.lat();
        lng = position.lng();

        // Force recalculation of route to update markers
        if (
          showRoute &&
          directionsService &&
          directionsRenderer &&
          destinationLat !== 0 &&
          destinationLng !== 0
        ) {
          calculateAndDisplayRoute();
        }

        dispatch("locationChanged", { lat, lng });

        // Show tooltip briefly when dragging ends
        infoWindow.open(map, marker);
        setTimeout(() => infoWindow.close(), 2000);
      }
    });

    // Listen for marker click events
    marker.addListener("click", () => {
      // Bounce animation for visual feedback
      if (marker) {
        marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => {
          if (marker) marker.setAnimation(null);
        }, 1500);
      }

      // Show tooltip
      infoWindow.open(map, marker);
      setTimeout(() => infoWindow.close(), 4000);

      dispatch("markerClick", { lat, lng });
    });

    // Listen for map click events - this is what handles the tap location setting
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        if (marker) {
          // Update marker position
          marker.setPosition(e.latLng);

          // Add bounce animation for visual feedback
          marker.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(() => {
            if (marker) marker.setAnimation(null);
          }, 1500);

          // Show tooltip
          infoWindow.open(map, marker);
          setTimeout(() => infoWindow.close(), 3000);
        }

        // Important: Update internal state variables to match click
        lat = e.latLng.lat();
        lng = e.latLng.lng();

        // Center map on the new marker position
        map.panTo(e.latLng);

        // Force recalculation of route to update markers
        if (
          showRoute &&
          directionsService &&
          directionsRenderer &&
          destinationLat !== 0 &&
          destinationLng !== 0
        ) {
          calculateAndDisplayRoute();
        }

        // Dispatch event with the clicked coordinates
        dispatch("mapClick", {
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
          nativeEvent: e,
        });
      }
    });

    // Add a "recenter" button to the map
    const centerControlDiv = document.createElement("div");
    centerControlDiv.className =
      "bg-white shadow-md rounded-full p-2 m-2 cursor-pointer hover:bg-gray-100 transition-colors duration-200";
    centerControlDiv.title = "Center Map";
    centerControlDiv.innerHTML = `
      <div class="flex items-center justify-center w-6 h-6 text-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      </div>
    `;

    centerControlDiv.addEventListener("click", () => {
      // Center the map on the marker
      if (marker && marker.getPosition()) {
        map.panTo(marker.getPosition()!);
        map.setZoom(15);
      }
    });

    // Add the control to the map
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
      centerControlDiv
    );
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

      // Make sure map is centered on the new location
      map.panTo(place.geometry.location);

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

      // Create origin marker with improved styling
      const originMarker = new google.maps.Marker({
        position: origin,
        map,
        icon: {
          url: pickUp,
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 40),
          labelOrigin: new google.maps.Point(20, -10),
        },
        label: {
          text: "Delivery",
          color: "#1F2937",
          fontSize: "12px",
          fontWeight: "bold",
        },
        title: "Delivery Location",
        zIndex: 997,
      });
      markers.push(originMarker);

      // Create destination marker with improved styling
      const destinationMarker = new google.maps.Marker({
        position: destination,
        map,
        icon: {
          url: dropOffIcon,
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 40),
          labelOrigin: new google.maps.Point(20, -10),
        },
        label: {
          text: "Pickup",
          color: "#1F2937",
          fontSize: "12px",
          fontWeight: "bold",
        },
        title: "Pickup Location",
        zIndex: 998,
      });
      markers.push(destinationMarker);

      // Add click event to destination marker
      destinationMarker.addListener("click", () => {
        if (marker) {
          marker.setPosition(destination);
          lat = destinationLat;
          lng = destinationLng;
          dispatch("markerClick", { lat, lng });
        }
      });

      // Create bounds to fit both markers
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);

      // Add a little padding around the bounds
      map.fitBounds(bounds, 50);
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

  // Initialize map on component mount
  onMount(() => {
    // Reset initialization flag to make sure we can initialize the map
    isInitializing = false;

    // Ensure map div is available at first render
    const initialMapCheck = setInterval(() => {
      const mapDiv = document.getElementById(mapId);
      if (mapDiv && !mapInitialized) {
        clearInterval(initialMapCheck);
        initMap();
      }
    }, 100);

    // Cleanup timeout in case component gets unmounted before map initializes
    setTimeout(() => clearInterval(initialMapCheck), 5000);

    // Cleanup on component destroy
    return () => {
      clearInterval(initialMapCheck);
      isInitializing = true; // Prevent new initializations during cleanup

      if (map) {
        // First clean up all markers to avoid memory leaks
        markers.forEach((marker) => {
          if (marker) marker.setMap(null);
        });
        markers = [];

        // Clean up directions renderer
        if (directionsRenderer) {
          directionsRenderer.setMap(null);
          directionsRenderer = null;
        }

        // Clear any other event listeners on the map
        google.maps.event.clearInstanceListeners(map);

        // Clear the map reference
        map = null;
      }

      mapInitialized = false;
      isInitializing = false;
    };
  });
</script>

<div id={mapId} class="w-full h-72" />
{#if showSearchBox}
  <input
    id="pac-input"
    class="w-full control p-3 text-sm mt-4 rounded border-b-2 border-complementary"
    type="text"
    placeholder="Bole, Merkato, ...."
  />
{/if}
