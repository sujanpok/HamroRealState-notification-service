import { sendEmail } from '../services/emailService.js';

export async function send(req, res) {
  const { from, to, subject, html } = req.body;
  
  if (!from || !to || !subject || !html) {
    return res.status(400).json({ 
      error: 'Missing required fields: from, to, subject, html' 
    });
  }
  
  try {
    const result = await sendEmail({ from, to, subject, html });
    
    // Check if result has data
    if (!result || !result.data || !result.data.id) {
      console.error('Invalid Resend response:', result);
      return res.status(500).json({
        success: false,
        error: 'Email service returned invalid response',
        debug: result
      });
    }
    
    // Check for Resend API errors
    if (result.error) {
      console.error('Resend API error:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error.message || 'Email sending failed'
      });
    }
    
    res.json({ 
      success: true, 
      messageId: result.data.id
    });
    
  } catch (error) {
    console.error('Email controller error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
