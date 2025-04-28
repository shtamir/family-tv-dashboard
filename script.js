// script.js
//import { fetchGoogleSheet, fetchWeatherForecast, fetchPhotosFromAlbum } from './utils/api.js';
import { fetchGoogleSheet, fetchWeatherForecast, fetchPhotosFromGoogleAlbum } from './utils/api.js';


let config = {};

async function loadConfig() {
    // First, try to load config from localStorage
    const cachedConfig = localStorage.getItem('familyDashboardConfig');
    if (cachedConfig) {
        try {
            config = JSON.parse(cachedConfig);
            console.log('Loaded config from localStorage');
            initializeDashboard();
            return; // If loaded from cache, skip fetch
        } catch (e) {
            console.warn('Invalid cached config, will refetch.');
        }
    }

    // Otherwise, fetch from network
    try {
        const response = await fetch('./config/config.json');
        if (!response.ok) throw new Error('config.json not found');
        config = await response.json();
        console.log('Loaded config.json from server');

        // Save to localStorage for next time
        localStorage.setItem('familyDashboardConfig', JSON.stringify(config));

    } catch (error) {
        console.warn('Main config.json failed, trying default-config.json...', error);

        try {
            const responseDefault = await fetch('default-config.json');
            if (!responseDefault.ok) throw new Error('default-config.json not found');
            config = await responseDefault.json();
            console.log('Loaded default-config.json from server');

            // Save to localStorage too
            localStorage.setItem('familyDashboardConfig', JSON.stringify(config));

        } catch (errorDefault) {
            console.error('Both config.json and default-config.json failed.', errorDefault);
            alert('Failed to load configuration. Please check your internet connection or contact support.');
            return;
        }
    }

    // Merge saved Admin Settings if exist
    const savedSettings = JSON.parse(localStorage.getItem('familyDashboardSettings') || '{}');
    config = { ...config, ...savedSettings, features: { ...config.features, ...savedSettings.features } };

    // Apply selected theme
    if (config.theme) {
        const themeLink = document.getElementById('theme-style');
        themeLink.href = `themes/${config.theme}.css`;
    }


    initializeDashboard();
}


// --- Clock Handling ---
function updateClock() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('datetime').textContent = `${day}.${month}.${year} - ${hours}:${minutes}`;
}

// Update clock every minute
setInterval(updateClock, 1000);
updateClock(); // Call immediately on load

async function loadFamilyMessages() {
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = '<p>Loading messages...</p>';

    try {
        if (!config.sheetId) throw new Error('No sheetId configured.');
        const rows = await fetchGoogleSheet('Messages', config);

        renderMessages(rows);
    } catch (error) {
        console.warn('Failed to fetch from Google Sheets. Trying offline data...', error);

        try {
            const response = await fetch('offline-data/messages.json');
            if (!response.ok) throw new Error('Offline messages.json not found');
            const offlineMessages = await response.json();

            renderMessages(offlineMessages.map(msg => [msg]));

        } catch (offlineError) {
            console.error('Failed to load offline messages.', offlineError);
            messagesList.innerHTML = '<p>No messages available.</p>';
        }
    }
}

function renderMessages(rows) {
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = '';

    rows.forEach(([message]) => {
        const p = document.createElement('p');
        p.textContent = message;
        messagesList.appendChild(p);
    });
}



async function loadTodoList() {
    const todoList = document.getElementById('todo-list');
    todoList.innerHTML = '<p>Loading to-do list...</p>';

    try {
        if (!config.sheetId) throw new Error('No sheetId configured.');
        const rows = await fetchGoogleSheet('ToDo', config);

        renderTodos(rows);
    } catch (error) {
        console.warn('Failed to fetch To-Do from Google Sheets. Trying offline data...', error);

        try {
            const response = await fetch('offline-data/todos.json');
            if (!response.ok) throw new Error('Offline todos.json not found');
            const offlineTodos = await response.json();

            renderTodos(offlineTodos.map(todo => [todo]));

        } catch (offlineError) {
            console.error('Failed to load offline to-do list.', offlineError);
            todoList.innerHTML = '<p>No to-do items available.</p>';
        }
    }
}

function renderTodos(rows) {
    const todoList = document.getElementById('todo-list');
    todoList.innerHTML = '';

    rows.forEach(([task]) => {
        const li = document.createElement('div');
        li.textContent = '• ' + task;
        todoList.appendChild(li);
    });
}


