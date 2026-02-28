import { Resend } from 'resend';

// Initialize Resend
// Note: If RESEND_API_KEY is missing, it will silently console.log the notification to avoid breaking the core loop.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const operatorEmail = process.env.OPERATOR_EMAIL;

export async function sendPushNotification(subject: string, message: string, htmlDetails?: string) {
    if (!resend || !operatorEmail) {
        console.log(`\n🔔 [Push Notification Logged (Email Not Configured)]`);
        console.log(`Subject: ${subject}`);
        console.log(`${message}\n`);
        return;
    }

    try {
        await resend.emails.send({
            from: operatorEmail, // You must verify this domain or use resend's onboarding email.
            to: ["eed.jrr@gmail.com"],
            subject: `🧬 Organism: ${subject}`,
            html: `
                <div style="font-family: sans-serif; color: #171717; max-width: 600px; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px;">
                    <h2 style="margin-top: 0; color: #10b981;">Organism Update</h2>
                    <p style="font-size: 16px; line-height: 1.5;">${message.replace(/\n/g, '<br/>')}</p>
                    ${htmlDetails ? `<div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 6px; font-size: 14px;">${htmlDetails}</div>` : ''}
                    <hr style="border: 0; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #737373;">Open <a href="http://localhost:3000" style="color: #10b981;">Mission Control</a> for full details.</p>
                </div>
            `,
            text: `${message}\n\nOpen Mission Control: http://localhost:3000`
        });
        console.log(`  📧 Push notification sent: ${subject}`);
    } catch (error: any) {
        console.error(`  ❌ Failed to send push notification: ${error.message}`);
    }
}
