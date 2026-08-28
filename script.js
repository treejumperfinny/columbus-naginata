const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.main-nav');

menuToggle.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    navigation.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;

    event.preventDefault();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.scrollIntoView();
      return;
    }

    const startPosition = window.scrollY;
    const distance = target.getBoundingClientRect().top;
    const duration = 700;
    const startTime = performance.now();
    const easeInOutCubic = (progress) => progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

    function scroll(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      window.scrollTo(0, startPosition + distance * easeInOutCubic(progress));
      if (progress < 1) requestAnimationFrame(scroll);
    }

    requestAnimationFrame(scroll);
  });
});

const contactModal = document.querySelector('#contact-modal');
const contactModalTrigger = document.querySelector('.contact-modal-trigger');
let lastContactFocusedElement = null;
let turnstileReady = false;
let turnstileVerified = false;
let turnstileWidgetId;
let updateContactSubmitState = () => {};

function renderContactTurnstile() {
  if (!turnstileReady || turnstileWidgetId !== undefined) return;

  turnstileWidgetId = window.turnstile.render('#contact-turnstile', {
    sitekey: '0x4AAAAAAEfhQY8rLvI2qSCl',
    callback: () => {
      turnstileVerified = true;
      updateContactSubmitState();
    },
    'expired-callback': () => {
      turnstileVerified = false;
      updateContactSubmitState();
    },
    'error-callback': () => {
      turnstileVerified = false;
      updateContactSubmitState();
    },
  });
}

window.onTurnstileLoad = () => {
  turnstileReady = true;
  if (!contactModal.hidden) renderContactTurnstile();
};

function closeContactModal() {
  contactForm.reset();
  contactForm.querySelectorAll('.field-error').forEach((error) => {
    error.textContent = '';
  });
  contactForm.querySelector('.form-status').textContent = '';
  turnstileVerified = false;
  if (turnstileWidgetId !== undefined) window.turnstile.reset(turnstileWidgetId);
  updateContactSubmitState();
  contactModal.hidden = true;
  document.removeEventListener('keydown', handleContactModalKeydown);
  if (lastContactFocusedElement) lastContactFocusedElement.focus();
}

function handleContactModalKeydown(keyEvent) {
  if (keyEvent.key === 'Escape') closeContactModal();
}

contactModalTrigger.addEventListener('click', () => {
  lastContactFocusedElement = document.activeElement;
  contactModal.hidden = false;
  renderContactTurnstile();
  contactModal.querySelector('input[name="name"]').focus();
  document.addEventListener('keydown', handleContactModalKeydown);
});

contactModal.querySelectorAll('[data-contact-modal-close]').forEach((element) => {
  element.addEventListener('click', closeContactModal);
});

const contactForm = contactModal.querySelector('#contact-form');
if (contactForm) {
  const submitButton = contactForm.querySelector('[type="submit"]');
  updateContactSubmitState = () => {
    submitButton.disabled = !contactForm.checkValidity() || !turnstileVerified;
  };

  contactForm.addEventListener('input', updateContactSubmitState);
  contactForm.querySelectorAll('[required]').forEach((field) => {
    field.addEventListener('blur', () => {
      const error = field.parentElement.querySelector('.field-error');
      error.textContent = field.validity.valueMissing ? 'Field required. Please fill in.' : '';
    });
    field.addEventListener('input', () => {
      if (field.validity.valid) field.parentElement.querySelector('.field-error').textContent = '';
    });
  });
  updateContactSubmitState();

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = contactForm.querySelector('.form-status');
    submitButton.disabled = true;
    status.textContent = 'Sending...';

    try {
      const response = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error('Formspree could not accept the message.');
      contactForm.reset();
      turnstileVerified = false;
      if (turnstileWidgetId !== undefined) window.turnstile.reset(turnstileWidgetId);
      status.textContent = 'Thanks. We will be in touch soon.';
    } catch (error) {
      status.textContent = 'Your message could not be sent. Please email us directly.';
      console.error('Could not submit contact form:', error);
    } finally {
      updateContactSubmitState();
    }
  });
}

// Paste your DatoCMS read-only Content Delivery API token here (Settings > API tokens).
const DATOCMS_API_TOKEN = '617583127ddd94d00a3167f32c0b5e';

const eventModal = document.querySelector('#event-modal');
const eventModalType = eventModal.querySelector('.event-modal-type');
const eventModalTitle = eventModal.querySelector('.event-modal-title');
const eventModalMeta = eventModal.querySelector('.event-modal-meta');
const eventModalDescription = eventModal.querySelector('.event-modal-description');
let lastFocusedElement = null;

