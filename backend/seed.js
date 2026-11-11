import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding sample data to MongoDB Atlas...');

  // 1. Create Sample Events if fewer than 4 events
  const existingEvents = await prisma.event.findMany();
  let events = existingEvents;

  if (existingEvents.length < 4) {
    console.log('Adding sample events...');
    const sampleEvents = [
      {
        title: 'Global Tech Innovation Summit 2026',
        category: 'tech',
        organizer: 'CodeInc Labs',
        city: 'Bengaluru',
        start: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        banner: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop',
        desc: 'Join 500+ developers, tech leaders, and innovators exploring AI, Web3, and scalable cloud systems.',
        ongoing: false
      },
      {
        title: 'EcoPulse Community Green Drive',
        category: 'environment',
        organizer: 'Green Earth Foundation',
        city: 'Pune',
        start: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        banner: 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1200&auto=format&fit=crop',
        desc: 'City-wide urban tree planting, e-waste collection, and solar energy awareness workshops.',
        ongoing: true
      },
      {
        title: 'Vibrant Harmony Music & Cultural Fest',
        category: 'festival',
        organizer: 'Cultural Arts Society',
        city: 'Mumbai',
        start: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        banner: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop',
        desc: 'A 2-day celebration featuring live indie bands, classical fusion performances, and regional food stalls.',
        ongoing: false
      },
      {
        title: 'Full-Stack Agentic AI Masterclass',
        category: 'workshop',
        organizer: 'CodeInc Academy',
        city: 'Bhilai',
        start: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
        banner: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=1200&auto=format&fit=crop',
        desc: 'Hands-on bootcamp on building production LLM apps, vector databases, and real-time agent swarms.',
        ongoing: false
      }
    ];

    for (const ev of sampleEvents) {
      await prisma.event.create({ data: ev });
    }
    events = await prisma.event.findMany();
  }

  // 2. Add Sample RSVPs / Attendees for the first event
  const primaryEvent = events[0];
  if (primaryEvent) {
    const existingRsvps = await prisma.rSVP.count({ where: { eventId: primaryEvent.id } });
    if (existingRsvps === 0) {
      console.log('Adding sample RSVPs/Attendees...');
      const sampleAttendees = [
        { name: 'Maya Sharma', email: 'maya.sharma@example.com', ticketType: 'VIP', status: 'checked_in', message: 'Looking forward to the keynote!' },
        { name: 'Rohan Verma', email: 'rohan.verma@example.com', ticketType: 'General', status: 'confirmed', message: 'Attending with my team.' },
        { name: 'Priya Patel', email: 'priya.patel@example.com', ticketType: 'Student', status: 'confirmed', message: 'Excited for hands-on sessions.' },
        { name: 'Alex Chen', email: 'alex.chen@example.com', ticketType: 'VIP', status: 'checked_in', message: 'Speaker in session 2.' },
        { name: 'Ananya Roy', email: 'ananya.roy@example.com', ticketType: 'General', status: 'confirmed', message: 'First time attendee!' }
      ];

      for (const att of sampleAttendees) {
        await prisma.rSVP.create({
          data: {
            eventId: primaryEvent.id,
            name: att.name,
            email: att.email,
            ticketType: att.ticketType,
            status: att.status,
            message: att.message,
            checkInAt: att.status === 'checked_in' ? new Date() : null,
            checkInMethod: att.status === 'checked_in' ? 'QR Scanner' : null
          }
        });
      }
    }
  }

  // 3. Add Sample Ticket Configs
  const existingTickets = await prisma.ticketConfig.count();
  if (existingTickets === 0) {
    console.log('Adding sample ticket configs...');
    await prisma.ticketConfig.createMany({
      data: [
        { ticketType: 'Early Bird Pass', price: 499, quantity: 100, releaseDate: '2026-11-01', notes: 'Limited discounted tickets' },
        { ticketType: 'Standard Admission', price: 999, quantity: 250, releaseDate: '2026-11-10', notes: 'Full access to all tracks' },
        { ticketType: 'VIP All-Access Pass', price: 2499, quantity: 50, releaseDate: '2026-11-15', notes: 'VIP seating, speaker dinner & swag kit' }
      ]
    });
  }

  // 4. Add Sample Volunteers
  const existingVols = await prisma.volunteer.count();
  if (existingVols < 3 && primaryEvent) {
    console.log('Adding sample volunteers...');
    await prisma.volunteer.createMany({
      data: [
        {
          eventId: primaryEvent.id,
          name: 'Kabir Khan',
          email: 'kabir.k@example.com',
          phone: '+91 9876543210',
          speciality: 'Technical Support & AV',
          availableDates: 'Weekends | Full Day',
          status: 'Available',
          message: 'Experience in managing stage audio and projector equipment.'
        },
        {
          eventId: primaryEvent.id,
          name: 'Simran Kaur',
          email: 'simran.kaur@example.com',
          phone: '+91 9123456780',
          speciality: 'Hospitality & Registration Desk',
          availableDates: 'All Days | Morning Shift',
          status: 'Assigned',
          message: 'Organized 3 college fests as head coordinator.'
        }
      ]
    });
  }

  console.log('Seeding complete! Dashboard and Events now have rich live data.');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

