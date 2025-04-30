// script.js - Updated with GIS implementation

// --- DOM Elements ---
const adminPanel = document.getElementById('admin-panel');
const adminLogin = document.getElementById('admin-login');
const adminSettings = document.getElementById('admin-settings');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const adminLoginError = document.getElementById('admin-login-error');
const adminLoginForm = document.getElementById('admin-login-form');
const calendarLoginBtn = document.getElementById('calendar-login-btn');

// --- Google Auth Variables ---
let googleToken = null;
let config = {};
let currentPhotoIndex = 0;
let photoUrls = [];
let photoTimer = null;

// --- Import helper APIs ---
import { fetchGoogleSheet, fetchWeatherForecast } from './utils/api.js';

// --- Load Config ---
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

// --- Initialize Dashboard ---
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

// --- Clock Handling ---
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

// --- Google Authentication ---
async function authenticateWithGoogle() {
    return new Promise((resolve, reject) => {
        if (googleToken) {
            resolve(googleToken);
            return;
        }

        const client = google.accounts.oauth2.initTokenClient({
            client_id: config.googleClientId,
            scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly',
            callback: (response) => {
                if (response.error) {
                    reject(response.error);
                    return;
                }
                googleToken = response.access_token;
                resolve(response);
            },
            error_callback: (error) => {
                reject(error);
            }
        });

        client.requestAccessToken();
    });
}

// --- Photos Carousel ---
async function loadPhotos() {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = '<p>Loading photos...</p>';

    try {
        if (!config.googlePhotosAlbumId) throw new Error('No album ID configured.');
        
        await authenticateWithGoogle();
        photoUrls = await fetchPhotosFromGoogleAlbum(config.googlePhotosAlbumId);
        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();
    } catch (error) {
        console.error('Error loading photos:', error);
        const response = await fetch('offline-data/photos.json');
        photoUrls = await response.json();
        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();
    }
}

async function fetchPhotosFromGoogleAlbum(albumId) {
    if (!googleToken) {
        await authenticateWithGoogle();
    }

    // First get the album's media items
    const mediaItemsResponse = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            albumId: albumId,
            pageSize: 50
        })
    });

    if (!mediaItemsResponse.ok) {
        throw new Error('Failed to fetch media items');
    }

    const mediaItemsData = await mediaItemsResponse.json();
    return mediaItemsData.mediaItems.map(item => item.baseUrl);
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
    calendarEvents.innerHTML = '<p>Loading calendar events...</p>';

    try {
        const response = await fetch('offline-data/calendar.json');
        const offlineEvents = await response.json();
        renderCalendar(offlineEvents);
    } catch {
        calendarEvents.innerHTML = '<p>No events available.</p>';
    }

    try {
        await authenticateWithGoogle();
        const events = await fetchGoogleCalendarEvents();
        renderCalendar(events);
        calendarLoginBtn.classList.add('hidden');
    } catch {
        calendarLoginBtn.classList.remove('hidden');
    }
}

