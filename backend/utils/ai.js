/**
 * EventNest AI Engine
 * Provides intelligent event discovery, ticketing guidance, volunteer coordination,
 * and event planning support with live MongoDB integration.
 */

let cachedAIUser = null;

/**
 * Ensures a system user exists in MongoDB for EventNest AI to satisfy
 * foreign key constraints on ChatMessage (senderId -> User.id).
 */
export async function getOrCreateAIUser(prisma) {
  if (cachedAIUser) {
    return cachedAIUser;
  }

  try {
    let aiUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'ai@eventnest.internal' },
          { name: 'EventNest AI' },
        ],
      },
    });

    if (!aiUser) {
      aiUser = await prisma.user.create({
        data: {
          name: 'EventNest AI',
          email: 'ai@eventnest.internal',
          role: 'admin',
          passwordHash: '$2b$10$eX4mpleAIH4shNotForLoginDoNotUseSystemUser999',
          isActive: true,
          bio: 'Intelligent AI Concierge for EventNest. Here to assist with events, tickets, and planning.',
        },
      });
      console.log('Created EventNest AI system user in MongoDB:', aiUser.id);
    }

    cachedAIUser = aiUser;
    return aiUser;
  } catch (err) {
    console.error('Failed to get/create EventNest AI user:', err);
    throw err;
  }
}

/**
 * Fetches live context from MongoDB: events, tickets, volunteers, and templates.
 */
