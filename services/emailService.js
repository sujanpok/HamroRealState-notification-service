import dotenv from 'dotenv';
dotenv.config();

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('Resend initialized with API key:', process.env.RESEND_API_KEY);
export async function sendEmail({ from, to, subject, html }) {
  const fullFrom = `${from}@${process.env.EMAIL_DOMAIN}`;
  console.log(`Sending email from: ${fullFrom} to: ${to} with subject: ${subject}`);
  console.log(`Email content: ${html}`);
  return resend.emails.send({
    from: fullFrom,
    to,
    subject,
    html,
  });
}
