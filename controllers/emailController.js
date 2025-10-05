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
    
    // The ID is nested in result.data.id, not result.id
    res.json({ 
      success: true, 
      messageId: result.data.id  // ✅ Changed from result.id to result.data.id
    });
    
  } catch (error) {
    console.error('Email controller error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
