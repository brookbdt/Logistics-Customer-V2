<!-- CustomerDriverMap.svelte -->
<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { browser } from "$app/environment";
  import { PUBLIC_GOOGLE_MAPS_API } from "$env/static/public";

  const motorcycleIconUrl = "/motorcycle4.png";

  // Props for the order
  export let order: {
    id: number | null;
    pickUpMapLocation: string | null;
    dropOffMapLocation: string | null;
  } = {
    id: null,
    pickUpMapLocation: null,
    dropOffMapLocation: null,
  };

  // Driver info
  export let driverLocation: string | null = null;
  export let driverIsOnline: boolean = false;
  export let driverName: string = "";

  let map: google.maps.Map | null = null;
  let markers: google.maps.Marker[] = [];
  let polylines: google.maps.Polyline[] = [];
  let mapElement: HTMLElement;
  let scriptLoaded = false;
  let scriptLoading = false;
  let bounds: google.maps.LatLngBounds | null = null;
  let directionsService: google.maps.DirectionsService | null = null;
  let directionsRenderer: google.maps.DirectionsRenderer | null = null;
  let loadingError = "";
  let driverMarker: google.maps.Marker | null = null; // Track driver marker separately

  // Add timeout handling for map loading
  let mapLoadTimeout: ReturnType<typeof setTimeout>;

  // Watch for changes in driver location to update map
  $: if (driverLocation && map) {
    console.log("Driver location changed, updating marker:", driverLocation);
    updateDriverMarker();
    calculateRoutes();
  }

  // Load Google Maps script
  async function loadGoogleMapsScript() {
    if (!browser || scriptLoading) return;

    scriptLoading = true;

    try {
      if (typeof google !== "undefined" && google?.maps) {
        scriptLoaded = true;
        await tick();
        initializeMap();
        return;
      }

      // Set a timeout to detect if Google Maps fails to load
      mapLoadTimeout = setTimeout(() => {
        loadingError = "Google Maps API loading timed out";
        console.error("Error loading Google Maps:", loadingError);
        scriptLoading = false;
      }, 10000); // 10 second timeout

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${PUBLIC_GOOGLE_MAPS_API}&libraries=places,geometry&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;

      // Create global callback
      (window as any).initGoogleMaps = () => {
        clearTimeout(mapLoadTimeout);
        scriptLoaded = true;
        scriptLoading = false;
        initializeMap();
      };

      // Handle script load errors
      script.onerror = () => {
        clearTimeout(mapLoadTimeout);
        loadingError = "Failed to load Google Maps API";
        console.error("Error loading Google Maps:", loadingError);
        scriptLoading = false;
      };

      document.head.appendChild(script);
    } catch (error) {
      clearTimeout(mapLoadTimeout);
      loadingError = `Error loading map: ${error}`;
      console.error("Error setting up Google Maps:", error);
      scriptLoading = false;
    }
  }

  onMount(() => {
    if (!browser) return;

    // Set the global callback before loading script
    (window as any).initGoogleMaps = () => {
      console.log("Google Maps script loaded via callback");
      clearTimeout(mapLoadTimeout);
      scriptLoaded = true;
      scriptLoading = false;
      initializeMap();
    };

    loadGoogleMapsScript();

    return () => {
      // Clean up
      clearTimeout(mapLoadTimeout);

      // Delete global callback when component unmounts
      if ((window as any).initGoogleMaps) {
        delete (window as any).initGoogleMaps;
      }
    };
  });

  onDestroy(() => {
    // Clean up markers and routes
    markers.forEach((marker) => marker?.setMap(null));
    if (driverMarker) driverMarker.setMap(null);
    polylines.forEach((polyline) => polyline?.setMap(null));
    if (directionsRenderer) directionsRenderer.setMap(null);
    clearTimeout(mapLoadTimeout);
  });

  // Watch for changes in props
  $: if (
    scriptLoaded &&
    map &&
    order.pickUpMapLocation &&
    order.dropOffMapLocation
  ) {
    updateMapMarkers();
  }

  function initializeMap() {
    if (
      !scriptLoaded ||
      !mapElement ||
      typeof google === "undefined" ||
      !google.maps
    ) {
      console.error(
        "Cannot initialize map: Google Maps not loaded or map element not found"
      );
      return;
    }

    try {
      // Create map centered on Ethiopia
      map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: { lat: 9.0222, lng: 38.7468 }, // Default center on Addis Ababa
        mapTypeId: "roadmap", // Use string literals instead of enum values
        fullscreenControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        zoomControl: true,
      });

      bounds = new google.maps.LatLngBounds();
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#3366FF",
          strokeWeight: 5,
          strokeOpacity: 0.7,
        },
      });

      directionsRenderer.setMap(map);

      updateMapMarkers();
      if (driverLocation) {
        updateDriverMarker();
        calculateRoutes();
      }

      // Add event listener to handle map resize issues
      google.maps.event.addListenerOnce(map, "idle", () => {
        if (markers.length > 0 || driverMarker) {
          fitMapBounds();
        }
      });
    } catch (error) {
      console.error("Error initializing map:", error);
      loadingError = `Failed to initialize map: ${error}`;
    }
  }

  function updateMapMarkers() {
    if (!map || !bounds) return;

    // Clear existing markers (except driver marker)
    markers.forEach((marker) => marker?.setMap(null));
    markers = [];

    // Add pickup marker
    if (order.pickUpMapLocation) {
      addMarker(
        order.pickUpMapLocation,
        "Pickup",
        "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
      );
    }

    // Add dropoff marker
    if (order.dropOffMapLocation) {
      addMarker(
        order.dropOffMapLocation,
        "Delivery",
        "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
      );
    }

    // Fit bounds to show all markers
    fitMapBounds();
  }

  function fitMapBounds() {
    if (!map || !bounds) return;

    try {
      // Reset bounds
      bounds = new google.maps.LatLngBounds();

      // Add all markers to bounds
      markers.forEach((marker) => {
        if (marker && marker.getPosition()) {
          bounds?.extend(marker.getPosition()!);
        }
      });

      // Add driver marker to bounds if it exists
      if (driverMarker && driverMarker.getPosition()) {
        bounds.extend(driverMarker.getPosition()!);
      }

      // Only fit bounds if we have at least one marker
      if (markers.length > 0 || driverMarker) {
        map.fitBounds(bounds);

        // If only one point, zoom out a bit
        if (
          (markers.length === 1 && !driverMarker) ||
          (markers.length === 0 && driverMarker)
        ) {
          map.setZoom(14);
        }
      }
    } catch (error) {
      console.error("Error fitting map bounds:", error);
    }
  }

  function addMarker(location: string, title: string, iconUrl: string) {
    if (!map || !bounds) return;

    try {
      const [lat, lng] = location
        .split(",")
        .map((coord) => parseFloat(coord.trim()));
      if (isNaN(lat) || isNaN(lng)) return;

      const position = new google.maps.LatLng(lat, lng);

      const marker = new google.maps.Marker({
        position,
        map,
        title,
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(36, 36),
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div><strong>${title}</strong></div>`,
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
      });

      markers.push(marker);
      bounds.extend(position);
    } catch (error) {
      console.error(`Error adding marker:`, error);
    }
  }

  function updateDriverMarker() {
    if (!map || !bounds || !driverLocation) return;

    try {
      const [lat, lng] = driverLocation
        .split(",")
        .map((coord) => parseFloat(coord.trim()));
      if (isNaN(lat) || isNaN(lng)) return;

      const position = new google.maps.LatLng(lat, lng);

      // Remove existing driver marker if it exists
      if (driverMarker) {
        driverMarker.setMap(null);
      }

      driverMarker = new google.maps.Marker({
        position,
        map,
        title: "Driver",
        icon: {
          url: driverIsOnline
            ? "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png"
            : "https://maps.google.com/mapfiles/ms/icons/orange-dot.png",
          scaledSize: new google.maps.Size(40, 40),
        },
        zIndex: 999,
        // Add animation to make the marker more noticeable when it updates
        animation: google.maps.Animation.DROP,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div><strong>Driver: ${driverName}</strong><br>
                   <span>${driverIsOnline ? "Online" : "Offline"}</span></div>`,
      });

      driverMarker.addListener("click", () => {
        infoWindow.open(map, driverMarker!);
      });

      // Update bounds with the new driver position
      bounds.extend(position);

      // Recenter map to include driver
      fitMapBounds();

      // Recalculate routes with the new driver position
      calculateRoutes();
    } catch (error) {
      console.error("Error updating driver marker:", error);
    }
  }

  function calculateRoutes() {
    if (!map || !directionsService || !directionsRenderer || !driverLocation)
      return;

    // First clear any existing directions
    directionsRenderer.setMap(null);
    directionsRenderer.setMap(map);

    // Create a valid DirectionsResult with minimum required fields
    const emptyDirections = {
      routes: [],
      geocoded_waypoints: [],
      request: {} as any,
    };
    directionsRenderer.setDirections(
      emptyDirections as google.maps.DirectionsResult
    );

    // Calculate route from driver to pickup if order not picked up yet
    if (order.pickUpMapLocation) {
      try {
        const [driverLat, driverLng] = driverLocation
          .split(",")
          .map((coord) => parseFloat(coord.trim()));
        const [pickupLat, pickupLng] = order.pickUpMapLocation
          .split(",")
          .map((coord) => parseFloat(coord.trim()));

        if (
          isNaN(driverLat) ||
          isNaN(driverLng) ||
          isNaN(pickupLat) ||
          isNaN(pickupLng)
        )
          return;

        const driverLatLng = new google.maps.LatLng(driverLat, driverLng);
        const pickupLatLng = new google.maps.LatLng(pickupLat, pickupLng);

        const request = {
          origin: driverLatLng,
          destination: pickupLatLng,
          travelMode: google.maps.TravelMode.DRIVING,
        };

        directionsService.route(request, (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRenderer?.setDirections(result);
          } else {
            console.error("Error calculating route:", status);
          }
        });
      } catch (error) {
        console.error("Error calculating route:", error);
      }
    }
  }
</script>

<div
  class="w-full h-full rounded-lg overflow-hidden relative"
  bind:this={mapElement}
>
  {#if !scriptLoaded || scriptLoading}
    <div class="absolute inset-0 flex items-center justify-center bg-gray-100">
      <div class="flex flex-col items-center justify-center">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mb-2"
        ></div>
        <div class="text-gray-500 text-sm">Loading map...</div>
      </div>
    </div>
  {/if}

  {#if loadingError}
    <div class="absolute inset-0 flex items-center justify-center bg-red-50">
      <div class="text-red-600 p-4 text-center">
        <div class="text-xl mb-2">⚠️</div>
        <div>{loadingError}</div>
        <button
          class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          on:click={() => {
            loadingError = "";
            loadGoogleMapsScript();
          }}
        >
          Retry
        </button>
      </div>
    </div>
  {/if}
</div>

<svelte:head>
  <script>
    // Define the initGoogleMaps callback for global access
    window.initGoogleMaps = window.initGoogleMaps || function () {};
  </script>
</svelte:head>

<style>
  div {
    min-height: 300px;
  }
</style>
