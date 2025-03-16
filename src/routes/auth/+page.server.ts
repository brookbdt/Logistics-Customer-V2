import { JWTSECRET, WEBAPP_URL } from "$env/static/private";
import { prisma } from "$lib/utils/prisma.js";
import { sendMail } from "$lib/utils/send-email.server.js";
import { fail, redirect } from "@sveltejs/kit";
import bcryptjs from "bcryptjs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { setError, superValidate } from "sveltekit-superforms/server";
import { z } from "zod";
import { Resend } from 'resend';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmailSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' })
});

export const load = async (event) => {
  const sendEmailForm = await superValidate(sendEmailSchema);

  const { session } = await event.parent();

  if (session?.user?.email) throw redirect(303, "/");

  return {
    sendEmailForm,
  };
};

export const actions = {
  sendEmail: async ({ request }) => {
    const sendEmailForm = await superValidate(request, sendEmailSchema);
    if (!sendEmailForm.valid) {
      return fail(400, { sendEmailForm });
    }

    try {
      // Send magic link email using Resend
      await resend.emails.send({
        from: 'Logistics App <noreply@yourdomain.com>',
        to: sendEmailForm.data.email,
        subject: 'Your Magic Link to Sign In',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5; margin-bottom: 24px;">Welcome to our Logistics App!</h1>
            <p style="margin-bottom: 24px; font-size: 16px; line-height: 1.5;">
              Click the button below to sign in to your account. This link is valid for 10 minutes.
            </p>
            <a href="${process.env.PUBLIC_SITE_URL}/auth/verify?token=PLACEHOLDER_TOKEN&email=${sendEmailForm.data.email}" 
               style="display: inline-block; background-color: #4F46E5; color: white; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-bottom: 24px;">
              Sign In to Your Account
            </a>
            <p style="color: #6B7280; font-size: 14px;">
              If you didn't request this email, you can safely ignore it.
            </p>
          </div>
        `
      });

      // Return success
      return {
        sendEmailForm,
        emailSent: true
      };
    } catch (error) {
      console.error('Error sending email:', error);

      // Return error
      return fail(500, {
        sendEmailForm,
        error: 'Failed to send email. Please try again later.'
      });
    }
  },
};
