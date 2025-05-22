import { 
  users, type User, type InsertUser,
  memes, type Meme, type InsertMeme,
  comments, type Comment, type InsertComment,
  gameSessions, type GameSession, type InsertGameSession,
  resources, type Resource, type InsertResource
} from "@shared/schema";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User>;
  
  // Meme operations
  getMemes(limit: number, offset: number, sortBy?: string): Promise<Meme[]>;
  getMemesByUser(userId: number, limit?: number, offset?: number): Promise<Meme[]>;
  getMeme(id: number): Promise<Meme | undefined>;
  createMeme(meme: InsertMeme): Promise<Meme>;
  voteMeme(id: number, userId: number, vote: 'up' | 'down'): Promise<Meme>;
  
  // Comment operations
  getComments(memeId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  voteComment(id: number, userId: number, vote: 'up'): Promise<Comment>;
  
  // Game session operations
  getGameSessions(userId: number, limit?: number): Promise<GameSession[]>;
  getGameSession(id: number): Promise<GameSession | undefined>;
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: number, data: Partial<GameSession>): Promise<GameSession>;
  
  // Resource operations
  getResources(category?: string): Promise<Resource[]>;
  getResource(id: number): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  voteResource(id: number, userId: number, vote: 'up' | 'down'): Promise<Resource>;
  
  // Newsletter operations
  addNewsletterSubscriber(email: string): Promise<boolean>;
  getNewsletterSubscribers(): Promise<string[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private memes: Map<number, Meme>;
  private comments: Map<number, Comment>;
  private gameSessions: Map<number, GameSession>;
  private resources: Map<number, Resource>;
  private newsletterSubscribers: Set<string>;
  
  private userVotes: Map<string, 'up' | 'down'>;
  
  private userId: number;
  private memeId: number;
  private commentId: number;
  private gameSessionId: number;
  private resourceId: number;

  constructor() {
    this.users = new Map();
    this.memes = new Map();
    this.comments = new Map();
    this.gameSessions = new Map();
    this.resources = new Map();
    this.userVotes = new Map();
    this.newsletterSubscribers = new Set();
    
    this.userId = 1;
    this.memeId = 1;
    this.commentId = 1;
    this.gameSessionId = 1;
    this.resourceId = 1;
    
    // Add some initial resources
    this.seedResources();
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    const user: User = { 
      id,
      email: insertUser.email,
      username: insertUser.username,
      password: insertUser.password || null,
      displayName: insertUser.displayName || null,
      avatar: insertUser.avatar || null,
      provider: insertUser.provider || 'local',
      providerId: insertUser.providerId || null,
      refreshToken: insertUser.refreshToken || null,
      level: 1, 
      xp: 0,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const user = await this.getUser(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    
    const updatedUser = {
      ...user,
      ...data,
      updatedAt: new Date()
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  // Meme operations
  async getMemes(limit: number = 10, offset: number = 0, sortBy: string = 'hot'): Promise<Meme[]> {
    let memes = Array.from(this.memes.values());
    
    // Apply sorting
    if (sortBy === 'new') {
      memes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'top') {
      memes.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    } else {
      // 'hot' - combination of new and popularity
      memes.sort((a, b) => {
        const aScore = (b.upvotes - b.downvotes) + new Date(b.createdAt).getTime() / 1000000;
        const bScore = (a.upvotes - a.downvotes) + new Date(a.createdAt).getTime() / 1000000;
        return aScore - bScore;
      });
    }
    
    // Get paginated memes
    const paginatedMemes = memes.slice(offset, offset + limit);
    
    // Attach author data to each meme
    const memesWithAuthors = await Promise.all(paginatedMemes.map(async (meme) => {
      const author = await this.getUser(meme.authorId);
      return {
        ...meme,
        author: author ? {
          id: author.id,
          username: author.username,
          level: author.level || 1,
          avatar: author.avatar,
          title: 'Designer' // Default title
        } : null
      };
    }));
    
    return memesWithAuthors;
  }
  
  async getMemesByUser(userId: number, limit: number = 10, offset: number = 0): Promise<Meme[]> {
    let memes = Array.from(this.memes.values()).filter(meme => meme.authorId === userId);
    
    // Sort by newest first for user's own posts
    memes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Get paginated memes
    const paginatedMemes = memes.slice(offset, offset + limit);
    
    // Attach author data to each meme
    const memesWithAuthors = await Promise.all(paginatedMemes.map(async (meme) => {
      const author = await this.getUser(meme.authorId);
      return {
        ...meme,
        author: author ? {
          id: author.id,
          username: author.username,
          level: author.level || 1,
          avatar: author.avatar,
          title: 'Designer' // Default title
        } : null
      };
    }));
    
    return memesWithAuthors;
  }
  
  async getMeme(id: number): Promise<Meme | undefined> {
    const meme = this.memes.get(id);
    if (!meme) return undefined;
    
    // Attach author data
    const author = await this.getUser(meme.authorId);
    return {
      ...meme,
      author: author ? {
        id: author.id,
        username: author.username,
        level: author.level || 1,
        avatar: author.avatar,
        title: 'Designer' // Default title
      } : null
    };
  }
  
  async createMeme(insertMeme: InsertMeme): Promise<Meme> {
    const id = this.memeId++;
    const now = new Date();
    const meme: Meme = {
      ...insertMeme,
      id,
      upvotes: 0,
      downvotes: 0,
      createdAt: now
    };
    this.memes.set(id, meme);
    return meme;
  }
  
  async voteMeme(id: number, userId: number, vote: 'up' | 'down'): Promise<Meme> {
    const meme = this.memes.get(id);
    if (!meme) throw new Error('Meme not found');
    
    const voteKey = `meme:${id}:user:${userId}`;
    const existingVote = this.userVotes.get(voteKey);
    
    // Remove existing vote
    if (existingVote === 'up') meme.upvotes--;
    if (existingVote === 'down') meme.downvotes--;
    
    // Apply new vote if it's different
    if (existingVote !== vote) {
      if (vote === 'up') meme.upvotes++;
      if (vote === 'down') meme.downvotes++;
      this.userVotes.set(voteKey, vote);
    } else {
      // If same vote, remove it (toggle)
      this.userVotes.delete(voteKey);
    }
    
    this.memes.set(id, meme);
    return meme;
  }
  
  // Comment operations
  async getComments(memeId: number): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.memeId === memeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = this.commentId++;
    const now = new Date();
    const comment: Comment = {
      ...insertComment,
      id,
      upvotes: 0,
      createdAt: now
    };
    this.comments.set(id, comment);
    return comment;
  }
  
  async voteComment(id: number, userId: number, vote: 'up'): Promise<Comment> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error('Comment not found');
    
    const voteKey = `comment:${id}:user:${userId}`;
    const existingVote = this.userVotes.get(voteKey);
    
    // Toggle vote
    if (existingVote === vote) {
      comment.upvotes--;
      this.userVotes.delete(voteKey);
    } else {
      comment.upvotes++;
      this.userVotes.set(voteKey, vote);
    }
    
    this.comments.set(id, comment);
    return comment;
  }
  
  // Game session operations
  async getGameSessions(userId: number, limit: number = 10): Promise<GameSession[]> {
    return Array.from(this.gameSessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  
  async getGameSession(id: number): Promise<GameSession | undefined> {
    return this.gameSessions.get(id);
  }
  
  async createGameSession(insertSession: InsertGameSession): Promise<GameSession> {
    const id = this.gameSessionId++;
    const now = new Date();
    const session: GameSession = {
      ...insertSession,
      id,
      createdAt: now,
      endedAt: null
    };
    this.gameSessions.set(id, session);
    return session;
  }
  
  async updateGameSession(id: number, data: Partial<GameSession>): Promise<GameSession> {
    const session = this.gameSessions.get(id);
    if (!session) throw new Error('Game session not found');
    
    const updatedSession = { ...session, ...data };
    this.gameSessions.set(id, updatedSession);
    return updatedSession;
  }
  
  // Resource operations
  async getResources(category?: string): Promise<Resource[]> {
    let resources = Array.from(this.resources.values());
    
    if (category) {
      resources = resources.filter(resource => resource.category === category);
    }
    
    return resources.sort((a, b) => b.votes - a.votes);
  }
  
  async getResource(id: number): Promise<Resource | undefined> {
    return this.resources.get(id);
  }
  
  async createResource(insertResource: InsertResource): Promise<Resource> {
    const id = this.resourceId++;
    const now = new Date();
    const resource: Resource = {
      ...insertResource,
      id,
      votes: 0,
      createdAt: now
    };
    this.resources.set(id, resource);
    return resource;
  }
  
  async voteResource(id: number, userId: number, vote: 'up' | 'down'): Promise<Resource> {
    const resource = this.resources.get(id);
    if (!resource) throw new Error('Resource not found');
    
    const voteKey = `resource:${id}:user:${userId}`;
    const existingVote = this.userVotes.get(voteKey);
    
    // Toggle vote
    if (existingVote === vote) {
      resource.votes += (vote === 'up' ? -1 : 1);
      this.userVotes.delete(voteKey);
    } else if (existingVote) {
      // Change vote
      resource.votes += (vote === 'up' ? 2 : -2);
      this.userVotes.set(voteKey, vote);
    } else {
      // New vote
      resource.votes += (vote === 'up' ? 1 : -1);
      this.userVotes.set(voteKey, vote);
    }
    
    this.resources.set(id, resource);
    return resource;
  }
  
  // Helper to seed initial resources
  // Newsletter operations
  async addNewsletterSubscriber(email: string): Promise<boolean> {
    // Normalize email (lowercase)
    const normalizedEmail = email.toLowerCase();
    
    // Don't add duplicates
    if (this.newsletterSubscribers.has(normalizedEmail)) {
      return false;
    }
    
    this.newsletterSubscribers.add(normalizedEmail);
    return true;
  }
  
  async getNewsletterSubscribers(): Promise<string[]> {
    return Array.from(this.newsletterSubscribers);
  }
  
  private seedResources() {
    const resources: InsertResource[] = [
      {
        title: "Bulletproof Contract Template",
        category: "contracts",
        markdown: "# Bulletproof Contract Template\n\nThis contract is designed to protect freelancers from scope creep, payment issues, and intellectual property disputes.",
        downloadUrl: "/downloads/bulletproof-contract.pdf",
      },
      {
        title: "Real Price Calculator",
        category: "pricing",
        markdown: "# Real Price Calculator\n\nCalculate what you should actually charge based on your experience, market rates, and client difficulty.",
        downloadUrl: "/downloads/price-calculator.xlsx",
      },
      {
        title: "Email Response Templates",
        category: "communication",
        markdown: "# Email Response Templates\n\nProfessional templates for handling difficult clients, late payments, and scope creep.",
        downloadUrl: "/downloads/email-templates.docx",
      }
    ];
    
    resources.forEach(resource => {
      const id = this.resourceId++;
      const now = new Date();
      this.resources.set(id, {
        ...resource,
        id,
        votes: 0,
        createdAt: now
      });
    });
  }
}

export const storage = new MemStorage();
