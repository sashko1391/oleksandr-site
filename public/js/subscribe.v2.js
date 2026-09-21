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
  var REQUEST_TIMEOUT = 15000;
  var statusNode = null;

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
    statusNode = status;
    var submit = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (e) { e.preventDefault(); send(form, status, submit); });
    loadTurnstile(box, status);
  }

  function loadTurnstile(box, status) {
    if (!box) return;
    window.onSubscribeTurnstile = function () {
      if (!window.turnstile) return;
      widgetId = window.turnstile.render(box, {
        sitekey: SITE_KEY,
        theme: 'light',
        // Перевірка впала або протухла — не мовчимо і не лишаємо мертву кнопку.
        'error-callback': function () { captchaDead = true; setStatus(statusNode, CAPTCHA_MSG, 'err'); },
        'expired-callback': function () { setStatus(statusNode, 'Перевірка застаріла — пройдіть її ще раз.', 'err'); },
      });
      // Приїхав пізніше за таймаут — знімаємо вирок, інакше форма лишилася б мертвою назавжди.
      if (widgetId != null && captchaDead) { captchaDead = false; setStatus(statusNode, '', ''); }
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
    if (!topics.length) return setStatus(status, 'Виберіть хоча б один розділ.', 'err');
    if (!consent || !consent.checked) return setStatus(status, 'Потрібна згода на обробку адреси.', 'err');
    if (captchaDead) return setStatus(status, CAPTCHA_MSG, 'err');
    var token = window.turnstile && widgetId != null ? window.turnstile.getResponse(widgetId) : '';
    if (!token) return setStatus(status, 'Зачекайте секунду — перевірка ще не завершилась.', 'err');

    submit.disabled = true;
    setStatus(status, 'Надсилаю…', '');
    var done = function () {
      submit.disabled = false; // що б не сталося, кнопка не лишається мертвою
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
    };
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT) : null;
    // Слеш обов'язковий: vercel.json має trailingSlash, і без нього кожен виклик — зайвий 308.
    fetch('/api/subscribe/', {
      method: 'POST',
      signal: ctrl ? ctrl.signal : undefined,
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
      if (timer) clearTimeout(timer);
      done();
      if (r.status === 202) {
        // Дослівно те, що каже сервер: він навмисно не розрізняє нову й уже підписану адресу,
        // а ще мовчить про cooldown — тож обіцяти «лист у дорозі» тут не можна.
        setStatus(status, '✅ Якщо цій адресі потрібне підтвердження — перевірте пошту. ' +
          'Якщо вона вже підписана, робити нічого не треба.', 'ok');
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
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      done();
      setStatus(status, e && e.name === 'AbortError'
        ? 'Сервер не відповів вчасно. Спробуйте ще раз.'
        : 'Помилка мережі. Спробуйте ще раз.', 'err');
    });
  }
})();
