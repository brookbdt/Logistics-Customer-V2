import { sendMail } from "$lib/utils/send-email.server.js";
import { fail } from "@sveltejs/kit";
import { setError, superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

// Define the contact form schema with Zod
const contactSchema = z.object({
    name: z.string().min(2, { message: "Name must be at least 2 characters" }),
    email: z.string().email({ message: "Please enter a valid email address" }),
    phone: z.string().optional(),
    company: z.string().optional(),
    service: z.enum(["express", "warehouse", "freight", "tracking", "other"]).default("express"),
    message: z.string().min(10, { message: "Message must be at least 10 characters" }),
});

export const load = async () => {
    // Server-side validation form
    const contactForm = await superValidate(contactSchema);

    return {
        contactForm,
    };
};

export const actions = {
    submitContact: async ({ request }) => {
        // Validate the form using superValidate
        const contactForm = await superValidate(request, contactSchema);

        // If validation fails, return the form with errors
        if (!contactForm.valid) {
            return fail(400, { contactForm });
        }

        try {
            // Format the email content
            const emailContent = `
        New Contact Form Submission:
        
        Name: ${contactForm.data.name}
        Email: ${contactForm.data.email}
        Phone: ${contactForm.data.phone || "Not provided"}
        Company: ${contactForm.data.company || "Not provided"}
        Service of Interest: ${contactForm.data.service}
        
        Message:
        ${contactForm.data.message}
      `;

            // Send the email using the same sendMail utility as auth
            const emailSent = await sendMail(
                "logistics@behulum.com", // Recipient email
                `New Contact Form Submission from ${contactForm.data.name}`,
                emailContent
            );

            if (!emailSent) {
                return setError(contactForm, "", "Your message could not be sent. Please try again later.");
            }

            // Return the form and success status
            return {
                contactForm,
                success: true,
            };
        } catch (e) {
            console.error({ e });
            return setError(contactForm, "", "An error occurred while sending your message. Please try again later.");
        }
    },
}; 