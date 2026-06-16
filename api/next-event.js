// api/next-event.js
// Place this file at the ROOT of your GitHub repo as: api/next-event.js
// Required Vercel environment variables:
//   EVENTBRITE_ORG_ID   — the number from your organiser URL (e.g. 121415841873)
//   EVENTBRITE_TOKEN    — your private API token from Eventbrite

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ORG_ID = process.env.EVENTBRITE_ORG_ID;
  const TOKEN  = process.env.EVENTBRITE_TOKEN;

  // ── Validate env vars ──
  if (!ORG_ID || !TOKEN) {
    console.error('[next-event] Missing env vars. ORG_ID:', !!ORG_ID, 'TOKEN:', !!TOKEN);
    return res.status(500).json({
      error: 'Missing Eventbrite environment variables.',
      debug: { hasOrgId: !!ORG_ID, hasToken: !!TOKEN }
    });
  }

  try {
    // Fetch all live/published events for the organiser, soonest first
    const url = new URL(`https://www.eventbriteapi.com/v3/organizers/${ORG_ID}/events/`);
    url.searchParams.set('status',      'live');        // only published events
    url.searchParams.set('order_by',    'start_asc');   // soonest first
    url.searchParams.set('time_filter', 'current_future'); // exclude past events
    url.searchParams.set('expand',      'logo');        // include event image
    url.searchParams.set('page_size',   '10');

    console.log('[next-event] Fetching:', url.toString());

    const ebRes = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
      },
    });

    const raw = await ebRes.text();
    console.log('[next-event] Eventbrite status:', ebRes.status);

    if (!ebRes.ok) {
      console.error('[next-event] Eventbrite error body:', raw);
      return res.status(ebRes.status).json({
        error: `Eventbrite API error (${ebRes.status})`,
        detail: raw.slice(0, 300), // first 300 chars of error for debugging
      });
    }

    const data = JSON.parse(raw);
    const events = data.events || [];
    console.log('[next-event] Total events returned:', events.length);

    if (events.length === 0) {
      // Also try without time_filter in case of timezone issues
      const url2 = new URL(`https://www.eventbriteapi.com/v3/organizers/${ORG_ID}/events/`);
      url2.searchParams.set('status',    'live');
      url2.searchParams.set('order_by',  'start_asc');
      url2.searchParams.set('expand',    'logo');
      url2.searchParams.set('page_size', '5');

      const ebRes2 = await fetch(url2.toString(), {
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' },
      });
      const data2 = await ebRes2.json();
      const allEvents = data2.events || [];
      console.log('[next-event] Fallback fetch (no time filter) returned:', allEvents.length, 'events');

      if (allEvents.length === 0) {
        return res.status(200).json({ event: null, debug: { message: 'No live events found for this organiser' } });
      }

      // Return the first one even if it might be in the past (for debugging)
      const e = allEvents[0];
      console.log('[next-event] First event (fallback):', e.name?.text, e.start?.local);
      return res.status(200).json({ event: shapeEvent(e) });
    }

    const e = events[0];
    console.log('[next-event] Returning event:', e.name?.text, 'starts:', e.start?.local);
    return res.status(200).json({ event: shapeEvent(e) });

  } catch (err) {
    console.error('[next-event] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function shapeEvent(e) {
  return {
    id:       e.id,
    title:    e.name?.text    || 'Upcoming Event',
    url:      e.url,
    start:    e.start?.local  || null,
    end:      e.end?.local    || null,
    timezone: e.start?.timezone || null,
    imageUrl: e.logo?.original?.url || e.logo?.url || null,
  };
}
