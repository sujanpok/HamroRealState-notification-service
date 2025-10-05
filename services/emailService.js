import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('Resend initialized');

export async function sendEmail({ from, to, subject, html }) {
  try {
    const fullFrom = `${from}@${process.env.EMAIL_DOMAIN}`;
    console.log(`Sending email from: ${fullFrom} to: ${to} with subject: ${subject}`);
    
    const result = await resend.emails.send({
      from: fullFrom,
      to,
      subject,
      html,
    });
    
    console.log('Resend API response:', JSON.stringify(result, null, 2));
    
    // Check for errors in response
    if (result.error) {
      console.error('Resend API returned error:', result.error);
      throw new Error(result.error.message || 'Resend API error');
    }
    
    // Verify we got a valid response
    if (!result.data || !result.data.id) {
      console.error('Invalid response from Resend:', result);
      throw new Error('Invalid response from Resend API');
    }
    
    console.log(`✅ Email sent successfully! Message ID: ${result.data.id}`);
    
    return result;
    
  } catch (error) {
    console.error('Email service error:', error);
    throw error;
  }
}
