import { z } from 'zod';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { Resend } from 'resend';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Define the contact form schema with Zod
const contactSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
    email: z.string().email({ message: 'Please enter a valid email address' }),
    phone: z.string().optional(),
    company: z.string().optional(),
    service: z.enum(['express', 'warehouse', 'freight', 'tracking', 'other']),
    message: z.string().min(10, { message: 'Message must be at least 10 characters' })
});

export const load = async () => {
    // Create an empty form for initial load
    const contactForm = await superValidate(contactSchema);

    return {
        contactForm
    };
};

export const actions = {
    default: async ({ request }) => {
        // Validate the form data against our schema
        const form = await superValidate(request, contactSchema);

        if (!form.valid) {
            // Return validation errors
            return fail(400, { contactForm: form });
        }

        try {
            // Send contact form email using Resend
            await resend.emails.send({
                from: 'Contact Form <noreply@yourdomain.com>',
                to: 'logistics@behulum.com',
                subject: `New Contact Form Submission: ${form.data.service}`,
                html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5; margin-bottom: 24px;">New Contact Form Submission</h1>
            
            <div style="margin-bottom: 24px; border-left: 4px solid #4F46E5; padding-left: 16px;">
              <p><strong>Name:</strong> ${form.data.name}</p>
              <p><strong>Email:</strong> ${form.data.email}</p>
              <p><strong>Phone:</strong> ${form.data.phone || 'Not provided'}</p>
              <p><strong>Company:</strong> ${form.data.company || 'Not provided'}</p>
              <p><strong>Service of Interest:</strong> ${form.data.service}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-line;">${form.data.message}</p>
            </div>
            
            <p style="color: #6B7280; font-size: 14px;">
              This message was sent from the contact form on your website.
            </p>
          </div>
        `
            });

            // Return success
            return {
                contactForm: form,
                success: true
            };
        } catch (error) {
            console.error('Error sending email:', error);

            // Return error
            return fail(500, {
                contactForm: form,
                error: 'Failed to send your message. Please try again later.'
            });
        }
    }
}; 