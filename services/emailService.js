import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('Resend initialized');

export async function sendEmail({ from, to, subject, html }) {
  const fullFrom = `${from}@${process.env.EMAIL_DOMAIN}`;
  console.log(`Sending email from: ${fullFrom} to: ${to} with subject: ${subject}`);
  console.log(`Email content: ${html}`);
  
  const result = await resend.emails.send({
    from: fullFrom,
    to,
    subject,
    html,
  });
  
  // Extract the ID for cleaner logging
  console.log(`✅ Email sent successfully! Message ID: ${result.data?.id || 'unknown'}`);
  
  return result;
}
