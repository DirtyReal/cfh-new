// Simple Express server for production (ES Module version)
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import WebSocket from 'ws';

// Create Express app
const app = express();

// Middleware
app.use(cors({
  origin: ['http://clientfromhell.co', 'https://clientfromhell.co', 'http://www.clientfromhell.co', 'https://www.clientfromhell.co'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add OPTIONS pre-flight handling for all routes
app.options('*', cors());
app.use(express.json());
app.use(cookieParser());

// Database setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }
    
    // In a real app, you'd save this to the database
    // For now, just return a success response with a mock user
    res.status(201).json({
      id: 1,
      username,
      email,
      displayName: username,
      avatar: null,
      level: 1,
      xp: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // In a real app, you'd validate against the database
    // For now, just return a success response with a mock user
    res.status(200).json({
      id: 1,
      username,
      email: `${username}@example.com`,
      displayName: username,
      avatar: null,
      level: 1,
      xp: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // No real session to destroy in this simple version
  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/api/auth/user', (req, res) => {
  // In a real app, this would check the session/token
  // For now, we'll just return null to indicate not logged in
  res.status(401).json({ message: 'Unauthorized' });
});

// Newsletter signup endpoint
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    
    // Mailchimp API configuration
    const apiKey = process.env.MAILCHIMP_API_KEY;
    const dataCenter = process.env.MAILCHIMP_DATA_CENTER;
    const listId = process.env.MAILCHIMP_LIST_ID;
    
    if (!apiKey || !dataCenter || !listId) {
      return res.status(500).json({ message: 'Mailchimp configuration is missing' });
    }
    
    const url = `https://${dataCenter}.api.mailchimp.com/3.0/lists/${listId}/members`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`apikey:${apiKey}`).toString('base64')}`
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return res.status(200).json({ message: 'Subscription successful' });
    } else {
      // If the user is already subscribed, Mailchimp returns a 400 error
      if (data.title === 'Member Exists') {
        return res.status(200).json({ message: 'You are already subscribed' });
      }
      
      return res.status(400).json({ message: data.title || 'Subscription failed' });
    }
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});