import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer } from "ws";
import { 
  insertMemeSchema, 
  insertCommentSchema, 
  insertUserSchema,
  insertGameSessionSchema,
  insertResourceSchema
} from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./auth";
import cookieParser from "cookie-parser";
import authRoutes from "./authRoutes";
import mailchimpRoutes from "./mailchimpRoutes";
import cors from "cors";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Configure CORS to allow requests from the production domain
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'https://clientfromhell.co',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // Set up cookie parser
  app.use(cookieParser());
  
  // Setup Auth
  setupAuth(app);
  
  // Auth routes
  app.use('/api/auth', authRoutes);
  
  // Mailchimp subscription routes
  app.use('/api/mailchimp', mailchimpRoutes);
  
  // Set up WebSocket server for realtime updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket connection established');
    
    ws.on('message', async (message) => {
      try {
        // Parse the message from client
        const data = JSON.parse(message.toString());
        
        // Check if there's a JWT token for authentication
        if (data.auth && data.auth.token) {
          // You could verify token here if needed
          console.log('Authenticated WebSocket message received');
        }
        
        // Handle different message types
        switch(data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;
          
          case 'get_memes':
            const memes = await storage.getMemes(10, 0, 'hot');
            ws.send(JSON.stringify({ type: 'memes_list', data: memes }));
            break;
            
          default:
            console.log('Unknown message type', data.type);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    // Send welcome message
    ws.send(JSON.stringify({ 
      type: 'welcome', 
      message: 'Connected to Client From Hell websocket server',
      timestamp: new Date().toISOString()
    }));
  });
  
  // Add close event listener
  wss.on('close', () => {
    console.log('WebSocket server closed');
  });
  
  // Define broadcast function for sending messages to all clients
  const broadcast = (channel: string, data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ channel, data }));
      }
    });
  };
  
  // User routes - replaced by auth routes with secure authentication
  // Authentication is now handled by /api/auth/* endpoints
  
  // Meme routes
  app.get('/api/memes', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sort as string) || 'hot';
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      const memes = userId 
        ? await storage.getMemesByUser(userId, limit, offset) 
        : await storage.getMemes(limit, offset, sortBy);
      
      res.json(memes);
    } catch (error) {
      console.error('Error fetching memes:', error);
      res.status(500).json({ message: 'Failed to fetch memes' });
    }
  });
  
  app.get('/api/memes/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const meme = await storage.getMeme(id);
      
      if (!meme) {
        return res.status(404).json({ message: 'Meme not found' });
      }
      
      res.json(meme);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch meme' });
    }
  });
  
  app.post('/api/memes/:id/vote', isAuthenticated, async (req, res) => {
    try {
      const memeId = parseInt(req.params.id);
      const userId = req.user?.id || 0;
      const { vote } = req.body;
      
      if (vote !== 'up' && vote !== 'down') {
        return res.status(400).json({ message: 'Invalid vote type' });
      }
      
      const updatedMeme = await storage.voteMeme(memeId, userId, vote);
      res.json(updatedMeme);
    } catch (error) {
      console.error('Error voting on meme:', error);
      res.status(500).json({ message: 'Failed to vote on meme' });
    }
  });
  
  // Protected route - only authenticated users can create memes
  app.post('/api/memes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const memeData = insertMemeSchema.parse({
        ...req.body,
        authorId: userId // Set the authorId from the authenticated user
      });
      
      const meme = await storage.createMeme(memeData);
      
      // Broadcast new meme to connected clients
      broadcast('new-meme', meme);
      
      res.status(201).json(meme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid meme data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create meme' });
    }
  });
  
  // Protected route - only authenticated users can vote
  app.post('/api/memes/:id/vote', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { vote } = req.body;
      
      if (!vote || !['up', 'down'].includes(vote)) {
        return res.status(400).json({ message: 'Invalid vote data' });
      }
      
      const meme = await storage.voteMeme(id, userId, vote);
      res.json(meme);
    } catch (error) {
      res.status(500).json({ message: 'Failed to vote on meme' });
    }
  });
  
  // Comment routes
  app.get('/api/memes/:memeId/comments', async (req, res) => {
    try {
      const memeId = parseInt(req.params.memeId);
      const comments = await storage.getComments(memeId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch comments' });
    }
  });
  
  // Protected route - only authenticated users can post comments
  app.post('/api/comments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const commentData = insertCommentSchema.parse({
        ...req.body,
        authorId: userId // Set the authorId from the authenticated user
      });
      
      const comment = await storage.createComment(commentData);
      
      // Broadcast new comment to connected clients
      broadcast('new-comment', comment);
      
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid comment data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create comment' });
    }
  });
  
  // Protected route - only authenticated users can vote on comments
  app.post('/api/comments/:id/vote', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      
      const comment = await storage.voteComment(id, userId, 'up');
      res.json(comment);
    } catch (error) {
      res.status(500).json({ message: 'Failed to vote on comment' });
    }
  });
  
  // Game session routes
  // Protected route - only authenticated users can view their game sessions
  app.get('/api/game/sessions/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const requestedUserId = parseInt(req.params.userId);
      const userId = req.user.id;
      
      // Users can only see their own game sessions
      if (userId !== requestedUserId) {
        return res.status(403).json({ message: 'Unauthorized to access these game sessions' });
      }
      
      const limit = parseInt(req.query.limit as string) || 10;
      const sessions = await storage.getGameSessions(requestedUserId, limit);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch game sessions' });
    }
  });
  
  // Protected route - only authenticated users can create game sessions
  app.post('/api/game/sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessionData = insertGameSessionSchema.parse({
        ...req.body,
        userId: userId // Set the userId from the authenticated user
      });
      
      const session = await storage.createGameSession(sessionData);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid session data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create game session' });
    }
  });
  
  // Protected route - only authenticated users can update their game sessions
  app.patch('/api/game/sessions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      
      // First, get the session to check ownership
      const existingSession = await storage.getGameSession(id);
      
      if (!existingSession) {
        return res.status(404).json({ message: 'Game session not found' });
      }
      
      // Users can only update their own game sessions
      if (existingSession.userId !== userId) {
        return res.status(403).json({ message: 'Unauthorized to update this game session' });
      }
      
      const session = await storage.updateGameSession(id, req.body);
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update game session' });
    }
  });
  
  // Resource routes
  app.get('/api/resources', async (req, res) => {
    try {
      const category = req.query.category as string;
      const resources = await storage.getResources(category);
      res.json(resources);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch resources' });
    }
  });
  
  app.get('/api/resources/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resource = await storage.getResource(id);
      
      if (!resource) {
        return res.status(404).json({ message: 'Resource not found' });
      }
      
      res.json(resource);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch resource' });
    }
  });
  
  // Protected route - only authenticated users can create resources
  app.post('/api/resources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const resourceData = insertResourceSchema.parse({
        ...req.body,
        createdBy: userId // Set the createdBy field from the authenticated user
      });
      
      const resource = await storage.createResource(resourceData);
      res.status(201).json(resource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid resource data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create resource' });
    }
  });
  
  // Protected route - only authenticated users can vote on resources
  app.post('/api/resources/:id/vote', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { vote } = req.body;
      
      if (!vote || !['up', 'down'].includes(vote)) {
        return res.status(400).json({ message: 'Invalid vote data' });
      }
      
      const resource = await storage.voteResource(id, userId, vote);
      res.json(resource);
    } catch (error) {
      res.status(500).json({ message: 'Failed to vote on resource' });
    }
  });

  return httpServer;
}
