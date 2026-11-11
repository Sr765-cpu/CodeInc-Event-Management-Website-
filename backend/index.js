import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Import routes and middleware
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import { initSocket } from './socket.js';
import { authenticate, optionalAuth, authorize, generateToken, generateRefreshToken } from './middleware/auth.js';
import { eventValidation, rsvpValidation, volunteerValidation, validate } from './utils/validation.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
const prisma = new PrismaClient();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // limit each IP to 10 auth requests per windowMs (increased for testing)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Event Management API Server',
    status: 'running',
    endpoints: {
      health: '/api/health',
      events: '/api/events',
      templates: '/api/templates',
      volunteers: '/api/volunteers'
    }
  });
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// ===== Events CRUD (file-based storage for now) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const eventsFile = path.join(__dirname, 'data', 'events.json');
const templatesFile = path.join(__dirname, 'data', 'templates.json');

async function readEvents(){
  try { const txt = await readFile(eventsFile, 'utf-8'); return JSON.parse(txt||'[]'); } catch { return []; }
}
async function writeEvents(list){ await writeFile(eventsFile, JSON.stringify(list, null, 2)); }
// Get all events
app.get('/api/events', async (req, res) => {
  try{
    const list = await prisma.event.findMany({ include: { rsvps: true, volunteers: true } });
    res.json({ events: list });
  }catch(e){ console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// Create event
app.post('/api/events', async (req, res) => {
  try{
    const { title, category, organizer, city, start, end, banner, desc, ongoing } = req.body||{};
    if(!title||!category||!organizer||!city||!start||!end||!desc){
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const created = await prisma.event.create({
      data: {
        title,
        category,
        organizer,
        city,
        start,
        end,
        banner: banner||'',
        desc,
        ongoing: Boolean(ongoing),
      }
    });
    res.status(201).json({ event: created });
  }catch(e){ console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// Update event
app.put('/api/events/:id', async (req, res) => {
  try{
    const { id } = req.params;
    const updated = await prisma.event.update({ where: { id }, data: { ...req.body } });
    res.json({ event: updated });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// RSVP to event (with optional authentication)
app.post('/api/events/:id/rsvp', optionalAuth, rsvpValidation, validate, async (req, res) => {
  try{
    const { id } = req.params;
    const { name, email, message, ticketType, preferences } = req.body || {};
    
    // Check if event exists
    const event = await prisma.event.findUnique({ where: { id } });
    if(!event) return res.status(404).json({ message: 'Event not found' });
    
    // Check for duplicate RSVP
    const existingRsvp = await prisma.rSVP.findUnique({
      where: { eventId_email: { eventId: id, email } }
    });
    
    if(existingRsvp) {
      return res.status(409).json({ message: 'You have already RSVP\'d to this event' });
    }
    
    // Create RSVP with optional user link
    const created = await prisma.rSVP.create({
      data: {
        eventId: id,
        userId: req.user?.id || null,
        name,
        email,
        message: message || '',
        ticketType: ticketType || 'General',
        preferences: preferences || null,
        status: 'confirmed'
      }
    });
    
    res.status(201).json({
      message: 'RSVP successful',
      rsvp: created
    });
  }catch(e){
    console.error('RSVP error:', e);
    if(e.code === 'P2002') {
      return res.status(409).json({ message: 'You have already RSVP\'d to this event' });
    }
    res.status(500).json({ message:'Server error' });
  }
});

// Get attendees for a specific event (organizer only)
app.get('/api/events/:id/attendees', authenticate, authorize('user'), async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const rsvps = await prisma.rSVP.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      event: {
        id: event.id,
        title: event.title,
        category: event.category,
        city: event.city,
        start: event.start,
        end: event.end,
      },
      attendees: rsvps,
    });
  } catch (e) {
    console.error('Get attendees error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check-in attendee for an event (organizer only)
app.post('/api/events/:id/checkin', authenticate, authorize('user'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rsvpId, email, method } = req.body || {};

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    let rsvp = null;
    if (rsvpId) {
      rsvp = await prisma.rSVP.findUnique({ where: { id: rsvpId } });
      if (rsvp && rsvp.eventId !== id) {
        rsvp = null;
      }
    } else if (email) {
      rsvp = await prisma.rSVP.findUnique({
        where: { eventId_email: { eventId: id, email } },
      });
    }

    if (!rsvp) {
      return res.status(404).json({ message: 'RSVP not found for this event' });
    }

    const updated = await prisma.rSVP.update({
      where: { id: rsvp.id },
      data: {
        status: 'checked_in',
        checkInAt: new Date(),
        checkOutAt: null,
        checkInMethod: method || 'manual',
      },
    });

    res.json({ attendee: updated });
  } catch (e) {
    console.error('Check-in error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check-out attendee for an event (organizer only)
app.post('/api/events/:id/checkout', authenticate, authorize('user'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rsvpId, email } = req.body || {};

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    let rsvp = null;
    if (rsvpId) {
      rsvp = await prisma.rSVP.findUnique({ where: { id: rsvpId } });
      if (rsvp && rsvp.eventId !== id) {
        rsvp = null;
      }
    } else if (email) {
      rsvp = await prisma.rSVP.findUnique({
        where: { eventId_email: { eventId: id, email } },
      });
    }

    if (!rsvp) {
      return res.status(404).json({ message: 'RSVP not found for this event' });
    }

    const updated = await prisma.rSVP.update({
      where: { id: rsvp.id },
      data: {
        status: 'checked_out',
        checkOutAt: new Date(),
      },
    });

    res.json({ attendee: updated });
  } catch (e) {
    console.error('Check-out error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Volunteer for event
app.post('/api/events/:id/volunteer', async (req, res) => {
  try{
    const { id } = req.params;
    const { name, email, message, speciality, phone, availableDates, status } = req.body || {};
    if(!name || !email){ return res.status(400).json({ message: 'Missing name or email' }); }
    const existing = await prisma.event.findUnique({ where: { id } });
    if(!existing) return res.status(404).json({ message: 'Event not found' });
    const created = await prisma.volunteer.create({
      data: {
        eventId: id,
        name,
        email,
        message: message||'',
        speciality: speciality||'',
        phone: phone||'',
        availableDates: availableDates||'',
        status: status||'Available'
      }
    });
    res.status(201).json({ volunteer: created });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Delete event
app.delete('/api/events/:id', async (req, res) => {
  try{
    const { id } = req.params;
    await prisma.event.delete({ where: { id } });
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});




// ===== Templates CRUD & Engagement =====
// Get all templates (exclude soft-deleted by default)
app.get('/api/templates', async (req, res) => {
  try{
    const includeDeleted = String(req.query.includeDeleted||'false') === 'true';
    const list = await prisma.template.findMany({ include: { comments: true, versions: true } });
    const filtered = includeDeleted ? list : list.filter(t=>!t.deletedAt);
    res.json({ templates: filtered });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Create template
app.post('/api/templates', async (req, res) => {
  try{
    const { title, description, datetime, location, images, agenda, organizer, category } = req.body||{};
    if(!title || !description || !datetime || !location || !organizer || !category){
      return res.status(400).json({ message: 'Missing required fields' }); }
    const created = await prisma.template.create({
      data: {
        title,
        description,
        datetime,
        location,
        images: Array.isArray(images) ? images : (images ? [images] : []),
        agenda: agenda || '',
        organizer,
        category,
        likes: 0,
      }
    });
    res.status(201).json({ template: created });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Update template (append previous version into versions)
app.put('/api/templates/:id', async (req, res) => {
  try{
    const { id } = req.params;
    const existing = await prisma.template.findUnique({ where: { id } });
    if(!existing) return res.status(404).json({ message: 'Not found' });
    await prisma.templateVersion.create({ data: { templateId: id, snapshot: existing, } });
    const fields = (({ title, description, datetime, location, images, agenda, organizer, category, deletedAt }) => ({ title, description, datetime, location, images, agenda, organizer, category, deletedAt }))(req.body||{});
    const updated = await prisma.template.update({ where: { id }, data: { ...Object.fromEntries(Object.entries(fields).filter(([,v]) => v!==undefined)) } });
    res.json({ template: updated });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Soft delete template
app.delete('/api/templates/:id', async (req, res) => {
  try{
    const { id } = req.params;
    const existing = await prisma.template.findUnique({ where: { id } });
    if(!existing) return res.status(404).json({ message: 'Not found' });
    await prisma.template.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Restore soft-deleted template
app.post('/api/templates/:id/restore', async (req, res) => {
  try{
    const { id } = req.params;
    const updated = await prisma.template.update({ where: { id }, data: { deletedAt: null } });
    res.json({ template: updated });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Like template (increment)
app.post('/api/templates/:id/like', async (req, res) => {
  try{
    const { id } = req.params;
    const updated = await prisma.template.update({ where: { id }, data: { likes: { increment: 1 } } });
    res.json({ likes: updated.likes });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Comment on template
app.post('/api/templates/:id/comment', async (req, res) => {
  try{
    const { id } = req.params;
    const { author, text } = req.body || {};
    if(!text){ return res.status(400).json({ message:'Missing text' }); }
    const created = await prisma.templateComment.create({ data: { templateId: id, author: author || 'Anonymous', text } });
    res.status(201).json({ comment: created });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Clone/Remix template
app.post('/api/templates/:id/clone', async (req, res) => {
  try{
    const { id } = req.params;
    const src = await prisma.template.findUnique({ where: { id } });
    if(!src) return res.status(404).json({ message:'Not found' });
    const copy = await prisma.template.create({
      data: {
        title: `${src.title} (Remix)`,
        description: src.description,
        datetime: src.datetime,
        location: src.location,
        images: src.images,
        agenda: src.agenda,
        organizer: src.organizer,
        category: src.category,
        likes: 0,
      }
    });
    res.status(201).json({ template: copy });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// Aggregate volunteers across events
app.get('/api/volunteers', async (req, res) => {
  try{
    const [events, volunteers] = await Promise.all([
      prisma.event.findMany(),
      prisma.volunteer.findMany({ include: { event: true } })
    ]);
    const now = new Date();
    const upcomingCount = events.filter(ev => new Date(ev.start || ev.end || now) > now).length;
    const vols = volunteers.map(v => ({
      id: v.id,
      name: v.name,
      email: v.email,
      message: v.message||'',
      createdAt: v.createdAt,
      speciality: v.speciality||'',
      phone: v.phone||'',
      availableDates: v.availableDates||'',
      status: v.status||'Available',
      eventId: v.eventId,
      eventTitle: v.event?.title || '',
      eventDate: v.event?.start || '',
      eventCity: v.event?.city || ''
    }));
    res.json({
      volunteers: vols,
      stats: {
        totalVolunteers: vols.length,
        availableVolunteers: vols.filter(v=>String(v.status||'').toLowerCase()==='available').length,
        totalEvents: events.length,
      }
    });
  }catch(e){ console.error(e); res.status(500).json({ message:'Server error' }); }
});

// ===== Ticket & Resource Booking APIs =====

// Create a resource booking (from ticket-booking.html resource form)
app.post('/api/bookings/resources', async (req, res) => {
  try {
    const {
      resourceType,
      quantity,
      date,
      startTime,
      endTime,
      duration,
      purpose,
      contactName,
      contactEmail,
      contactPhone,
      specialReq,
    } = req.body || {};

    if (!resourceType || !date || !startTime || !endTime || !purpose || !contactName || !contactEmail) {
      return res.status(400).json({ message: 'Missing required fields for resource booking' });
    }

    const created = await prisma.resourceBooking.create({
      data: {
        resourceType,
        quantity: typeof quantity === 'number' ? quantity : quantity ? Number(quantity) || null : null,
        date,
        startTime,
        endTime,
        duration: duration || null,
        purpose,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        specialReq: specialReq || null,
      },
    });

    res.status(201).json({ booking: created });
  } catch (e) {
    console.error('Resource booking error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// List resource bookings (simple admin/debug endpoint)
app.get('/api/bookings/resources', async (req, res) => {
  try {
    const list = await prisma.resourceBooking.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings: list });
  } catch (e) {
    console.error('List resource bookings error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a ticket configuration (ticket details form)
app.post('/api/bookings/tickets', async (req, res) => {
  try {
    const { ticketType, ticketPrice, ticketQty, ticketRelease, ticketNotes } = req.body || {};

    if (!ticketType) {
      return res.status(400).json({ message: 'Ticket type is required' });
    }

    const created = await prisma.ticketConfig.create({
      data: {
        ticketType,
        price: typeof ticketPrice === 'number' ? ticketPrice : ticketPrice ? Number(ticketPrice) || null : null,
        quantity: typeof ticketQty === 'number' ? ticketQty : ticketQty ? Number(ticketQty) || null : null,
        releaseDate: ticketRelease || null,
        notes: ticketNotes || null,
      },
    });

    res.status(201).json({ ticket: created });
  } catch (e) {
    console.error('Ticket config error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// List ticket configurations
app.get('/api/bookings/tickets', async (req, res) => {
  try {
    const list = await prisma.ticketConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tickets: list });
  } catch (e) {
    console.error('List ticket configs error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Gallery items APIs
app.get('/api/gallery', async (req, res) => {
  try {
    const items = await prisma.galleryItem.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) {
    console.error('List gallery items error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/gallery', async (req, res) => {
  try {
    const { event, image, description, author } = req.body || {};

    if (!event || !image || !description) {
      return res.status(400).json({ message: 'Event, image, and description are required' });
    }

    const created = await prisma.galleryItem.create({
      data: {
        event,
        image,
        description,
        author: author || null,
      },
    });

    res.status(201).json({ item: created });
  } catch (e) {
    console.error('Create gallery item error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// General volunteer registration (not tied to a specific event on the frontend)
app.post('/api/volunteers', volunteerValidation, validate, async (req, res) => {
  try {
    const { name, email, phone, speciality, availableDates, message, status, eventId } = req.body || {};

    let finalEventId = eventId || null;

    // If an explicit eventId is provided, verify it exists
    if (finalEventId) {
      const existingEvent = await prisma.event.findUnique({ where: { id: finalEventId } });
      if (!existingEvent) {
        finalEventId = null;
      }
    }

    // If no valid eventId, attach to a special "General Volunteer Pool" event
    if (!finalEventId) {
      const poolTitle = 'General Volunteer Pool';
      let pool = await prisma.event.findFirst({ where: { title: poolTitle } });
      if (!pool) {
        const nowIso = new Date().toISOString();
        pool = await prisma.event.create({
          data: {
            title: poolTitle,
            category: 'Volunteer',
            organizer: 'System',
            city: 'Global',
            start: nowIso,
            end: nowIso,
            banner: '',
            desc: 'Container event for general volunteers not tied to a specific event',
            ongoing: true,
          }
        });
      }
      finalEventId = pool.id;
    }

    const created = await prisma.volunteer.create({
      data: {
        eventId: finalEventId,
        name,
        email,
        phone,
        speciality,
        availableDates,
        message: message || '',
        status: status || 'Available',
      }
    });

    res.status(201).json({ volunteer: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Switch role (create or fetch account in the other role)
// body: { email, password, fromRole, toRole, name?, address? }
app.post('/api/auth/switch-role', async (req, res) => {
  try {
    const { email, password, fromRole, toRole, name, address } = req.body || {};
    if (!email || !password || !fromRole || !toRole) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (fromRole === toRole) return res.status(400).json({ message: 'fromRole and toRole must differ' });

    const current = await prisma.user.findUnique({ where: { email_role: { email, role: fromRole } } });
    if (!current) return res.status(404).json({ message: 'Current role account not found' });

    const ok = await bcrypt.compare(String(password), current.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    let targetUser = await prisma.user.findUnique({ where: { email_role: { email, role: toRole } } });
    let statusCode = 200;

    if (!targetUser) {
      targetUser = await prisma.user.create({
        data: {
          role: toRole,
          email,
          name: name || current.name,
          address: address || current.address,
          passwordHash: current.passwordHash,
          isActive: true,
          lastLogin: new Date()
        },
      });
      statusCode = 201;
    }

    const token = generateToken(targetUser.id, targetUser.email, targetUser.role);
    const refreshToken = generateRefreshToken(targetUser.id);

    await prisma.session.create({
      data: {
        userId: targetUser.id,
        token,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown'
      }
    });

    const { passwordHash: _, ...safeUser } = targetUser;
    return res.status(statusCode).json({ user: safeUser, token, refreshToken });
  } catch (e) {
    console.error('Switch role error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get user's RSVPs
app.get('/api/users/me/rsvps', authenticate, async (req, res) => {
  try {
    const rsvps = await prisma.rSVP.findMany({
      where: { userId: req.user.id },
      include: { event: true },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ rsvps });
  } catch (error) {
    console.error('Get user RSVPs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel user's RSVP
app.delete('/api/users/me/rsvps/:rsvpId', authenticate, async (req, res) => {
  try {
    const { rsvpId } = req.params;
    
    const rsvp = await prisma.rSVP.findUnique({
      where: { id: rsvpId }
    });
    
    if (!rsvp) {
      return res.status(404).json({ message: 'RSVP not found' });
    }
    
    if (rsvp.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    await prisma.rSVP.update({
      where: { id: rsvpId },
      data: { status: 'cancelled' }
    });
    
    res.json({ message: 'RSVP cancelled successfully' });
  } catch (error) {
    console.error('Cancel RSVP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Only listen when running locally (not on Vercel serverless)
if (!process.env.VERCEL) {
  const server = http.createServer(app);

  // Initialize Socket.IO for real-time chat
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

export default app;

// ===== Dashboard metrics endpoints =====

// Aggregate KPIs from real MongoDB data
app.get('/api/dashboard/kpis', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [events, registrations, ticketConfigs, totalMessages, messagesToday] = await Promise.all([
      prisma.event.findMany(),
      prisma.rSVP.count(),
      prisma.ticketConfig.findMany(),
      prisma.chatMessage.count(),
      prisma.chatMessage.count({
        where: {
          createdAt: {
            gte: startOfDay,
          },
        },
      }),
    ]);

    let upcoming = 0;
    const nowMs = now.getTime();
    events.forEach((ev) => {
      if (!ev.start) return;
      const d = new Date(ev.start);
      if (!Number.isNaN(d.getTime()) && d.getTime() >= nowMs) {
        upcoming += 1;
      }
    });

    let revenue = 0;
    ticketConfigs.forEach((cfg) => {
      const price = typeof cfg.price === 'number' ? cfg.price : 0;
      const qty = typeof cfg.quantity === 'number' ? cfg.quantity : 0;
      revenue += price * qty;
    });

    res.json({
      totals: {
        events: events.length,
        registrations,
        revenue: Math.round(revenue),
        upcoming,
      },
      chat: {
        totalMessages,
        messagesToday,
      },
    });
  } catch (e) {
    console.error('Dashboard KPIs error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Keep simple mock endpoints for activities/alerts/performance charts for now
const __dashMock = {
  activities: [
    { type: 'Event', title: 'Cleanup Drive created', time: '2m ago' },
    { type: 'Reg', title: 'New registration: Maya', time: '6m ago' },
    { type: 'Msg', title: 'Vendor confirmed AV setup', time: '14m ago' }
  ],
  alerts: [
    { level: 'warning', msg: 'Payment gateway latency increased' },
    { level: 'info', msg: '3 new registrations' }
  ],
  performance: { series: [10, 12, 11, 13, 15, 14, 18] },
  registrations: [
    { id: 1, eventId: 1, name: 'Maya' },
    { id: 2, eventId: 1, name: 'Rahul' }
  ],
};

app.get('/api/activities', (req, res) => {
  res.json({ items: __dashMock.activities });
});
app.get('/api/alerts', (req, res) => {
  res.json({ items: __dashMock.alerts });
});
app.get('/api/analytics/performance', (req, res) => {
  res.json(__dashMock.performance);
});
app.get('/api/registrations', (req, res) => {
  res.json({ items: __dashMock.registrations });
});