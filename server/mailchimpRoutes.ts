import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

// Create Express router
const router = express.Router();

// Mailchimp API endpoint
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  // Validate environment variables
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  const dataCenter = process.env.MAILCHIMP_DATA_CENTER;

  // If any Mailchimp credentials are missing, return an error
  if (!apiKey || !listId || !dataCenter) {
    console.error('Mailchimp credentials missing');
    return res.status(500).json({ 
      error: 'Newsletter service configuration error. Please contact the site administrator.' 
    });
  }

  try {
    // Calculate MD5 hash of lowercase email for Mailchimp API
    const emailHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    
    // Prepare request to Mailchimp API - ensure data center is properly formatted
    // The data center value should be formatted without any hyphens (e.g., "us4" not "-us4")
    const formattedDataCenter = dataCenter.startsWith('-') ? dataCenter.substring(1) : dataCenter;
    const url = `https://${formattedDataCenter}.api.mailchimp.com/3.0/lists/${listId}/members/${emailHash}`;
    
    const data = {
      email_address: email,
      status: 'subscribed',
      merge_fields: {
        // You can add custom fields here if needed
        // FNAME: firstName,
        // LNAME: lastName,
      }
    };
    
    const response = await fetch(url, {
      method: 'PUT', // Using PUT to either add or update a subscriber
      headers: {
        'Authorization': `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const responseData = await response.json();
      console.error('Mailchimp API error:', responseData);
      
      // Handle specific Mailchimp errors
      if (responseData && typeof responseData === 'object' && 'title' in responseData && responseData.title === 'Member Exists') {
        return res.status(400).json({ 
          error: 'This email is already subscribed to our newsletter.' 
        });
      }
      
      // Return the actual error from Mailchimp
      const errorDetail = responseData && typeof responseData === 'object' && 'detail' in responseData ? responseData.detail : 'Failed to subscribe to the newsletter. Please try again later.';
      return res.status(response.status).json({ 
        error: errorDetail
      });
    }
    
    // Return success
    return res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to the newsletter!' 
    });
  } catch (error) {
    console.error('Mailchimp subscription error:', error);
    return res.status(500).json({ 
      error: 'Failed to connect to the newsletter service. Please try again later.' 
    });
  }
});

export default router;