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
  arrow.setAttribute('aria-hidden', 'true');

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

function getEventStartMinutes(eventTime) {
  const match = eventTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return Number.MAX_SAFE_INTEGER;

  let hours = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hours += 12;
  return hours * 60 + Number(match[2] || 0);
}

function sortEventsChronologically(events) {
  return [...events].sort((firstEvent, secondEvent) => {
    const dateDifference = firstEvent.startDate.localeCompare(secondEvent.startDate);
    return dateDifference || getEventStartMinutes(firstEvent.eventTime) - getEventStartMinutes(secondEvent.eventTime);
  });
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
    sortEventsChronologically(data.allEvents).forEach((event) => list.appendChild(createEventItem(event)));
    updateEventListScrollState(list);
  } catch (error) {
    // Keep the existing hardcoded events in the markup as a fallback.
    console.error('Could not load events from DatoCMS:', error);
  }
}

updateEventListScrollState(document.querySelector('.event-items'));
loadEventsFromDatoCMS();
