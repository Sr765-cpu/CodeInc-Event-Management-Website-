import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { getIO } from '../socket.js';
import { handleIncomingAIMessage } from '../utils/ai.js';

const prisma = new PrismaClient();
const router = express.Router();

// Get messages for a room
// - Public read for non-DM, non-private-AI rooms (e.g. "general", "ai-assistant")
// - Authenticated and authorized for direct-message rooms (dm:userA:userB) and private AI rooms (ai:userId)
router.get('/messages', optionalAuth, async (req, res) => {
  try {
    const roomRaw = req.query.room || 'general';
    const room = roomRaw.toString();

    if (!room || room.length > 200) {
      return res.status(400).json({ message: 'Invalid room identifier' });
    }

    const isDmRoom = room.startsWith('dm:');
    if (isDmRoom) {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required for direct messages' });
      }

      const parts = room.split(':');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        return res.status(400).json({ message: 'Invalid direct message room' });
      }

      const [, userA, userB] = parts;
      const viewerId = req.user.id;

      if (viewerId !== userA && viewerId !== userB) {
        return res.status(403).json({ message: 'Not allowed to access this conversation' });
      }
    }

    if (room.startsWith('ai:')) {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required for AI assistant' });
      }
      const targetUserId = room.replace('ai:', '');
      if (req.user.id !== targetUserId && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not allowed to access this conversation' });
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: { room },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json({ messages });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ message: 'Failed to load chat messages' });
  }
});

// Post a new message (authenticated)
router.post('/messages', authenticate, async (req, res) => {
  try {
    const { content, room } = req.body || {};
    const trimmed = (content || '').toString().trim();

    if (!trimmed) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (trimmed.length > 2000) {
      return res.status(400).json({ message: 'Message is too long' });
    }

    const roomName = (room || 'general').toString();

    if (!roomName || roomName.length > 200) {
      return res.status(400).json({ message: 'Invalid room identifier' });
    }

    const isDmRoom = roomName.startsWith('dm:');
    if (isDmRoom) {
      const parts = roomName.split(':');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        return res.status(400).json({ message: 'Invalid direct message room' });
      }

      const [, userA, userB] = parts;
      const senderId = req.user.id;

      if (senderId !== userA && senderId !== userB) {
        return res.status(403).json({ message: 'Not allowed to send messages to this conversation' });
      }
    }

    if (roomName.startsWith('ai:')) {
      const targetUserId = roomName.replace('ai:', '');
      if (req.user.id !== targetUserId && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not allowed to send messages to this AI conversation' });
      }
    }

    const created = await prisma.chatMessage.create({
      data: {
        senderId: req.user.id,
        room: roomName,
        content: trimmed,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Broadcast to room via Socket.IO if available
    const io = getIO();
    try {
      if (io) {
        io.to(roomName).emit('chat:message', created);
      }
    } catch (err) {
      console.error('Socket broadcast error (message):', err);
    }

    // Trigger AI response asynchronously if in AI room or mentions AI
    handleIncomingAIMessage({
      prisma,
      io,
      user: req.user,
      room: roomName,
      content: trimmed,
    }).catch((err) => {
      console.error('Error handling AI response:', err);
    });

    res.status(201).json({ message: created });
  } catch (error) {
    console.error('Create chat message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// List users available for chat (authenticated)
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        email: { not: 'ai@eventnest.internal' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ users });
  } catch (error) {
    console.error('Get chat users error:', error);
    res.status(500).json({ message: 'Failed to load chat users' });
  }
});

// Clear all messages for a room/conversation (authenticated)
// For DM rooms, only participants may clear the conversation.
router.delete('/messages', authenticate, async (req, res) => {
  try {
    const roomRaw = req.query.room || 'general';
    const room = roomRaw.toString();

    if (!room || room.length > 200) {
      return res.status(400).json({ message: 'Invalid room identifier' });
    }

    const isDmRoom = room.startsWith('dm:');
    if (isDmRoom) {
      const parts = room.split(':');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        return res.status(400).json({ message: 'Invalid direct message room' });
      }

      const [, userA, userB] = parts;
      const actorId = req.user.id;

      if (actorId !== userA && actorId !== userB) {
        return res.status(403).json({ message: 'Not allowed to clear this conversation' });
      }
    }

    if (room.startsWith('ai:')) {
      const targetUserId = room.replace('ai:', '');
      if (req.user.id !== targetUserId && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not allowed to clear this conversation' });
      }
    }

    await prisma.chatMessage.deleteMany({ where: { room } });

    // Notify clients that this room has been cleared
    try {
      const io = getIO();
      if (io) {
        io.to(room).emit('chat:cleared', { room });
      }
    } catch (err) {
      console.error('Socket broadcast error (clear):', err);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Clear chat messages error:', error);
    res.status(500).json({ message: 'Failed to clear messages' });
  }
});

export default router;
