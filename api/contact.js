module.exports = async function contactHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const submittedPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const business = typeof req.body?.business === 'string' ? req.body.business.trim() : '';
  const phone = normalizeBulgarianMobile(submittedPhone);

  if (!phone || !business || business.length > 2000) {
    return res.status(400).json({ error: 'Въведи валиден български мобилен номер и кратко описание на бизнеса.' });
  }

  const {
    CONVEX_URL,
    CONVEX_SUBMISSION_SECRET,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_SENDER_ID,
  } = process.env;
  if (!CONVEX_URL || !CONVEX_SUBMISSION_SECRET || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_SENDER_ID) {
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
        text: `Ново запитване от Studio 9\n\nТелефон: ${phone}\nБизнес: ${business}`,
      }),
    });

    if (!telegramResponse.ok) {
      throw new Error('Telegram request failed');
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
