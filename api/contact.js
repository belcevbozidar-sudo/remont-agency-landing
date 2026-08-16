const crypto = require('crypto');

module.exports = async function contactHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const submittedPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const business = typeof req.body?.business === 'string' ? req.body.business.trim() : '';
  const submittedEventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
  const hasMarketingConsent = req.body?.hasMarketingConsent === true;
  const phone = normalizeBulgarianMobile(submittedPhone);
  const eventId = /^[a-zA-Z0-9_-]{8,100}$/.test(submittedEventId) ? submittedEventId : crypto.randomUUID();

  if (!phone || !business || business.length > 2000) {
    return res.status(400).json({ error: 'Въведи валиден български мобилен номер и кратко описание на бизнеса.' });
  }

  const {
    CONVEX_URL,
    CONVEX_SUBMISSION_SECRET,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    NTFY_TOPIC,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_SENDER_ID,
    META_PIXEL_ID,
    META_CAPI_ACCESS_TOKEN,
  } = process.env;
  if (!CONVEX_URL || !CONVEX_SUBMISSION_SECRET || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !NTFY_TOPIC || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_SENDER_ID) {
    return res.status(500).json({ error: 'Формата временно не е настроена.' });
  }

  try {
    const convexResponse = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'submissions:logInquiry',
        args: {
          phone,
          industry: 'Ремонтен бизнес',
          problem: business,
          email: '',
          website: '',
          noChange: '',
          secret: CONVEX_SUBMISSION_SECRET,
        },
      }),
    });

    if (!convexResponse.ok) {
      throw new Error('Convex request failed');
    }

    const convexResult = await convexResponse.json();
    if (convexResult.status !== 'success') {
      throw new Error('Convex mutation failed');
    }

    const smsBody = new URLSearchParams({
      To: phone,
      From: TWILIO_SENDER_ID,
      Body: 'Заявката е получена. Ще се свържем с Вас скоро.',
    });
    const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: smsBody.toString(),
    });

    if (!twilioResponse.ok) {
      throw new Error('Twilio request failed');
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `Ново запитване от ремонтен сайт\n\nТелефон: ${phone}\nБизнес: ${business}`,
      }),
    });

    if (!telegramResponse.ok) {
      throw new Error('Telegram request failed');
    }

    const ntfyResponse = await fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'Ново запитване от ремонтен сайт',
        Priority: '5',
        Tags: 'hammer,calling',
      },
      body: `Телефон: ${phone}\nБизнес: ${business}`,
    });

    if (!ntfyResponse.ok) {
      throw new Error('ntfy request failed');
    }

    // Reporting must never prevent a valid enquiry from reaching the team.
    if (hasMarketingConsent && META_PIXEL_ID && META_CAPI_ACCESS_TOKEN) {
      try {
        await sendMetaConversions(req, phone, eventId, META_PIXEL_ID, META_CAPI_ACCESS_TOKEN);
      } catch (error) {
        console.error('Meta Conversions API reporting failed', error);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Contact form submission failed', error);
    return res.status(502).json({ error: 'Не успяхме да изпратим запитването. Опитай отново малко по-късно.' });
  }
};

function normalizeBulgarianMobile(value) {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^08\d{8}$/.test(compact)) return `+359${compact.slice(1)}`;
  if (/^\+3598\d{8}$/.test(compact)) return compact;
  if (/^3598\d{8}$/.test(compact)) return `+${compact}`;
  return null;
}

async function sendMetaConversions(req, phone, eventId, pixelId, accessToken) {
  const eventTime = Math.floor(Date.now() / 1000);
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : req.socket?.remoteAddress;
  const phoneHash = crypto.createHash('sha256').update(phone.replace(/\D/g, '')).digest('hex');
  const userData = { ph: [phoneHash] };

  if (clientIp) userData.client_ip_address = clientIp;
  if (req.headers['user-agent']) userData.client_user_agent = req.headers['user-agent'];

  const host = req.headers.host || 'remont-agency-landing.vercel.app';
  const events = ['Contact', 'Lead', 'Purchase'].map((eventName) => ({
    event_name: eventName,
    event_time: eventTime,
    event_id: `${eventId}-${eventName.toLowerCase()}`,
    event_source_url: `https://${host}/thank-you`,
    action_source: 'website',
    user_data: userData,
  }));

  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: events }),
  });

  if (!response.ok) {
    throw new Error(`Meta Conversions API request failed (${response.status})`);
  }
}
