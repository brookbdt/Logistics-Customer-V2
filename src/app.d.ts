/// <reference types="google.maps" />

import type { Session } from "@auth/core/types";
import { User } from "@prisma/client";
import { Customer } from "@prisma/client";
import { Scope } from "@prisma/client";

declare global {
  type EnhancedSessionType = Session & {
    userData: User;
    customerData: Customer;
  };

  namespace App {
    interface Locals {
      getSession(): Promise<EnhancedSessionType | null>;
    }
    interface PageData {
      session: EnhancedSessionType | null;
    }
  }
}

export {};
