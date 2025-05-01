import { JWTSECRET, WEBAPP_URL } from "$env/static/private";
import { prisma } from "$lib/utils/prisma.js";
import { sendMail } from "$lib/utils/send-email.server.js";
import { fail, redirect } from "@sveltejs/kit";
import bcryptjs from "bcryptjs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { zod } from "sveltekit-superforms/adapters";
import { setError, superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const sendEmailSchema = z.object({
  email: z.string().email(),
});

export const load = async (event) => {
  const sendEmailForm = await superValidate(zod(sendEmailSchema));

  const { session } = await event.parent();

  if (session?.user?.email) throw redirect(303, "/");

  return {
    sendEmailForm,
  };
};

export const actions = {
  sendEmail: async ({ request }) => {
    const sendEmailForm = await superValidate(request, zod(sendEmailSchema));
    if (!sendEmailForm.valid) {
      return fail(400, { sendEmailForm });
    }

    try {
      const uuidPassword = randomBytes(48).toString("hex");
      const encryptedPassword = await bcryptjs.hash(uuidPassword, 10);
      const user = await prisma.user.upsert({
        where: {
          email: sendEmailForm.data.email,
        },
        create: {
          email: sendEmailForm.data.email,
          jwtPassword: encryptedPassword,
          isEmployee: false,
          Customer: {
            create: {},
          },
        },
        update: {
          jwtPassword: encryptedPassword,
        },
      });

      const jwtToken = jwt.sign(
        { userEmail: user.email, password: uuidPassword },
        JWTSECRET,
        {
          expiresIn: "1h",
        }
      );

      const emailSent = await sendMail(
        sendEmailForm.data.email,
        "Sign in Link from Logistics Application",
        `${WEBAPP_URL}/auth/signup?token=${jwtToken}`
      );

      if (!emailSent) {
        return setError(sendEmailForm, "", "Email could not be sent");
      }

      return {
        sendEmailForm,
        emailSent,
      };
    } catch (e) {
      console.error({ e });
      return setError(sendEmailForm, "", "Could not send email");
    }
  },
};
