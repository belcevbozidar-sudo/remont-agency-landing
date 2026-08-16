(function () {
  var consentKey = 'studio9_marketing_consent';
  var pixelId = '923372703416193';

  function hasConsent() {
    try { return window.localStorage.getItem(consentKey) === 'accepted'; }
    catch (error) { return false; }
  }

  function loadPixel() {
    if (window.__studio9PixelLoaded) return;
    window.__studio9PixelLoaded = true;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', pixelId);
    fbq('track', 'PageView');
  }

  function trackPageEvents() {
    var events = (document.body.getAttribute('data-meta-events') || '').split(',').filter(Boolean);
    events.forEach(function (eventName) { fbq('track', eventName); });
  }

  function enableTracking() {
    loadPixel();
    trackPageEvents();
  }

  function saveConsent(value) {
    try { window.localStorage.setItem(consentKey, value); } catch (error) {}
  }

  function showBanner() {
    var banner = document.createElement('aside');
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Настройки за бисквитки');
    banner.style.cssText = 'position:fixed;z-index:120;right:16px;bottom:16px;width:min(440px,calc(100vw - 32px));padding:20px;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:#17171B;color:#F6F5F2;box-shadow:0 22px 60px rgba(0,0,0,.35);font:500 14px/1.5 Manrope,Arial,sans-serif';
    banner.innerHTML = '<strong style="display:block;font-size:16px;margin-bottom:6px">Бисквитки за измерване</strong><span style="display:block;color:#B8B6BF">Използваме Meta Pixel за измерване на рекламите. Можеш да приемеш или откажеш.</span><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button type="button" data-consent="rejected" style="padding:10px 15px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:transparent;color:#F6F5F2;font:700 13px Manrope,Arial,sans-serif;cursor:pointer">Отказвам</button><button type="button" data-consent="accepted" style="padding:10px 15px;border:0;border-radius:999px;background:#FF5B2E;color:#fff;font:700 13px Manrope,Arial,sans-serif;cursor:pointer">Приемам</button></div>';
    banner.addEventListener('click', function (event) {
      var choice = event.target && event.target.getAttribute('data-consent');
      if (!choice) return;
      saveConsent(choice);
      if (choice === 'accepted') enableTracking();
      banner.remove();
    });
    document.body.appendChild(banner);
  }

  if (hasConsent()) enableTracking();
  else {
    try {
      if (!window.localStorage.getItem(consentKey)) showBanner();
    } catch (error) { showBanner(); }
  }
})();
