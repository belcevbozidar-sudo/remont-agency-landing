module.exports = async function contactHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const business = typeof req.body?.business === 'string' ? req.body.business.trim() : '';

  if (!phone || !business || phone.length > 60 || business.length > 2000) {
    return res.status(400).json({ error: 'Попълни телефон и кратко описание на бизнеса.' });
  }

  const { CONVEX_URL, CONVEX_SUBMISSION_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!CONVEX_URL || !CONVEX_SUBMISSION_SECRET || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
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
