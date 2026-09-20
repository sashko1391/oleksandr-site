/*
 * Honest lead form — shared by /services/, the five service landings and the /pricing/ brief.
 * Success is shown only after the Worker answers 2xx; a request that hangs ends in the same honest
 * error, with the visitor's data kept so they can retry or write directly.
 *
 * Wire-up:
 *   <form data-lead-form data-label="nextjs_form" data-success="#leadSuccess" data-success-class="show">
 *   - contact field: name="contact" or name="phone"; every other named field becomes a line of the message
 *   - honeypot: an input marked data-hp inside an off-screen inert container
 *   - status: an element marked data-lead-status (or one is created after the form)
 * The form dispatches lead:sent and lead:error so a page can add its own analytics.
 */
(function () {
  'use strict';
  var WORKER_URL = 'https://oleksandr-site.sashko1391.workers.dev';
  var TIMEOUT_MS = 15000;
  var SENDING = 'Надсилаю…';
  var RETRY = 'Надіслати ще раз';
  var OK_TEXT = 'Дякую! Заявку отримано — відповім особисто в месенджер чи на пошту, які ви вказали.';
  var FAIL_TEXT = 'Не вдалося підтвердити доставку заявки. Спробуйте ще раз або напишіть напряму — Telegram, ' +
    'WhatsApp чи email нижче.';

  function track() {
    if (typeof window.gtag === 'function') window.gtag.apply(null, arguments);
  }

  function labelOf(field, form) {
    var label = field.id ? form.querySelector('label[for="' + field.id + '"]') : null;
    var text = label ? label.textContent : field.getAttribute('placeholder') || field.name;
    return text.replace(/\s+/g, ' ').replace(/\s*\(необов'язково\)\s*/i, '').trim();
  }

  function statusBox(form) {
    var box = form.querySelector('[data-lead-status]') ||
      (form.parentNode && form.parentNode.querySelector('[data-lead-status]'));
    if (!box) {
      box = document.createElement('p');
      box.className = 'form-status';
      box.setAttribute('data-lead-status', '');
      box.setAttribute('role', 'status');
      box.setAttribute('tabindex', '-1');
      form.parentNode.insertBefore(box, form.nextSibling);
    }
    return box;
  }

  function show(box, text, isError) {
    box.className = (box.className.replace(/\s*\berror\b/, '') || 'form-status') + (isError ? ' error' : '');
    box.textContent = text;
    if (typeof box.focus === 'function') box.focus();
  }

  function hide(form) {
    form.hidden = true;
    form.style.display = 'none'; // author CSS (display:grid/flex) would otherwise beat the hidden attribute
  }

  function succeed(form, box) {
    var success = form.getAttribute('data-success') && document.querySelector(form.getAttribute('data-success'));
    form.reset();
    hide(form);
    if (success) {
      success.style.display = 'block';
      if (form.getAttribute('data-success-class')) success.classList.add(form.getAttribute('data-success-class'));
      if (typeof success.focus === 'function') { success.setAttribute('tabindex', '-1'); success.focus(); }
    } else {
      show(box, OK_TEXT, false);
    }
  }

  function payloadOf(form) {
    var contact = '';
    var lines = [];
    var fields = form.querySelectorAll('input[name], textarea[name], select[name]');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.hasAttribute('data-hp')) continue;
      var value = (field.value || '').trim();
      if (field.name === 'contact' || field.name === 'phone') contact = value;
      lines.push(labelOf(field, form) + ': ' + (value || '—'));
    }
    return {
      contact: contact,
      history: 'ФОРМА (' + location.pathname + ')\n' + lines.join('\n') + '\nСторінка: ' + location.href,
      source: location.pathname,
      timestamp: new Date().toISOString()
    };
  }

  function attach(form) {
    var button = form.querySelector('button[type="submit"], input[type="submit"]');
    var label = form.getAttribute('data-label') || 'lead_form';
    var box = statusBox(form);
    var idle = button ? button.textContent : '';

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var honeypot = form.querySelector('[data-hp]');
      if (honeypot && honeypot.value) { // only bots fill a field no one can see
        succeed(form, box);
        return;
      }
      var payload = payloadOf(form);
      if (button) { button.disabled = true; button.textContent = SENDING; }
      show(box, '', false);
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
      fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        track('event', 'generate_lead', { event_category: 'conversion', event_label: label, value: 1, currency: 'UAH' });
        track('event', 'conversion_event_submit_lead_form');
        form.dispatchEvent(new CustomEvent('lead:sent', { bubbles: true, detail: { label: label } }));
        succeed(form, box);
      }).catch(function (error) {
        clearTimeout(timer);
        if (button) { button.disabled = false; button.textContent = RETRY || idle; }
        show(box, FAIL_TEXT, true);
        form.dispatchEvent(new CustomEvent('lead:error', { bubbles: true, detail: { label: label, error: String(error) } }));
      });
    });
  }

  var forms = document.querySelectorAll('form[data-lead-form]');
  for (var i = 0; i < forms.length; i++) attach(forms[i]);
})();
