/* Підписка на листи parkinsandr.tech — first-party, без залежностей.
   Lazy-init, textContent-only (XSS-safe), Turnstile explicit, honeypot.
   Розмітка приходить із сервера (<form class="sub-form" hidden>) і показується лише після ініціалізації:
   без JS форма не працювала б, тож ми її й не показуємо — натомість поруч завжди видно RSS і Telegram,
   які працюють без скриптів. Те саме, коли не приїхав Turnstile: кажемо про це прямо. */
(function () {
  'use strict';
  var SITE_KEY = '0x4AAAAAAD06Nen_zKGLZ_hN';
  var CAPTCHA_MSG =
    'Перевірка Cloudflare не завантажилась — її часто ріжуть блокувальники. ' +
    'Підписка поштою без неї не працює, але RSS і Telegram нижче працюють без жодних перевірок.';
  var root = document.querySelector('[data-subscribe]');
  if (!root) return;
  var inited = false;
  var widgetId = null;
  var captchaDead = false; // Turnstile не приїхав: краще сказати правду, ніж крутити «зачекайте»
  var CAPTCHA_TIMEOUT = 8000;

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting && !inited) { inited = true; io.disconnect(); init(); }
    }
  }, { rootMargin: '400px' });
  io.observe(root);

  function init() {
    var form = root.querySelector('form');
    if (!form) return;
    form.hidden = false;
    var box = root.querySelector('[data-turnstile]');
    var status = root.querySelector('[data-status]');
    var submit = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (e) { e.preventDefault(); send(form, status, submit); });
    loadTurnstile(box, status);
  }

  function loadTurnstile(box, status) {
    if (!box) return;
    window.onSubscribeTurnstile = function () {
      if (!window.turnstile) return;
      widgetId = window.turnstile.render(box, { sitekey: SITE_KEY, theme: 'light' });
    };
    var giveUp = function () {
      if (widgetId != null) return;
      captchaDead = true;
      setStatus(status, CAPTCHA_MSG, 'err');
    };
    if (window.turnstile) return window.onSubscribeTurnstile();
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onSubscribeTurnstile&render=explicit';
    s.async = true;
    s.defer = true;
    s.onerror = giveUp; // заблокований розширенням чи мережею
    document.head.appendChild(s);
    setTimeout(giveUp, CAPTCHA_TIMEOUT); // завантажився, але так і не намалювався
  }

  function setStatus(node, text, cls) {
    if (!node) return;
    node.className = 'sub-status' + (cls ? ' ' + cls : '');
    node.textContent = text; // XSS-safe
  }

  function send(form, status, submit) {
    var email = form.querySelector('input[type=email]');
    var consent = form.querySelector('input[name=consent]');
    var hp = form.querySelector('input[name=hp]');
    var topics = [];
    var boxes = form.querySelectorAll('input[name=topics]:checked');
    for (var i = 0; i < boxes.length; i++) topics.push(boxes[i].value);

    if (!email || !email.value.trim()) return setStatus(status, 'Вкажіть адресу пошти.', 'err');
    if (!consent || !consent.checked) return setStatus(status, 'Потрібна згода на обробку адреси.', 'err');
    if (captchaDead) return setStatus(status, CAPTCHA_MSG, 'err');
    var token = window.turnstile && widgetId != null ? window.turnstile.getResponse(widgetId) : '';
    if (!token) return setStatus(status, 'Зачекайте секунду — перевірка ще не завершилась.', 'err');

    submit.disabled = true;
    setStatus(status, 'Надсилаю…', '');
    // Слеш обов'язковий: vercel.json має trailingSlash, і без нього кожен виклик — зайвий 308.
    fetch('/api/subscribe/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
      body: JSON.stringify({
        email: email.value.trim(),
        topics: topics,
        consent: true,
        turnstileToken: token,
        source: location.pathname,
        hp: hp ? hp.value : '',
      }),
    }).then(function (r) {
      submit.disabled = false;
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
      if (r.status === 202) {
        // Те саме, що каже сервер: лист або вже в дорозі, або адреса вже підписана.
        setStatus(status, '✅ Перевірте пошту — там лист із кнопкою підтвердження.', 'ok');
        email.value = '';
        consent.checked = false;
      } else if (r.status === 429) {
        setStatus(status, 'Забагато спроб. Спробуйте за кілька хвилин.', 'err');
      } else if (r.status >= 500) {
        // Чесно: лист НЕ пішов, і винна не адреса. 500 — наша конфігурація, 503 — провайдер чи база.
        setStatus(status, 'Лист не вдалося надіслати — це збій на нашому боці, не у вашій адресі. ' +
          'Спробуйте пізніше або беріть RSS чи Telegram нижче.', 'err');
      } else {
        setStatus(status, 'Не вдалося підписати. Перевірте адресу й спробуйте ще раз.', 'err');
      }
    }).catch(function () {
      submit.disabled = false;
      setStatus(status, 'Помилка мережі. Спробуйте ще раз.', 'err');
    });
  }
})();