let currentPhotoIndex = 0;
let photoUrls = [];
let photoTimer = null;

async function loadPhotos() {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = '<p>Loading photos...</p>';

    try {
        if (!config.googlePhotosAlbumId) throw new Error('No album ID configured.');

        await loadGapiClient();
        await authenticateWithGoogle(); // try silent first

        photoUrls = await fetchPhotosFromGoogleAlbum(config.googlePhotosAlbumId);

        if (photoUrls.length === 0) {
            throw new Error('No photos found in album.');
        }

        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();

    } catch (error) {
        console.warn('Failed to load Google Photos, trying offline...', error);

        try {
            const response = await fetch('offline-data/photos.json');
            if (!response.ok) throw new Error('Offline photos.json not found');
            photoUrls = await response.json();

            if (photoUrls.length === 0) {
                photoCarousel.innerHTML = '<p>No photos available.</p>';
                return;
            }

            renderPhoto(photoUrls[currentPhotoIndex]);
            startPhotoRotation();

        } catch (offlineError) {
            console.error('Failed to load offline photos.', offlineError);
            photoCarousel.innerHTML = '<p>No photos available.</p>';
        }
    }
}


function renderPhoto(photoUrl) {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = `
        <img src="${photoUrl}" alt="Family Photo" style="width:90%; max-width:600px; border-radius:20px; box-shadow:0 4px 8px rgba(0,0,0,0.2);">
    `;
}

function startPhotoRotation() {
    if (photoTimer) clearInterval(photoTimer);

    photoTimer = setInterval(() => {
        currentPhotoIndex = (currentPhotoIndex + 1) % photoUrls.length;
        renderPhoto(photoUrls[currentPhotoIndex]);
    }, (config.photoRotationIntervalSeconds || 10) * 1000);
}


async function loadWeatherForecast() {
    const weatherForecast = document.getElementById('weather-forecast');
    weatherForecast.innerHTML = '<p>Loading weather...</p>';

    try {
        let latitude = config.latitude;
        let longitude = config.longitude;

        if (!latitude || !longitude) {
            console.log('No latitude/longitude in config. Fetching location from IP...');
            const response = await fetch('https://ipapi.co/json/');
            if (!response.ok) throw new Error('Failed to fetch location from IPAPI.');
            const locationData = await response.json();
            latitude = locationData.latitude;
            longitude = locationData.longitude;
            console.log(`Detected location: ${latitude}, ${longitude}`);
        }

        const daily = await fetchWeatherForecast(latitude, longitude);
        renderWeather(daily);

    } catch (error) {
        console.warn('Failed to fetch weather. Trying offline data...', error);

        try {
            const response = await fetch('offline-data/weather.json');
            if (!response.ok) throw new Error('Offline weather.json not found');
            const offlineWeather = await response.json();

            renderWeather(offlineWeather);

        } catch (offlineError) {
            console.error('Failed to load offline weather.', offlineError);
            weatherForecast.innerHTML = '<p>No weather information available.</p>';
        }
    }
}



function renderWeather(daily) {
    const weatherForecast = document.getElementById('weather-forecast');
    weatherForecast.innerHTML = '';

    const days = daily.time.length;

    for (let i = 0; i < days; i++) {
        const day = document.createElement('div');
        day.classList.add('weather-day');
        day.innerHTML = `
            <strong>${daily.time[i]}</strong><br>
            Max: ${daily.temperature_2m_max[i]}&deg;C, Min: ${daily.temperature_2m_min[i]}&deg;C
        `;
        weatherForecast.appendChild(day);
    }
}

async function detectLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error('Failed to fetch IP location');

        const data = await response.json();
        config.latitude = data.latitude;
        config.longitude = data.longitude;
        console.log(`Detected location: ${data.city} (${data.latitude}, ${data.longitude})`);

        // Save detected location to localStorage (optional optimization)
        localStorage.setItem('familyDashboardDetectedLocation', JSON.stringify({
            latitude: config.latitude,
            longitude: config.longitude
        }));

    } catch (error) {
        console.error('Failed to detect location automatically.', error);
        throw error;
    }
}

