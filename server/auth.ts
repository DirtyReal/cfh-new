import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import { User } from '@shared/schema';
import express from 'express';
import session from 'express-session';

// Secret for JWT token signing
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session-secret-change-in-production';

// Setup Passport configuration
export function setupAuth(app: express.Express) {
  // Set up session middleware
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    }
  }));

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  // Local strategy for username/password login
  passport.use(new LocalStrategy(
    {
      usernameField: 'username',
      passwordField: 'password',
    },
    async (username, password, done) => {
      try {
        // Find user by username
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          return done(null, false, { message: 'Incorrect username.' });
        }
        
        // Check if password is valid
        if (!user.password) {
          return done(null, false, { message: 'This account uses social login.' });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// Generate JWT token for user
export function generateToken(user: User): string {
  return jwt.sign(
    { 
      id: user.id,
      email: user.email,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Authentication middleware
export function isAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check for JWT token in headers
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (decoded) {
      // Attach user to request
      storage.getUser(decoded.id)
        .then(user => {
          if (user) {
            (req as any).user = user;
            return next();
          }
          res.status(401).json({ message: 'Unauthorized' });
        })
        .catch(() => {
          res.status(401).json({ message: 'Unauthorized' });
        });
      return;
    }
  }
  
  res.status(401).json({ message: 'Unauthorized' });
}