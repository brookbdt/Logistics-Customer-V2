import { SvelteKitAuth } from "@auth/sveltekit";
import Google from "@auth/core/providers/google";
import CredentialsProvider from "@auth/core/providers/credentials";
import {
  GOOGLE_ID,
  GOOGLE_SECRET,
  AUTH_SECRET,
  JWTSECRET,
} from "$env/static/private";
import { prisma } from "$lib/utils/prisma";
import jwt from "jsonwebtoken";
import bcryptjs from 'bcryptjs';

if (!GOOGLE_ID) {
  throw new Error("Google Id not found");
}
if (!GOOGLE_SECRET) {
  throw new Error("Google secret not found");
}
if (!AUTH_SECRET) {
  throw new Error("Auth secret not found");
}

interface JwtPayload {
  userEmail: string;
  password: string;
  iat: number;
}

export const authHook = SvelteKitAuth({
  trustHost: true,
  providers: [
    Google({ clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET }),
    CredentialsProvider({
      name: "Sign in with Email",
      credentials: {
        token: { label: "token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials.token) {
          throw new Error("Token not found");
        }
        let decodedToken;

        try {
          decodedToken = jwt.verify(
            credentials.token as string,
            JWTSECRET
          ) as JwtPayload;
        } catch (err) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            email: decodedToken.userEmail,
          },
        });

        if (!user) {
          throw new Error("User not found!");
        }
        if (!user.jwtPassword) {
          throw new Error("User password not set.");
        }

        const authorized = await bcryptjs.compare(
          decodedToken.password,
          user.jwtPassword
        );

        if (!authorized) {
          throw new Error("User not Authorized");
        }
        return {
          id: user.id.toString(),
          name: user.userName,
          email: user.email,
        };
      },
    }),
  ],
  pages: {
    error: "/auth/signup-error",
    signIn: "/auth"
  },
  secret: AUTH_SECRET,
  callbacks: {
    signIn: async (params) => {
      // Check if this is an employee trying to access the customer app
      if (params.account?.provider === "google") {
        if (!params.profile) {
          throw new Error("User in provider in undefined.");
        }
        if (!params.profile.email) {
          throw new Error(
            `Email not found in your ${params.account?.provider ?? `login provider's`
            } account`
          );
        }

        try {
          const findUser = await prisma.user.findFirst({
            where: {
              email: params.profile.email,
              isEmployee: false,
            },
          });
          if (!findUser) {
            await prisma.user.create({
              data: {
                email: params.profile.email,
                isEmployee: false,
                userName: params.profile.name,
                Customer: {
                  create: {},
                },
              },
            });
            return true;
          } else if (findUser) {
            return true;
          }
        } catch (error) {
          console.log(error as Error);
          throw new Error("User not found" + error);
        }
      } else if (params.account?.provider === "credentials") {
        return true;
      }
      throw new Error("Account provider not known.");
    },
    jwt: async (params) => {
      if (!params.token?.email) {
        throw new Error("Account JWT not found.");
      }
      const dbUser = await prisma.user.findFirst({
        where: {
          email: params.token.email,
        },
      });
      console.log("dbUser", dbUser);
      const dbCustomerData = await prisma.customer.findFirst({
        where: {
          userId: dbUser?.id,
        },
      });

      return {
        ...params.token,
        userData: dbUser,
        customerData: dbCustomerData,
      };
    },
    session: async (params) => {
      return {
        ...params.session,
        userData: params.token.userData,
        customerData: params.token.customerData,
      };
    },
  },
});