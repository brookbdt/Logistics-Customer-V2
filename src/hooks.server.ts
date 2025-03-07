import { authHook } from "$lib/hooks/auth-hook.server";

import { sequence } from "@sveltejs/kit/hooks";

export const handle = sequence(authHook);