// Fetch Google Calendar events with token refresh
async function fetchWithTokenRefresh(url, options = {}) {
    if (!googleToken) {
        await authenticateWithGoogle();
    }
    
    try {
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${googleToken}`;
        
        const response = await fetch(url, options);
        
        // If unauthorized, try refreshing token once
        if (response.status === 401) {
            clearStoredGoogleToken();
            await authenticateWithGoogle();
            options.headers['Authorization'] = `Bearer ${googleToken}`;
            return await fetch(url, options);
        }
        
        return response;
    } catch (error) {
        throw error;
    }
}

// Fetch Google Calendar events
async function fetchGoogleCalendarEvents() {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 7);

    const response = await fetchWithTokenRefresh(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&` +
        `orderBy=startTime&singleEvents=true`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
    }

    const data = await response.json();
    return data.items.map(event => ({
        title: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date
    }));
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

// --- Calendar Login Button Handler ---
calendarLoginBtn.addEventListener('click', async () => {
    showSpinner();
    try {
        await authenticateWithGoogle();
        const events = await fetchGoogleCalendarEvents();
        renderCalendar(events);
        calendarLoginBtn.classList.add('hidden');
    } catch (error) {
        console.error('Google authentication failed:', error);
        calendarEvents.innerHTML = '<p>Login failed. Showing offline events.</p>';
    } finally {
        hideSpinner();
    }
});

// --- Spinner Control ---
function showSpinner() {
    document.getElementById('spinner').classList.remove('hidden');
}

function hideSpinner() {
    document.getElementById('spinner').classList.add('hidden');
}

// --- Admin Settings ---
function loadAdminSettingsUI() {
    const savedSettings = JSON.parse(localStorage.getItem('familyDashboardSettings') || '{}');

    if (savedSettings.language) document.getElementById('setting-language').value = savedSettings.language;
    if (savedSettings.theme) document.getElementById('setting-theme').value = savedSettings.theme;
    if (savedSettings.refreshIntervalMinutes) document.getElementById('setting-refresh-interval').value = savedSettings.refreshIntervalMinutes;
    if (savedSettings.features) {
        document.getElementById('setting-weather').checked = savedSettings.features.weather;
        document.getElementById('setting-photos').checked = savedSettings.features.photos;
    }
}

// Add these functions to handle token storage
function storeGoogleToken(token) {
    localStorage.setItem('googleToken', token);
    // Store expiration time (1 hour from now)
    const expiresAt = new Date().getTime() + (60 * 60 * 1000);
    localStorage.setItem('googleTokenExpiresAt', expiresAt);
}

// Check if the token is expired
function getStoredGoogleToken() {
    const token = localStorage.getItem('googleToken');
    const expiresAt = localStorage.getItem('googleTokenExpiresAt');
    
    if (!token || !expiresAt) return null;
    
    // Check if token is still valid
    if (new Date().getTime() > parseInt(expiresAt)) {
        clearStoredGoogleToken();
        return null;
    }
    
    return token;
}

// Clear stored token and expiration time
function clearStoredGoogleToken() {
    localStorage.removeItem('googleToken');
    localStorage.removeItem('googleTokenExpiresAt');
}

// Modify your authenticateWithGoogle function
async function authenticateWithGoogle() {
    // Check for valid stored token first
    const storedToken = getStoredGoogleToken();
    if (storedToken) {
        googleToken = storedToken;
        return { access_token: storedToken };
    }

    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: config.googleClientId,
            scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly',
            callback: (response) => {
                if (response.error) {
                    reject(response.error);
                    return;
                }
                googleToken = response.access_token;
                storeGoogleToken(response.access_token);
                resolve(response);
            },
            error_callback: (error) => {
                reject(error);
            }
        });

        client.requestAccessToken();
    });
}

// Add a token refresh check (call this periodically)
async function checkTokenValidity() {
    if (!googleToken) return;
    
    try {
        // Simple check by making a lightweight API call
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
            headers: { 'Authorization': `Bearer ${googleToken}` }
        });
        
        if (!response.ok) {
            clearStoredGoogleToken();
            googleToken = null;
        }
    } catch (error) {
        clearStoredGoogleToken();
        googleToken = null;
    }
}

// Call this on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    // Check token every 5 minutes
    setInterval(checkTokenValidity, 5 * 60 * 1000);
});

// Check if the token is expired
function logoutGoogle() {
    if (googleToken) {
        // Revoke the token with Google
        const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${googleToken}`;
        fetch(revokeUrl, { method: 'POST' })
            .then(() => {
                clearStoredGoogleToken();
                googleToken = null;
                // Reload the page or update UI as needed
                location.reload();
            })
            .catch(console.error);
    }
}

// Add to your admin panel logout button
if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
        logoutGoogle();
        adminPanel.classList.add('hidden');
    });
}

// --- Start ---
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
});