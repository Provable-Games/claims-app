import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimiter = (maxRequests: number = 10, windowMs: number = 60000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    const record = requestCounts.get(ip);
    
    if (!record || record.resetTime < now) {
      requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    record.count++;
    next();
  };
};

// Middleware to prevent SQL injection by sanitizing wallet addresses
export const sanitizeWalletAddress = (req: Request, res: Response, next: NextFunction) => {
  const walletAddress = req.params.walletAddress || req.body.walletAddress;
  
  if (walletAddress) {
    // Remove any whitespace and convert to lowercase for consistent validation
    const cleanAddress = walletAddress.trim();
    
    // Validation for Ethereum (40 chars) and Starknet (up to 64 chars) addresses
    const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/i.test(cleanAddress);
    // Starknet addresses can have leading zeros removed, so accept 1-64 hex chars after 0x
    const isStarknetAddress = /^0x[a-fA-F0-9]{1,64}$/i.test(cleanAddress);
    
    if (!isEthereumAddress && !isStarknetAddress) {
      console.log('Address validation failed:', cleanAddress, 'Length:', cleanAddress.length);
      return res.status(400).json({ error: 'Invalid wallet address format. Expected Ethereum (42 chars) or Starknet (up to 66 chars) address' });
    }
  }
  
  next();
};

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (record.resetTime < now) {
      requestCounts.delete(ip);
    }
  }
}, 300000); // Clean up every 5 minutes