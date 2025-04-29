// script.js (Cleaned + Well-Commented Version)

// Import helper APIs
import { fetchGoogleSheet, fetchWeatherForecast, fetchPhotosFromGoogleAlbum } from './utils/api.js';

let config = {};
let currentPhotoIndex = 0;
let photoUrls = [];
let photoTimer = null;
let gapiLoaded = false;
let gapiTokenClient = null;

// --- Load config from localStorage or network ---
async function loadConfig() {
    const cachedConfig = localStorage.getItem('familyDashboardConfig');
    if (cachedConfig) {
        try {
            config = JSON.parse(cachedConfig);
            console.log('Loaded config from localStorage');
            initializeDashboard();
            return;
        } catch (e) {
            console.warn('Invalid cached config, will refetch.');
        }
    }

    try {
        const response = await fetch('./config/config.json');
        if (!response.ok) throw new Error('config.json not found');
        config = await response.json();
        console.log('Loaded config.json from server');
        localStorage.setItem('familyDashboardConfig', JSON.stringify(config));
    } catch (error) {
        console.warn('Main config.json failed, trying default-config.json...', error);

        const responseDefault = await fetch('default-config.json');
        if (!responseDefault.ok) throw new Error('default-config.json not found');
        config = await responseDefault.json();
        console.log('Loaded default-config.json from server');
        localStorage.setItem('familyDashboardConfig', JSON.stringify(config));
    }

    const savedSettings = JSON.parse(localStorage.getItem('familyDashboardSettings') || '{}');
    config = { ...config, ...savedSettings, features: { ...config.features, ...savedSettings.features } };

    if (config.theme) {
        document.getElementById('theme-style').href = `themes/${config.theme}.css`;
    }

    initializeDashboard();
}

// --- Initialize the dashboard sections ---
function initializeDashboard() {
    adminPanel.classList.add('hidden');
    adminLogin.classList.add('hidden');
    adminSettings.classList.add('hidden');

    loadFamilyMessages();
    loadTodoList();
    loadPhotos();
    loadWeatherForecast();
    loadCalendarEvents();

    loadAdminSettingsUI();
}

// --- Clock handling ---
function updateClock() {
    const now = new Date();
    const formatted = now.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    document.getElementById('datetime').textContent = formatted;
}
setInterval(updateClock, 1000);
updateClock();

// --- Family Messages ---
async function loadFamilyMessages() {
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = '<p>Loading messages...</p>';

    try {
        const rows = await fetchGoogleSheet('Messages', config);
        renderMessages(rows);
    } catch {
        const response = await fetch('offline-data/messages.json');
        const offlineMessages = await response.json();
        renderMessages(offlineMessages.map(msg => [msg]));
    }
}

function renderMessages(rows) {
    const container = document.getElementById('messages-list');
    container.innerHTML = '';
    rows.forEach(([message]) => {
        const p = document.createElement('p');
        p.textContent = message;
        container.appendChild(p);
    });
}

// --- To-Do List ---
async function loadTodoList() {
    const todoList = document.getElementById('todo-list');
    todoList.innerHTML = '<p>Loading to-do list...</p>';

    try {
        const rows = await fetchGoogleSheet('ToDo', config);
        renderTodos(rows);
    } catch {
        const response = await fetch('offline-data/todos.json');
        const offlineTodos = await response.json();
        renderTodos(offlineTodos.map(todo => [todo]));
    }
}

function renderTodos(rows) {
    const container = document.getElementById('todo-list');
    container.innerHTML = '';
    rows.forEach(([task]) => {
        const div = document.createElement('div');
        div.textContent = `• ${task}`;
        container.appendChild(div);
    });
}

// --- Photos Carousel ---
async function loadPhotos() {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = '<p>Loading photos...</p>';

    try {
        if (!config.googlePhotosAlbumId) throw new Error('No album ID configured.');
        await loadGapiClient();
        await authenticateWithGoogle();

        photoUrls = await fetchPhotosFromGoogleAlbum(config.googlePhotosAlbumId);
        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();
    } catch {
        const response = await fetch('offline-data/photos.json');
        photoUrls = await response.json();
        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();
    }
}

function renderPhoto(photoUrl) {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = `<img src="${photoUrl}" alt="Family Photo" style="width:90%; max-width:600px; border-radius:20px; box-shadow:0 4px 8px rgba(0,0,0,0.2);">`;
}

function startPhotoRotation() {
    if (photoTimer) clearInterval(photoTimer);
    photoTimer = setInterval(() => {
        currentPhotoIndex = (currentPhotoIndex + 1) % photoUrls.length;
        renderPhoto(photoUrls[currentPhotoIndex]);
    }, (config.photoRotationIntervalSeconds || 10) * 1000);
}

// --- Weather Forecast ---
async function loadWeatherForecast() {
    const weatherForecast = document.getElementById('weather-forecast');
    weatherForecast.innerHTML = '<p>Loading weather...</p>';

    try {
        const daily = await fetchWeatherForecast(config.latitude, config.longitude);
        renderWeather(daily);
    } catch {
        const response = await fetch('offline-data/weather.json');
        const offlineWeather = await response.json();
        renderWeather(offlineWeather);
    }
}

function renderWeather(daily) {
    const container = document.getElementById('weather-forecast');
    container.innerHTML = '';
    for (let i = 0; i < daily.time.length; i++) {
        const day = document.createElement('div');
        day.className = 'weather-day';
        day.innerHTML = `<strong>${daily.time[i]}</strong><br>Max: ${daily.temperature_2m_max[i]}°C, Min: ${daily.temperature_2m_min[i]}°C`;
        container.appendChild(day);
    }
}

// --- Calendar Events ---
async function loadCalendarEvents() {
    const calendarEvents = document.getElementById('calendar-events');
    const calendarLoginBtn = document.getElementById('calendar-login-btn');

    calendarEvents.innerHTML = '<p>Loading calendar events...</p>';

    try {
        const response = await fetch('offline-data/calendar.json');
        const offlineEvents = await response.json();
        renderCalendar(offlineEvents);
    } catch {
        calendarEvents.innerHTML = '<p>No events available.</p>';
    }

    try {
        await loadGapiClient();
        await authenticateWithGoogle();
        const events = await fetchGoogleCalendarEvents();
        renderCalendar(events);
        calendarLoginBtn.classList.add('hidden');
    } catch {
        calendarLoginBtn.classList.remove('hidden');
    }

    calendarLoginBtn.addEventListener('click', async () => {
        showSpinner();
        try {
            await authenticateWithGoogle();
            const events = await fetchGoogleCalendarEvents();
            renderCalendar(events);
            calendarLoginBtn.classList.add('hidden');
        } catch {
            calendarEvents.innerHTML = '<p>Login failed. Showing offline events.</p>';
        } finally {
            hideSpinner();
        }
    }, { once: true });
}

function renderCalendar(events) {
    const container = document.getElementById('calendar-events');
    container.innerHTML = '';
    events.sort((a, b) => new Date(a.start) - new Date(b.start));
    events.slice(0, 5).forEach(event => {
        const div = document.createElement('div');
        div.className = 'calendar-event';
        div.innerHTML = `<strong>${event.title}</strong><br><small>${new Date(event.start).toLocaleString(config.language || 'en')}</small>`;
        container.appendChild(div);
    });
}

// --- Admin Panel Login ---
// (Code will continue here for admin login, settings, etc...)

// --- Start ---
loadConfig();