const EVENT_DESCRIPTION_ALLOWED_TAGS = new Set(['P', 'A', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'BR']);

// Rebuilds only allowlisted tags from CMS-supplied HTML/markdown; never assigns raw HTML to the page.
function appendSanitizedNodes(sourceParent, targetParent) {
  sourceParent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      targetParent.appendChild(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (!EVENT_DESCRIPTION_ALLOWED_TAGS.has(node.tagName)) {
      appendSanitizedNodes(node, targetParent);
      return;
    }

    const el = document.createElement(node.tagName);
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
        el.setAttribute('href', href);
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('target', '_blank');
      }
    }
    appendSanitizedNodes(node, el);
    targetParent.appendChild(el);
  });
}

function renderEventDescription(container, description) {
  container.textContent = '';
  if (!description) return;
  const template = document.createElement('template');
  template.innerHTML = description;
  appendSanitizedNodes(template.content, container);
}

function parseCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatEventDateRange(event) {
  const start = parseCalendarDate(event.startDate);
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (event.endDate && event.endDate !== event.startDate) {
    const endLabel = parseCalendarDate(event.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel;
}

function handleModalKeydown(keyEvent) {
  if (keyEvent.key === 'Escape') closeEventModal();
}

function openEventModal(event) {
  lastFocusedElement = document.activeElement;
  eventModalType.textContent = event.eventType;
  eventModalTitle.textContent = event.eventName;
  eventModalMeta.textContent = `${formatEventDateRange(event)} · ${event.eventTime} · ${event.venueName}`;
  renderEventDescription(eventModalDescription, event.eventDescription);
  eventModal.hidden = false;
  eventModal.querySelector('.event-modal-close').focus();
  document.addEventListener('keydown', handleModalKeydown);
}

function closeEventModal() {
  eventModal.hidden = true;
  document.removeEventListener('keydown', handleModalKeydown);
  if (lastFocusedElement) lastFocusedElement.focus();
}

eventModal.querySelectorAll('[data-modal-close]').forEach((el) => el.addEventListener('click', closeEventModal));

function createEventItem(event) {
  const article = document.createElement('article');
  article.className = 'event-item';
  article.setAttribute('role', 'button');
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-haspopup', 'dialog');

  const time = document.createElement('time');
  const eventDate = parseCalendarDate(event.startDate);
  time.append(eventDate.toLocaleString('en-US', { month: 'short' }), document.createElement('br'));
  const dayEl = document.createElement('b');
  dayEl.textContent = String(eventDate.getDate()).padStart(2, '0');
  time.append(dayEl);

  const typeEl = document.createElement('p');
  typeEl.className = 'event-type';
  typeEl.textContent = event.eventType;

  const titleEl = document.createElement('h3');
  titleEl.textContent = event.eventName;

  const metaEl = document.createElement('p');
  metaEl.textContent = `${event.eventTime} · ${event.venueName}`;

  const details = document.createElement('div');
  details.append(typeEl, titleEl, metaEl);

  const arrow = document.createElement('span');
  arrow.className = 'event-arrow';
  arrow.textContent = '↗';

  article.append(time, details, arrow);
  article.addEventListener('click', () => openEventModal(event));
  article.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      openEventModal(event);
    }
  });
  return article;
}

function updateEventListScrollState(list) {
  list.classList.toggle('is-scrollable', list.children.length > 5);
}

async function loadEventsFromDatoCMS() {
  if (!DATOCMS_API_TOKEN || DATOCMS_API_TOKEN === 'YOUR_READ_ONLY_CDA_TOKEN') return;

  const query = `query { allEvents(orderBy: startDate_ASC) { id eventName eventType startDate endDate eventTime venueName eventDescription(markdown: true) } }`;

  try {
    const response = await fetch('https://graphql.datocms.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DATOCMS_API_TOKEN}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error(`DatoCMS request failed: ${response.status}`);
    const { data, errors } = await response.json();
    if (errors) throw new Error(errors.map((error) => error.message).join(', '));
    if (!data?.allEvents?.length) return;

    const list = document.querySelector('.event-items');
    list.querySelectorAll('.event-item').forEach((item) => item.remove());
    data.allEvents.forEach((event) => list.appendChild(createEventItem(event)));
    updateEventListScrollState(list);
  } catch (error) {
    // Keep the existing hardcoded events in the markup as a fallback.
    console.error('Could not load events from DatoCMS:', error);
  }
}

updateEventListScrollState(document.querySelector('.event-items'));
loadEventsFromDatoCMS();