async function loadCalendarEvents() {
    const calendarEvents = document.getElementById('calendar-events');
    const calendarLoginBtn = document.getElementById('calendar-login-btn');

    calendarEvents.innerHTML = '<p>Loading calendar events...</p>';

    try {
        // Attempt silent login
        await loadGapiClient();
        await authenticateWithGoogle(); // silent login first

        // If silent login worked, fetch events
        const events = await fetchGoogleCalendarEvents();
        renderCalendar(events);

    } catch (error) {
        console.warn('Silent login failed or Google Calendar fetch error.', error);

        // Show offline fallback
        try {
            const response = await fetch('offline-data/calendar.json');
            if (!response.ok) throw new Error('Offline calendar.json not found');
            const offlineEvents = await response.json();

            renderCalendar(offlineEvents);

            // Show login button
            calendarLoginBtn.classList.remove('hidden');
        } catch (offlineError) {
            console.error('Failed to load offline calendar.', offlineError);
            calendarEvents.innerHTML = '<p>No events available.</p>';
        }
    }

    // Handle login button click
    calendarLoginBtn.addEventListener('click', async () => {
        calendarEvents.innerHTML = '<p>Connecting to Google Calendar...</p>';

        try {
            await authenticateWithGoogle(); // Force login
            const events = await fetchGoogleCalendarEvents();
            renderCalendar(events);

            // Hide login button after success
            calendarLoginBtn.classList.add('hidden');
        } catch (loginError) {
            console.error('Login to Google Calendar failed.', loginError);
            calendarEvents.innerHTML = '<p>Login failed. Showing offline events.</p>';
        }
    });
}



function renderCalendar(events) {
    const calendarEvents = document.getElementById('calendar-events');
    calendarEvents.innerHTML = '';

    // Sort by start time
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Show next 5 events
    events.slice(0, 5).forEach(event => {
        const div = document.createElement('div');
        div.classList.add('calendar-event');

        const startTime = new Date(event.start);
        const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const formattedStart = startTime.toLocaleString(config.language || 'en', options);

        div.innerHTML = `
            <strong>${event.title}</strong><br>
            <small>${formattedStart}</small>
        `;

        calendarEvents.appendChild(div);
    });
}


// --- Admin Panel ---
// Admin Panel logic
const adminPanel = document.getElementById('admin-panel');
const adminLogin = document.getElementById('admin-login');
const adminSettings = document.getElementById('admin-settings');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const adminLoginError = document.getElementById('admin-login-error');

// When user clicks "Admin" button
document.getElementById('open-admin').addEventListener('click', () => {
    adminPanel.classList.remove('hidden');
    adminLogin.classList.remove('hidden');
    adminSettings.classList.add('hidden');
});

// Handle login
adminLoginBtn.addEventListener('click', () => {
    const passwordInput = document.getElementById('admin-password').value;

    // Example: Hardcoded password for now (later from config or .env)
    const correctPassword = '1234'; // Change this later!

    if (passwordInput === correctPassword) {
        adminLogin.classList.add('hidden');
        adminSettings.classList.remove('hidden');
        adminLoginError.textContent = '';
    } else {
        adminLoginError.textContent = 'Incorrect password. Try again.';
    }
});

// Handle logout
adminLogoutBtn.addEventListener('click', () => {
    adminPanel.classList.add('hidden');
});


const adminSaveSettingsBtn = document.getElementById('admin-save-settings');

adminSaveSettingsBtn.addEventListener('click', () => {
    const newConfig = {
        language: document.getElementById('setting-language').value,
        theme: document.getElementById('setting-theme').value,
        refreshIntervalMinutes: parseInt(document.getElementById('setting-refresh-interval').value),
        features: {
            weather: document.getElementById('setting-weather').checked,
            photos: document.getElementById('setting-photos').checked
        }
    };

    // Save to localStorage
    localStorage.setItem('familyDashboardSettings', JSON.stringify(newConfig));

    alert('Settings saved! Reloading dashboard...');
    location.reload();
});

// When entering Admin Panel, load existing settings
function loadAdminSettingsUI() {
    const savedSettings = JSON.parse(localStorage.getItem('familyDashboardSettings') || '{}');

    if (savedSettings.language) {
        document.getElementById('setting-language').value = savedSettings.language;
    }
    if (savedSettings.theme) {
        document.getElementById('setting-theme').value = savedSettings.theme;
    }
    if (savedSettings.refreshIntervalMinutes) {
        document.getElementById('setting-refresh-interval').value = savedSettings.refreshIntervalMinutes;
    }
    if (savedSettings.features) {
        document.getElementById('setting-weather').checked = savedSettings.features.weather;
        document.getElementById('setting-photos').checked = savedSettings.features.photos;
    }
}