async function fetchLiveContext(prisma) {
  try {
    const [events, tickets, volunteers, templates] = await Promise.all([
      prisma.event.findMany({
        take: 15,
        orderBy: { start: 'asc' },
        include: {
          rsvps: {
            select: { id: true, status: true, ticketType: true },
          },
          volunteers: {
            select: { id: true, name: true, speciality: true, status: true },
          },
        },
      }).catch(() => []),
      prisma.ticketConfig.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
      prisma.volunteer.findMany({
        take: 10,
        include: {
          event: { select: { title: true, city: true } },
        },
      }).catch(() => []),
      prisma.template.findMany({
        where: { deletedAt: null },
        take: 8,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ]);

    return { events, tickets, volunteers, templates };
  } catch (err) {
    console.error('Error fetching live AI context:', err);
    return { events: [], tickets: [], volunteers: [], templates: [] };
  }
}

/**
 * Attempts to generate a response via Gemini API if GEMINI_API_KEY is configured.
 */
async function callGeminiIfAvailable(prompt, context, user) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const systemInstruction = `You are EventNest AI, the intelligent, friendly, and proactive assistant for EventNest (by CodeInc).
You assist users with:
1. Finding and exploring upcoming events across cities and categories.
2. Answering questions about tickets, prices, passes, and RSVP registration.
3. Guiding volunteers on opportunities, requirements, and how to apply.
4. Providing expert event management tips, templates, checklists, and budgeting advice.

Here is the live real-time database state from MongoDB:
- Current Events (${context.events.length} loaded):
${context.events.map((e) => `  * "${e.title}" | Category: ${e.category} | City: ${e.city} | Start: ${e.start} | End: ${e.end} | RSVPs: ${e.rsvps?.length || 0} | Description: ${e.desc || 'N/A'}`).join('\n')}

- Ticket Tiers:
${context.tickets.map((t) => `  * Tier: ${t.ticketType} | Price: ${t.price != null ? '₹' + t.price : 'Free'} | Qty: ${t.quantity || 'Open'} | Notes: ${t.notes || 'None'}`).join('\n')}

- Active Volunteer Roles:
${context.volunteers.map((v) => `  * Volunteer: ${v.name} | Role/Speciality: ${v.speciality || 'General'} | Event: ${v.event?.title || 'General'}`).join('\n')}

- Templates Available:
${context.templates.map((t) => `  * "${t.title}" (${t.category}) in ${t.location}`).join('\n')}

Current User: ${user?.name || 'Guest'} (${user?.email || 'unauthenticated'}, Role: ${user?.role || 'user'}).

Instructions:
- Use emojis, clean bullet points, and bold text for readability.
- Keep answers concise, actionable, and warm.
- Refer users to navigation links (e.g. Events page, Volunteers page, Dashboard, Templates) when relevant.
- Never hallucinate nonexistent events; rely on the real database context when asked about specific schedules.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nUser Question: ${prompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidate && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch (err) {
    console.warn('Gemini API call failed or timed out, falling back to local engine:', err.message);
  }

  return null;
}

/**
 * Built-in intelligent rule & intent matching engine.
 * Ensures 100% reliable responses based on live database state.
 */
function generateLocalAIResponse(prompt, context, user) {
  const p = (prompt || '').toLowerCase().trim();
  const userName = user?.name ? user.name.split(' ')[0] : 'friend';

  // 1. Greetings & Help
  if (
    /^(hi|hello|hey|greetings|hola|namaste|yo|start|help|who are you|what can you do)/i.test(p) ||
    p === '?' ||
    p === 'menu'
  ) {
    const eventCount = context.events.length;
    return `👋 **Hello ${userName}! I'm EventNest AI**, your personal event and planning concierge.

Here is what I can assist you with:
- 📅 **Discover Events**: Ask *"What events are coming up?"*, *"Tech events"*, or *"Events in Pune"*. We currently have **${eventCount} active events**!
- 🎟️ **Tickets & Pricing**: Ask *"Show ticket prices"* or *"How do I register?"*.
- 🙋 **Volunteering**: Ask *"How can I volunteer?"* or *"What volunteer roles are available?"*.
- 📋 **Event Planning & Templates**: Ask *"Give me an event checklist"* or *"How to organize a hackathon"*.
- 📊 **Dashboard & Metrics**: Ask *"How do I view RSVPs?"* or *"Event analytics"*.

How can I help you today?`;
  }

  // 2. Ticket / Pricing queries
  if (
    p.includes('ticket') ||
    p.includes('price') ||
    p.includes('cost') ||
    p.includes('pass') ||
    p.includes('fee') ||
    p.includes('rate') ||
    p.includes('early bird') ||
    p.includes('vip')
  ) {
    if (context.tickets && context.tickets.length > 0) {
      const ticketList = context.tickets
        .map((t) => {
          const price = t.price != null ? `₹${t.price}` : 'Free';
          const qty = t.quantity ? `(${t.quantity} seats)` : '';
          const notes = t.notes ? `— *${t.notes}*` : '';
          return `• **${t.ticketType}**: **${price}** ${qty} ${notes}`;
        })
        .join('\n');

      return `🎟️ **Ticket Configurations & Pricing**

Here are the current ticket tiers configured in the system:
${ticketList}

💡 **How to Reserve:**
1. Head to the **[Events page](events.html)**.
2. Select your event and click **RSVP / Register**.
3. Choose your preferred pass tier and submit your registration!`;
    }

    return `🎟️ **Ticket Information**

Most community and meet-up events on EventNest offer **Free Admission**, while premium workshops and summits offer tiered passes (Early Bird, General Admission, and VIP Passes).

👉 You can view specific pricing by selecting any event on the **[Events page](events.html)** or configure new tiers on the Dashboard!`;
  }

  // 3. Volunteer Queries
  if (
    p.includes('volunteer') ||
    p.includes('role') ||
    p.includes('join team') ||
    p.includes('apply') ||
    p.includes('speciality') ||
    p.includes('volunteering')
  ) {
    const openRoles = [
      '• **Guest Reception & QR Check-in**: Greet guests, scan digital passes, and hand out badges.',
      '• **Technical & AV Support**: Manage microphones, projectors, sound mixers, and live streams.',
      '• **Event Coordination & Stage Flow**: Guide speakers, coordinate timers, and manage green rooms.',
      '• **Social Media & Photography**: Capture high-res photos, reel footage, and post live event updates.',
    ].join('\n');

    let volunteerStats = '';
    if (context.volunteers && context.volunteers.length > 0) {
      volunteerStats = `\n\n📌 Currently, we have **${context.volunteers.length} registered volunteers** across active events.`;
    }

    return `🙋 **Volunteer Opportunities with EventNest**

Volunteering is a great way to gain hands-on event leadership experience and network with industry leaders!

**Active Volunteer Tracks:**
${openRoles}${volunteerStats}

👉 **Ready to join?** Head to the **[Volunteers page](volunteers.html)** and submit your details!`;
  }

  // 4. Template & Event Planning Queries
  if (
    p.includes('template') ||
    p.includes('checklist') ||
    p.includes('plan') ||
    p.includes('organize') ||
    p.includes('budget') ||
    p.includes('sponsor') ||
    p.includes('promote')
  ) {
    let templateSection = '';
    if (context.templates && context.templates.length > 0) {
      const topTemplates = context.templates
        .slice(0, 4)
        .map((t) => `• **${t.title}** (${t.category}) — *${t.location}*`)
        .join('\n');
      templateSection = `\n\n📑 **Featured Templates Available:**\n${topTemplates}`;
    }

    return `💡 **Event Planning & Management Best Practices**

Planning an event on EventNest? Here is your step-by-step master checklist:

1. 🎯 **Define the Core Purpose**: Establish your theme, speaker lineup, and expected audience capacity.
2. 📅 **Lock Dates & Venue**: Book a venue early or set up your virtual streaming link.
3. 💰 **Budget & Sponsorship**: Allocate 40% to venue/catering, 25% to production/tech, 20% to marketing, and 15% for contingency.
4. 🚀 **Publish on EventNest**: Set up ticket tiers, descriptions, and banner images.
5. 📣 **Multi-Channel Promotion**: Share across WhatsApp, LinkedIn, Twitter, and email newsletters 3-4 weeks prior.
6. 🤝 **Mobilize Volunteers**: Assign roles 48 hours before kickoff and conduct a quick dry run.${templateSection}

👉 Visit **[Templates page](templates.html)** to clone an existing event layout with one click!`;
  }

  // 5. Specific City / Location Filter for Events
  const cities = ['pune', 'mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad', 'bhilai', 'chennai', 'kolkata'];
  const matchedCity = cities.find((city) => p.includes(city));

  if (matchedCity) {
    const cityEvents = context.events.filter(
      (e) => (e.city || '').toLowerCase().includes(matchedCity)
    );

    if (cityEvents.length > 0) {
      const list = cityEvents
        .map((e) => {
          const rsvpCount = e.rsvps?.length || 0;
          return `✨ **${e.title}** (${e.category})
  • 📅 **Date**: ${e.start} to ${e.end}
  • 📍 **Location**: ${e.city}
  • 👤 **Organizer**: ${e.organizer}
  • 👥 **Attendees**: ${rsvpCount} confirmed
  • 📝 *${e.desc || 'Join us for an exciting event!'}*`;
        })
        .join('\n\n');

      return `📍 **Events Found in ${matchedCity.toUpperCase()}:**\n\n${list}\n\n👉 *Visit [Events page](events.html) to reserve your pass!*`;
    } else {
      return `📍 **No direct events currently listed in ${matchedCity.toUpperCase()}.**

However, we have exciting events in other major hubs! Here are top upcoming events you might like:\n\n` +
        context.events.slice(0, 3).map((e) => `• **${e.title}** in *${e.city}* (${e.start})`).join('\n') +
        `\n\n👉 Want to host one in ${matchedCity}? Create an event directly from your **[Dashboard](dashboard2.html)**!`;
    }
  }

  // 6. Category Filter (Tech, Music, Networking, Social, etc.)
  const categories = ['tech', 'music', 'workshop', 'social', 'conference', 'hackathon', 'business'];
  const matchedCat = categories.find((cat) => p.includes(cat));

  if (matchedCat) {
    const catEvents = context.events.filter(
      (e) => (e.category || '').toLowerCase().includes(matchedCat)
    );

    if (catEvents.length > 0) {
      const list = catEvents
        .map((e) => {
          const rsvpCount = e.rsvps?.length || 0;
          return `✨ **${e.title}**
  • 📍 **City**: ${e.city}
  • 📅 **Date**: ${e.start}
  • 👤 **Organizer**: ${e.organizer}
  • 👥 **RSVPs**: ${rsvpCount}`;
        })
        .join('\n\n');

      return `🚀 **${matchedCat.toUpperCase()} Events on EventNest:**\n\n${list}\n\n👉 Explore and RSVP on the **[Events page](events.html)**!`;
    }
  }

  // 7. General Events List / Upcoming
  if (p.includes('event') || p.includes('upcoming') || p.includes('what is happening') || p.includes('schedule')) {
    if (context.events && context.events.length > 0) {
      const list = context.events
        .slice(0, 5)
        .map((e) => {
          const rsvpCount = e.rsvps?.length || 0;
          return `🗓️ **${e.title}**
  • **Category**: ${e.category} | **City**: ${e.city}
  • **Dates**: ${e.start} - ${e.end}
  • **RSVPs**: ${rsvpCount} registered`;
        })
        .join('\n\n');

      return `📅 **Upcoming Events on EventNest:**\n\n${list}\n\n👉 Want more details? Ask me about any specific event or city, or check the **[Events page](events.html)**!`;
    } else {
      return `📅 There are no scheduled events in the database right now. You can create your first event through the **[Dashboard](dashboard2.html)**!`;
    }
  }

  // 8. Dashboard & RSVP Management
  if (p.includes('dashboard') || p.includes('rsvp') || p.includes('status') || p.includes('metrics') || p.includes('stats')) {
    return `📊 **EventNest Dashboard & Analytics**

You can manage all your events in one central place:
- **Real-Time Attendance**: Live counter of confirmed RSVPs, checked-in attendees, and waitlists.
- **Resource Management**: Manage equipment, audio gear, and room reservations.
- **Volunteer Assignment**: Assign registered volunteers to specific events and shifts.

👉 Access your personal overview anytime at **[Dashboard](dashboard2.html)**!`;
  }

  // 9. Intelligent fallback
  return `🤖 I'm here to help with all things **EventNest**!

Here are a few popular questions you can ask me:
- 📅 *"Show upcoming tech events"*
- 📍 *"Are there any events in Pune or Mumbai?"*
- 🎟️ *"What are the ticket prices?"*
- 🙋 *"How can I register as a volunteer?"*
- 💡 *"Give me an event planning checklist"*

Feel free to ask me anything specific!`;
}

/**
 * Main AI generation entry point.
 */
export async function generateAIResponse(prompt, { prisma, user }) {
  // Strip trigger prefixes if present
  let cleanPrompt = prompt
    .replace(/^@ai\b/i, '')
    .replace(/^@bot\b/i, '')
    .replace(/^ai:\s*/i, '')
    .replace(/^ai,\s*/i, '')
    .trim();

  if (!cleanPrompt) {
    cleanPrompt = 'hello';
  }

  const context = await fetchLiveContext(prisma);

  // Try external LLM (Gemini) first if configured
  const geminiResult = await callGeminiIfAvailable(cleanPrompt, context, user);
  if (geminiResult) {
    return geminiResult;
  }

  // Deterministic live-database contextual responder
  return generateLocalAIResponse(cleanPrompt, context, user);
}

/**
 * Asynchronously processes an incoming user message and responds if AI is triggered.
 */
export async function handleIncomingAIMessage({ prisma, io, user, room, content }) {
  const isDedicatedAiRoom = room === 'ai-assistant' || room.startsWith('ai:');
  const hasAiMention = /(@ai\b|@bot\b|^ai[:, ]|\/ai\b)/i.test(content);

  if (!isDedicatedAiRoom && !hasAiMention) {
    return false;
  }

  // Emit typing indicator to room
  if (io) {
    try {
      io.to(room).emit('chat:typing', {
        user: 'EventNest AI',
        isTyping: true,
        room,
      });
    } catch (e) {
      console.error('Error emitting chat:typing:', e);
    }
  }

  // Slight natural processing delay (600ms)
  await new Promise((resolve) => setTimeout(resolve, 600));

  try {
    const aiUser = await getOrCreateAIUser(prisma);
    const replyText = await generateAIResponse(content, { prisma, user });

    const aiMessage = await prisma.chatMessage.create({
      data: {
        senderId: aiUser.id,
        room,
        content: replyText,
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

    // Clear typing indicator
    if (io) {
      try {
        io.to(room).emit('chat:typing', {
          user: 'EventNest AI',
          isTyping: false,
          room,
        });
        io.to(room).emit('chat:message', aiMessage);
      } catch (e) {
        console.error('Error broadcasting AI chat:message:', e);
      }
    }

    return true;
  } catch (err) {
    console.error('Error in handleIncomingAIMessage:', err);
    if (io) {
      try {
        io.to(room).emit('chat:typing', {
          user: 'EventNest AI',
          isTyping: false,
          room,
        });
      } catch (_) {}
    }
    return false;
  }
}

