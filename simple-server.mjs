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

// Debug middleware to log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Database setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple JWT functions
const generateToken = (user) => {
  // In a real app, you'd use a proper JWT library
  // This is just a simple placeholder for testing
  return 'mock-jwt-token-' + user.id;
};

// Store active users (in memory for demo)
const activeUsers = new Map();

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    console.log('Register attempt:', { username, email });
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }
    
    // Create a user 
    const user = {
      id: Date.now(), // Use timestamp as ID
      username,
      email,
      displayName: username,
      avatar: null,
      level: 1,
      xp: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Store in our in-memory store
    activeUsers.set(user.id, user);
    
    // Generate token and set cookie
    const token = generateToken(user);
    res.cookie('auth_token', token, { 
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    });
    
    console.log('User registered:', user.id);
    res.status(201).json(user);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', { username });
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // For demo, create a user if not exists
    let user = Array.from(activeUsers.values()).find(u => u.username === username);
    
    if (!user) {
      user = {
        id: Date.now(),
        username,
        email: `${username}@example.com`,
        displayName: username,
        avatar: null,
        level: 1,
        xp: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      activeUsers.set(user.id, user);
    }
    
    // Generate token and set cookie
    const token = generateToken(user);
    res.cookie('auth_token', token, { 
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    });
    
    console.log('User logged in:', user.id);
    res.status(200).json(user);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  console.log('Logout request received');
  res.clearCookie('auth_token');
  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/api/auth/user', (req, res) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Try to get from cookie
    const token = req.cookies?.auth_token;
    if (!token) {
      console.log('No auth token found');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Extract user ID from token (in a real app, you'd verify the JWT)
    const userId = token.split('-').pop();
    const user = activeUsers.get(parseInt(userId));
    
    if (!user) {
      console.log('Invalid token, no user found');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    console.log('User authenticated from cookie:', user.id);
    return res.json(user);
  }
  
  const token = authHeader.split(' ')[1];
  // Extract user ID from token (in a real app, you'd verify the JWT)
  const userId = token.split('-').pop();
  const user = activeUsers.get(parseInt(userId));
  
  if (!user) {
    console.log('Invalid token, no user found');
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  console.log('User authenticated from header:', user.id);
  return res.json(user);
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