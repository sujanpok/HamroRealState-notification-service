// controllers/emailController.js
import { sendEmail } from '../services/emailService.js';

export async function send(req, res) {
  const { from, to, subject, html } = req.body;
  
  // Validate required fields
  if (!from || !to || !subject || !html) {
    return res.status(400).json({ 
      error: 'Missing required fields: from, to, subject, html' 
    });
  }
  
  try {
    // Wait for email to send before responding
    const data = await sendEmail({ from, to, subject, html });
    
    res.json({ 
      success: true, 
      messageId: data.id 
    });
    
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
