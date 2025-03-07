import { Resend } from 'resend';
import { RESEND_API } from '$env/static/private';

const resend = new Resend(RESEND_API);
export async function sendMail(to: string, subject: string, message: string) {
	try {
		const data = await resend.emails.send({
			from: 'logistics@behulum.com',
			to: to,
			subject: subject,
			html: message
		});

		if (data) {
			return true;
		}
	} catch (error) {
		console.error({ error });
		throw new Error('Email not sent', error as Error);
	}
}
