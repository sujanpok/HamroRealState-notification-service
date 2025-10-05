// services/emailService.js
import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('Resend initialized with API key:', process.env.RESEND_API_KEY);

export async function sendEmail({ from, to, subject, html }) {
  try {
    // Construct proper "from" email address
    const fullFrom = `${from}@${process.env.EMAIL_DOMAIN}`;
    
    console.log(`Sending email from: ${fullFrom} to: ${to} with subject: ${subject}`);
    console.log(`Email content: ${html}`);
    
    // Wait for Resend API to complete
    const data = await resend.emails.send({
      from: fullFrom,
      to,
      subject,
      html,
    });
    
    console.log(`✅ Email sent successfully! Message ID: ${data.id}`);
    
    return data;
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}
