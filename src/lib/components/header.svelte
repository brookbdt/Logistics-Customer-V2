<script lang="ts">
  import Home from "$lib/assets/shared/home.svg.svelte";
  import Image from "$lib/assets/shared/image.svg.svelte";
  import {
    unreadCount,
    notifications,
    markAsRead,
    type Notification as NotificationType,
  } from "$lib/stores/notificationStore";
  import Notification from "$lib/assets/shared/notification.svg.svelte";
  import ProfileIcon from "$lib/assets/shared/profile-icon.svg.svelte";
  import ProfileThin from "$lib/assets/shared/profile-thin.svg.svelte";
  import { clickOutside } from "$lib/utils/click-outside";
  import BellIcon from "$lib/assets/shared/bell-icon.svg.svelte";

  let showNotifications = false;

  function toggleNotifications() {
    showNotifications = !showNotifications;
  }

  function closeNotifications() {
    showNotifications = false;
  }

  function handleNotificationClick(notification: NotificationType) {
    markAsRead(notification.id);

    // Navigate based on notification type
    if (notification.type === "ORDER_ACCEPTED" && notification.orderId) {
      window.location.href = `/finalize-order/${notification.orderId}`;
    }

    closeNotifications();
  }

  let modalVisible: boolean = false;
</script>

<header
  use:clickOutside={() => (modalVisible = false)}
  class="flex w-full justify-between h-16 bg-primary p-4"
>
  <button
    on:click={() => {
      modalVisible = !modalVisible;
    }}
  >
    <Image class="h-8" />
  </button>

  <div class="relative">
    <button
      on:click={toggleNotifications}
      class="p-2 relative"
      aria-label="Notifications"
    >
      <BellIcon className="h-6 w-6 text-gray-600" />
      {#if $unreadCount > 0}
        <span
          class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center"
        >
          {$unreadCount > 9 ? "9+" : $unreadCount}
        </span>
      {/if}
    </button>

    {#if showNotifications}
      <div
        use:clickOutside={closeNotifications}
        class="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg z-50 max-h-96 overflow-y-auto"
      >
        <div class="p-3 border-b">
          <h3 class="text-lg font-medium">Notifications</h3>
        </div>

        {#if $notifications.length === 0}
          <div class="p-4 text-center text-gray-500">No notifications</div>
        {:else}
          <div class="divide-y">
            {#each $notifications as notification}
              <div
                class="p-3 hover:bg-gray-50 cursor-pointer flex"
                class:bg-blue-50={!notification.isRead}
                on:click={() => handleNotificationClick(notification)}
              >
                <div class="flex-1">
                  <div class="font-medium">{notification.title}</div>
                  <div class="text-sm text-gray-600">
                    {notification.content}
                  </div>
                  <div class="text-xs text-gray-400 mt-1">
                    {(new Date(notification.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                {#if !notification.isRead}
                  <div
                    class="w-2 h-2 bg-blue-500 rounded-full self-start mt-2"
                  ></div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</header>

{#if modalVisible}
  <div class=" bg-white shadow-md left-0 z-50 w-full top-16 p-4 grid gap-2">
    <a href="/" class="flex gap-2"> <Home /> Home</a>
    <a href="/customer-information" class="flex gap-2">
      <ProfileThin /> Edit profile</a
    >
  </div>
{/if}
