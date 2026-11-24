/*
 * Shibui Health enquiry forms.
 *
 * Posts straight to HubSpot's form submission endpoint, so the page keeps its
 * own design and the visitor never leaves the site. Enquiries arrive as HubSpot
 * contacts; HubSpot sends the notification email.
 *
 * To point a form at a different HubSpot form, change its guid below.
 */
(function () {
  'use strict';

  var PORTAL_ID = '443780015';
  var ENDPOINT = 'https://api.hsforms.com/submissions/v3/integration/submit/';
  var FALLBACK_EMAIL = 'admin@shibuihealth.com.au';
  var FALLBACK_PHONE = '0455 081 480';

  var FORMS = {
    'enquiry': {
      guid: '23d187e9-e742-499d-bb76-a78ae0485bfa',
      thanks: 'thanks.html'
    },
    'circle-enquiry': {
      guid: '7b32a6af-5a66-4db4-a6b4-5156e336f736',
      thanks: 'circle-thanks.html'
    }
  };

  // Labels for the enquiry topic, so the CRM reads in plain English.
  var TOPIC_LABELS = {
    'general': 'General enquiry',
    'inperson': 'In-person or home visit (nurse practitioner)',
    'midwifery': 'Midwifery care (Reborn)',
    'hypnobirthing': 'HypnoBirthing classes'
  };

  var INTEREST_LABELS = {
    'circle': 'The Circle',
    'antenatal-postnatal': 'Antenatal and postnatal care',
    'something-else': 'Something else'
  };

  function val(form, name) {
    var el = form.elements[name];
    if (!el) return '';
    return (el.value || '').trim();
  }

  function splitName(full) {
    var parts = full.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '-' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
  }

  function consentText(form) {
    var box = form.querySelector('.check span');
    return box ? box.textContent.replace(/\s+/g, ' ').trim()
               : 'I agree that Shibui Health may use these details to reply to my enquiry.';
  }

  // Builds the message body. The topic and due date are folded in as labelled
  // lines so nothing the visitor typed is lost.
  function buildMessage(form, formName) {
    var lines = [];

    if (formName === 'enquiry') {
      var topic = val(form, 'topic');
      if (topic) lines.push('Enquiry about: ' + (TOPIC_LABELS[topic] || topic));
      var due = val(form, 'due_date');
      if (due) lines.push('Due date: ' + due);
    } else {
      var interest = val(form, 'interest');
      if (interest) lines.push('Interested in: ' + (INTEREST_LABELS[interest] || interest));
    }

    var body = val(form, 'message');
    if (body) {
      if (lines.length) lines.push('');
      lines.push(body);
    }
    return lines.join('\n');
  }

  function showError(form, message) {
    var box = form.querySelector('.form-error');
    if (!box) {
      box = document.createElement('p');
      box.className = 'notice form-error';
      box.setAttribute('role', 'alert');
      form.insertBefore(box, form.querySelector('div:last-child'));
    }
    box.innerHTML = message;
  }

  function wire(form) {
    var formName = form.getAttribute('name');
    var config = FORMS[formName];
    if (!config) return;

    form.setAttribute('novalidate', 'novalidate');
    form.removeAttribute('action');

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      // Let the browser handle its own required-field messages first.
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
        form.removeAttribute('novalidate');
        form.reportValidity();
        form.setAttribute('novalidate', 'novalidate');
        return;
      }

      // Honeypot: quietly send bots to the thank-you page without submitting.
      if (val(form, 'bot-field')) {
        window.location.href = config.thanks;
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      var buttonText = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending…';
      }

      var name = splitName(val(form, 'name'));
      var fields = [
        { objectTypeId: '0-1', name: 'firstname', value: name.first },
        { objectTypeId: '0-1', name: 'lastname', value: name.last },
        { objectTypeId: '0-1', name: 'email', value: val(form, 'email') }
      ];

      var phone = val(form, 'phone');
      if (phone) fields.push({ objectTypeId: '0-1', name: 'phone', value: phone });

      var message = buildMessage(form, formName);
      if (message) fields.push({ objectTypeId: '0-1', name: 'message', value: message });

      var payload = {
        fields: fields,
        context: {
          pageUri: window.location.href,
          pageName: document.title
        },
        legalConsentOptions: {
          consent: {
            consentToProcess: true,
            text: consentText(form)
          }
        }
      };

      var hutk = cookie('hubspotutk');
      if (hutk) payload.context.hutk = hutk;

      fetch(ENDPOINT + PORTAL_ID + '/' + config.guid, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        window.location.href = config.thanks;
      }).catch(function () {
        if (button) {
          button.disabled = false;
          button.textContent = buttonText;
        }
        showError(form,
          '<strong>Sorry — that didn’t send.</strong> Please email ' +
          '<a href="mailto:' + FALLBACK_EMAIL + '">' + FALLBACK_EMAIL + '</a> ' +
          'or call <a href="tel:+61455081480">' + FALLBACK_PHONE + '</a> and we’ll pick it up from there.');
      });
    });
  }

  if (window.fetch) {
    Object.keys(FORMS).forEach(function (formName) {
      var form = document.querySelector('form[name="' + formName + '"]');
      if (form) wire(form);
    });
  }
})();
