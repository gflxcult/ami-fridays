// /api/next-event.js
// Vercel serverless function — proxies Eventbrite API to avoid CORS issues.
// Required environment variables (set in Vercel dashboard):
//   EVENTBRITE_ORGANIZER_ID     — your organiser ID
//   EVENTBRITE_TOKEN      — your private OAuth token

export default async function handler(req, res) {
  // Allow your site to call this endpoint
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { EVENTBRITE_ORG_ID, EVENTBRITE_TOKEN } = process.env;

  if (!EVENTBRITE_ORG_ID || !EVENTBRITE_TOKEN) {
    return res.status(500).json({ error: "Missing Eventbrite environment variables." });
  }

  try {
    // Fetch published events for the organiser, ordered by start date ascending
    const url = new URL(
      `https://www.eventbriteapi.com/v3/organizers/${EVENTBRITE_ORG_ID}/events/`
    );
    url.searchParams.set("status", "live");
    url.searchParams.set("order_by", "start_asc");
    url.searchParams.set("time_filter", "current_future");
    url.searchParams.set("expand", "logo");

    const ebRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${EVENTBRITE_TOKEN}` },
    });

    if (!ebRes.ok) {
      const text = await ebRes.text();
      return res.status(ebRes.status).json({ error: `Eventbrite error: ${text}` });
    }

    const data = await ebRes.json();
    const events = data.events ?? [];

    if (events.length === 0) {
      return res.status(200).json({ event: null });
    }

    // Return only what the frontend needs from the first upcoming event
    const e = events[0];
    return res.status(200).json({
      event: {
        id: e.id,
        title: e.name?.text ?? "Upcoming Event",
        url: e.url,
        start: e.start?.local,        // ISO date-time string in local tz
        end: e.end?.local,
        timezone: e.start?.timezone,
        imageUrl: e.logo?.original?.url ?? e.logo?.url ?? null,
      },
    });
  } catch (err) {
    console.error("next-event error:", err);
    return res.status(500).json({ error: err.message });
  }
}