let gapiLoaded = false;
let gapiTokenClient = null;

// Load Google API client
function loadGapiClient() {
    return new Promise((resolve, reject) => {
        function checkGapiLoaded() {
            if (typeof gapi !== 'undefined') {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: config.googleApiKey,
                            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"]
                        });
                        gapiLoaded = true;
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            } else {
                // gapi is not ready yet, wait a little and try again
                setTimeout(checkGapiLoaded, 100);
            }
        }

        checkGapiLoaded();
    });
}


// Authenticate user
function authenticateWithGoogle() {
    return new Promise((resolve, reject) => {
        gapiTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: config.googleClientId,
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            prompt: '', // <- Important! No popup if possible
            callback: (tokenResponse) => {
                if (tokenResponse.error) {
                    console.warn('Silent login failed, trying interactive login...');
                    
                    // Silent login failed, now request interactive login
                    gapiTokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: config.googleClientId,
                        scope: 'https://www.googleapis.com/auth/calendar.readonly',
                        callback: (tokenResponseInteractive) => {
                            if (tokenResponseInteractive.error) {
                                reject(tokenResponseInteractive);
                            } else {
                                gapi.client.setToken(tokenResponseInteractive);
                                resolve();
                            }
                        }
                    });

                    gapiTokenClient.requestAccessToken({ prompt: 'consent' }); // Force popup
                } else {
                    gapi.client.setToken(tokenResponse);
                    resolve();
                }
            }
        });

        // Start silent login attempt
        gapiTokenClient.requestAccessToken({ prompt: '' });
    });
}


// Fetch events
async function fetchGoogleCalendarEvents() {
    try {
        await loadGapiClient();
        await authenticateWithGoogle();

        const now = new Date().toISOString();
        const response = await gapi.client.calendar.events.list({
            calendarId: 'primary',
            timeMin: now,
            showDeleted: false,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10
        });

        const events = response.result.items.map(event => ({
            title: event.summary || 'No Title',
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date
        }));

        return events;
    } catch (error) {
        console.error('Error fetching Google Calendar events:', error);
        throw error;
    }
}


// --- Initialize All Sections ---
function initializeDashboard() {
    // Hide Admin Panel on startup
    adminPanel.classList.add('hidden');
    adminLogin.classList.add('hidden');
    adminSettings.classList.add('hidden');
    adminPanel.style.display = "none";

    loadFamilyMessages();
    loadTodoList();
    loadPhotos();
    loadWeatherForecast();
    loadCalendarEvents();

    loadAdminSettingsUI(); // Load settings when entering Admin Panel
}

// Start
// Uncomment to clear localStorage and force reload
//localStorage.removeItem('familyDashboardConfig');
//location.reload();

loadConfig(); // Load configuration and initialize dashboard



// --- Remote Control: Manual Photo Switching ---
document.addEventListener('keydown', (event) => {
    if (!photoUrls.length) return; // No photos loaded yet

    if (event.key === 'ArrowRight') {
        nextPhoto();
    } else if (event.key === 'ArrowLeft') {
        previousPhoto();
    }
});

function nextPhoto() {
    currentPhotoIndex = (currentPhotoIndex + 1) % photoUrls.length;
    renderPhoto(photoUrls[currentPhotoIndex]);
    restartPhotoTimer();
}

function previousPhoto() {
    currentPhotoIndex = (currentPhotoIndex - 1 + photoUrls.length) % photoUrls.length;
    renderPhoto(photoUrls[currentPhotoIndex]);
    restartPhotoTimer();
}

function restartPhotoTimer() {
    if (photoTimer) clearInterval(photoTimer);
    startPhotoRotation();
}

document.getElementById('calendar-login-btn').addEventListener('click', async () => {
    const calendarEvents = document.getElementById('calendar-events');
    calendarEvents.innerHTML = '<p>Connecting to Google Calendar...</p>';

    try {
        await authenticateWithGoogle(); // <-- Now triggered by user click
        const events = await fetchGoogleCalendarEvents();
        renderCalendar(events);

        // Hide login button after success
        document.getElementById('calendar-login-btn').classList.add('hidden');

    } catch (loginError) {
        console.error('Login to Google Calendar failed.', loginError);
        calendarEvents.innerHTML = '<p>Login failed. Showing offline events.</p>';
    }
});
