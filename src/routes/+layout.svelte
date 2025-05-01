<script lang="ts">
  import { page } from "$app/stores";
  import Header from "$lib/components/header.svelte";
  import Nprogress from "$lib/components/nprogress.svelte";
  import { fetchNotifications } from "$lib/stores/notificationStore";
  import { onDestroy, onMount } from "svelte";
  import "../app.postcss";
  import { SvelteToast } from "@zerodevx/svelte-toast";
  import { toast } from "@zerodevx/svelte-toast";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import NotificationToast from "$lib/components/notification-toast.svelte";
  import { initSocket, socket } from "$lib/socket/client";

  export let data;
  let unsubscribeSocket: (() => void) | undefined;

  // Only fetch notifications on the client side when the user is authenticated
  $: if (browser && $page.data.session?.user) {
    fetchNotifications();
  }

  onMount(() => {
    if (!browser) return;

    // Add event listener for new order notifications
    const handleNewOrder = (event: CustomEvent) => {
      const order = event.detail;
      console.log("New order notification received:", order.id);

      // Show toast notification for new order
      toast.push({
        msg: `<div class="p-3">
          <div class="font-semibold">New Order #${order.id}</div>
          <div class="text-sm">Status: ${order.orderStatus}</div>
        </div>`,
        duration: 5000,
        theme: {
          "--toastBackground": "#4CAF50",
          "--toastColor": "white",
        },
      });
    };

    window.addEventListener("new-order", handleNewOrder as EventListener);

    let setupPromises = [];

    if (data.session?.userData?.id) {
      // Initialize socket connection
      initSocket();

      unsubscribeSocket = socket.subscribe((socketInstance) => {
        if (socketInstance?.connected) {
          // Join customer-specific room
          socketInstance.emit("join", `user_${data.session?.userData?.id}`);

          // If customer has an associated customer record
          if (data.session?.customerData?.id) {
            socketInstance.emit(
              "join",
              `customer_${data.session?.customerData?.id}`
            );
          }
        }
      });
    }

    // Fetch notifications if user is logged in
    if ($page.data.session?.user) {
      fetchNotifications();
    }

    // Only proceed with FCM setup if user is logged in
    if ($page.data.session?.userData) {
      setupFCM();
    } else {
      console.log("User not logged in, skipping FCM setup");
    }

    // Return cleanup function
    return () => {
      if (unsubscribeSocket) unsubscribeSocket();
      window.removeEventListener("new-order", handleNewOrder as EventListener);
    };
  });

  // Separate FCM setup to avoid onMount return type issues
  async function setupFCM() {
    try {
      console.log("Setting up FCM notifications for logged in user");

      // Dynamically import Firebase client functions
      const { requestAndGetFCMToken, setupForegroundMessageHandler } =
        await import("$lib/firebase/firebaseClient");

      // Request FCM token - similar to Flutter's initNotifications()
      const token = await requestAndGetFCMToken();
      console.log(
        "FCM token result:",
        token ? "Token received" : "No token received"
      );

      if (token) {
        console.log("FCM token obtained, updating server");
        const userData = $page.data.session?.userData;

        // Update FCM token in database - similar to Flutter's updateFcmToken()
        const response = await fetch("/update-fcm-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
          }),
        });

        const result = await response.json();
        console.log("FCM token update result:", result);

        // Setup realtime notification handler
        await setupForegroundMessageHandler((payload) => {
          console.log("Received foreground notification:", payload);

          // Refresh notifications to sync with the server
          fetchNotifications();

          // Extract notification details
          const title = payload.notification?.title || "New Notification";
          const body = payload.notification?.body || "";
          const notificationType = payload.data?.type || "";
          const orderId = payload.data?.orderId;

          const isOrderAccepted =
            notificationType === "ORDER_ACCEPTED" && orderId;

          // Create custom element with our component for toast
          const toastContainer = document.createElement("div");
          const toastComponent = new NotificationToast({
            props: {
              title,
              body,
              type: notificationType,
              showAction: isOrderAccepted,
              actionText: "Proceed to Payment",
            },
            target: toastContainer,
          });

          toastComponent.$on("dismiss", () => {
            toast.pop();
          });

          // Use HTML content for the toast message
          toast.push({
            msg: toastContainer.innerHTML,
            duration: 10000,
            theme: {
              "--toastPadding": "0px",
              "--toastMsgPadding": "0px",
              "--toastBackground": "transparent",
              "--toastBoxShadow": "none",
              "--toastBorderRadius": "0",
              "--toastBarHeight": "0",
            },
          });
        });
      } else {
        console.log("Failed to obtain FCM token or permission denied");
        // Try checking the notification permission status
        if (browser && "Notification" in window) {
          console.log(
            "Notification permission status:",
            Notification.permission
          );
        }
      }
    } catch (error) {
      console.error("Error setting up FCM notifications:", error);
    }
  }

  onDestroy(() => {
    if (unsubscribeSocket) unsubscribeSocket();
  });
</script>

{#if data.session === null}
  <slot />
{:else}
  <Header />
  <slot />
{/if}
<SvelteToast />
<Nprogress />
