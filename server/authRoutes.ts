import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { storage } from './storage';
import { insertUserSchema } from '@shared/schema';
import { generateToken, isAuthenticated } from './auth';

const router = Router();

// Email validation schema with stronger validation
const emailSchema = z.string().email().min(5).max(100);

// Password validation schema with strong password requirements
const passwordSchema = z.string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .max(100, { message: 'Password must be less than 100 characters long' })
  .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  .regex(/[0-9]/, { message: 'Password must contain at least one number' });

// Local signup with email/password
router.post('/register', async (req, res) => {
  try {
    // Validate request body
    const validationSchema = insertUserSchema.extend({
      email: emailSchema,
      password: passwordSchema,
      confirmPassword: z.string()
    }).refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
    
    const validatedData = validationSchema.parse(req.body);
    
    // Check if email already exists
    const existingUserByEmail = await storage.getUserByEmail(validatedData.email);
    if (existingUserByEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Check if username already exists
    const existingUserByUsername = await storage.getUserByUsername(validatedData.username);
    if (existingUserByUsername) {
      return res.status(400).json({ message: 'Username already taken' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    // Create user
    const user = await storage.createUser({
      username: validatedData.username,
      email: validatedData.email,
      password: hashedPassword,
      displayName: validatedData.displayName || validatedData.username,
      avatar: validatedData.avatar,
      provider: 'local',
      providerId: null,
      refreshToken: null,
    });
    
    // Generate token
    const token = generateToken(user);
    
    // Log in the user after registration
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Login after registration failed' });
      }
      
      // Return user data and token
      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          displayName: user.displayName,
          level: user.level,
          xp: user.xp
        },
        token,
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.errors 
      });
    }
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// Local login with email/password
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return res.status(401).json({ message: info?.message || 'Authentication failed' });
    }
    
    // Log in the user (creates session)
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      
      // Generate token
      const token = generateToken(user);
      
      // Return user data and token
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          displayName: user.displayName,
          level: user.level,
          xp: user.xp
        },
        token,
      });
    });
  })(req, res, next);
});

// Get current user
router.get('/user', isAuthenticated, async (req, res) => {
  const user = req.user as any;
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    displayName: user.displayName,
    level: user.level || 1,
    xp: user.xp || 0,
    provider: user.provider || 'local',
    providerId: user.providerId,
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Update user profile
router.patch('/profile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // Only allow certain fields to be updated
    const { displayName, bio, avatar } = req.body;
    
    // Update the user profile
    const updatedUser = await storage.updateUser(userId, { 
      displayName, 
      bio, 
      avatar 
    });
    
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      avatar: updatedUser.avatar,
      level: updatedUser.level || 1,
      xp: updatedUser.xp || 0
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

export default router;