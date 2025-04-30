// script.js - Complete Standalone Version with All Fixes

// ===== DOM Elements =====
const elements = {
    header: document.getElementById('header'),
    datetime: document.getElementById('datetime'),
    spinner: document.getElementById('spinner'),
    messagesList: document.getElementById('messages-list'),
    todoList: document.getElementById('todo-list'),
    photoCarousel: document.getElementById('photo-carousel'),
    weatherForecast: document.getElementById('weather-forecast'),
    calendarEvents: document.getElementById('calendar-events'),
    calendarLoginBtn: document.getElementById('calendar-login-btn'),
    adminPanel: document.getElementById('admin-panel'),
    adminLogin: document.getElementById('admin-login'),
    adminSettings: document.getElementById('admin-settings'),
    adminLoginForm: document.getElementById('admin-login-form'),
    adminLogoutBtn: document.getElementById('admin-logout-btn')
};

// ===== Global State =====
const state = {
    googleToken: null,
    config: {
        googleClientId: '',
        googlePhotosAlbumId: '',
        latitude: 0,
        longitude: 0,
        photoRotationIntervalSeconds: 10,
        features: {
            weather: true,
            photos: true
        }
    },
    currentPhotoIndex: 0,
    photoUrls: [],
    photoTimer: null
};

// ===== Token Management =====
const tokenManager = {
    storeToken(token) {
        localStorage.setItem('googleToken', token);
        const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour expiration
        localStorage.setItem('googleTokenExpiresAt', expiresAt);
    },

    getStoredToken() {
        const token = localStorage.getItem('googleToken');
        const expiresAt = localStorage.getItem('googleTokenExpiresAt');
        
        if (!token || !expiresAt) return null;
        if (Date.now() > parseInt(expiresAt)) {
            this.clearToken();
            return null;
        }
        return token;
    },

    clearToken() {
        localStorage.removeItem('googleToken');
        localStorage.removeItem('googleTokenExpiresAt');
        state.googleToken = null;
    },

    async checkTokenValidity() {
        if (!state.googleToken) return false;
        
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
                headers: { 'Authorization': `Bearer ${state.googleToken}` }
            });
            return response.ok;
        } catch {
            return false;
        }
    }
};

// ===== Authentication =====
const auth = {
    async authenticate() {
        const storedToken = tokenManager.getStoredToken();
        if (storedToken) {
            state.googleToken = storedToken;
            return { access_token: storedToken };
        }

        return new Promise((resolve, reject) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: state.config.googleClientId,
                scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly',
                callback: (response) => {
                    if (response.error) return reject(response.error);
                    state.googleToken = response.access_token;
                    tokenManager.storeToken(response.access_token);
                    resolve(response);
                },
                error_callback: (error) => reject(error)
            });
            client.requestAccessToken();
        });
    },

    async logout() {
        if (state.googleToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${state.googleToken}`, {
                    method: 'POST'
                });
            } finally {
                tokenManager.clearToken();
                location.reload();
            }
        }
    }
};

// ===== API Utilities =====
const api = {
    async fetchWithAuth(url, options = {}) {
        if (!state.googleToken || !(await tokenManager.checkTokenValidity())) {
            await auth.authenticate();
        }
        
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${state.googleToken}`;
        
        const response = await fetch(url, options);
        if (response.status === 401) {
            tokenManager.clearToken();
            await auth.authenticate();
            options.headers['Authorization'] = `Bearer ${state.googleToken}`;
            return await fetch(url, options);
        }
        return response;
    },

    async fetchGooglePhotos(albumId) {
        if (!albumId) throw new Error('No album ID configured');
        
        // Verify album exists
        const albumResponse = await this.fetchWithAuth(
            `https://photoslibrary.googleapis.com/v1/albums/${albumId}`
        );
        
        if (!albumResponse.ok) {
            const error = await albumResponse.json();
            throw new Error(error.error?.message || 'Album not found');
        }

        // Fetch media items
        const mediaResponse = await this.fetchWithAuth(
            'https://photoslibrary.googleapis.com/v1/mediaItems:search',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    albumId: albumId,
                    pageSize: 50,
                    filters: {
                        mediaTypeFilter: { mediaTypes: ["PHOTO"] }
                    }
                })
            }
        );

        if (!mediaResponse.ok) {
            const error = await mediaResponse.json();
            throw new Error(error.error?.message || 'Failed to fetch photos');
        }

        const data = await mediaResponse.json();
        return data.mediaItems?.map(item => item.baseUrl) || [];
    },

    async fetchCalendarEvents() {
        const now = new Date();
        const end = new Date();
        end.setDate(now.getDate() + 7); // Next 7 days

        const response = await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            `timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&` +
            `orderBy=startTime&singleEvents=true`
        );

        if (!response.ok) throw new Error('Failed to fetch calendar events');

        const data = await response.json();
        return data.items.map(event => ({
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date
        }));
    }
};

// ===== Dashboard Functions =====
const dashboard = {
    async loadConfig() {
        try {
            // Try to load from localStorage first
            const savedConfig = localStorage.getItem('dashboardConfig');
            if (savedConfig) {
                state.config = { ...state.config, ...JSON.parse(savedConfig) };
            }

            // Then try to load from server
            const response = await fetch('./config/config.json');
            if (response.ok) {
                const serverConfig = await response.json();
                state.config = { ...state.config, ...serverConfig };
                localStorage.setItem('dashboardConfig', JSON.stringify(serverConfig));
            }
        } catch (error) {
            console.warn('Config load failed, using defaults:', error);
        }
    },

    initialize() {
        this.updateClock();
        setInterval(this.updateClock, 1000);
        
        this.loadFamilyMessages();
        this.loadTodoList();
        this.loadPhotos();
        this.loadWeather();
        this.loadCalendar();

        // Check token every 5 minutes
        setInterval(() => tokenManager.checkTokenValidity(), 5 * 60 * 1000);
    },

    updateClock() {
        const now = new Date();
        elements.datetime.textContent = now.toLocaleString('en-GB', { 
            dateStyle: 'short', 
            timeStyle: 'short' 
        });
    },

    async loadFamilyMessages() {
        elements.messagesList.innerHTML = '<p>Loading messages...</p>';
        
        try {
            // Simulated data - replace with actual API call
            const messages = ["Remember family dinner tonight!", "Don't forget to water the plants"];
            this.renderMessages(messages);
        } catch {
            elements.messagesList.innerHTML = '<p>Could not load messages</p>';
        }
    },

    renderMessages(messages) {
        elements.messagesList.innerHTML = '';
        messages.forEach(msg => {
            const p = document.createElement('p');
            p.textContent = msg;
            elements.messagesList.appendChild(p);
        });
    },

    async loadTodoList() {
        elements.todoList.innerHTML = '<p>Loading to-do list...</p>';
        
        try {
            // Simulated data - replace with actual API call
            const todos = ["Buy groceries", "Schedule dentist appointment"];
            this.renderTodos(todos);
        } catch {
            elements.todoList.innerHTML = '<p>Could not load to-do list</p>';
        }
    },

    renderTodos(todos) {
        elements.todoList.innerHTML = '';
        todos.forEach(task => {
            const div = document.createElement('div');
            div.textContent = `• ${task}`;
            elements.todoList.appendChild(div);
        });
    },

    async loadPhotos() {
        elements.photoCarousel.innerHTML = '<p>Loading photos...</p>';
        
        try {
            if (!state.config.googlePhotosAlbumId) throw new Error('No album configured');
            await auth.authenticate();
            state.photoUrls = await api.fetchGooglePhotos(state.config.googlePhotosAlbumId);
            
            if (state.photoUrls.length === 0) throw new Error('No photos found');
            
            this.renderPhoto(state.photoUrls[state.currentPhotoIndex]);
            this.startPhotoRotation();
        } catch (error) {
            console.error('Photo load failed:', error);
            // Fallback to placeholder
            state.photoUrls = ['https://via.placeholder.com/600x400?text=Family+Photo'];
            this.renderPhoto(state.photoUrls[0]);
        }
    },

    renderPhoto(url) {
        elements.photoCarousel.innerHTML = `
            <img src="${url}" 
                 alt="Family Photo" 
                 style="width:90%; max-width:600px; border-radius:20px; box-shadow:0 4px 8px rgba(0,0,0,0.2);"
                 onerror="this.onerror=null;this.src='https://via.placeholder.com/600x400?text=Photo+Error'">
        `;
    },

    startPhotoRotation() {
        if (state.photoTimer) clearInterval(state.photoTimer);
        if (state.photoUrls.length <= 1) return;
        
        state.photoTimer = setInterval(() => {
            state.currentPhotoIndex = (state.currentPhotoIndex + 1) % state.photoUrls.length;
            this.renderPhoto(state.photoUrls[state.currentPhotoIndex]);
        }, state.config.photoRotationIntervalSeconds * 1000);
    },

    async loadWeather() {
        elements.weatherForecast.innerHTML = '<p>Loading weather...</p>';
        
        try {
            // Simulated data - replace with actual API call
            const forecast = {
                time: ["Today", "Tomorrow", "Day After"],
                temperature_2m_max: [22, 24, 20],
                temperature_2m_min: [15, 16, 14]
            };
            this.renderWeather(forecast);
        } catch {
            elements.weatherForecast.innerHTML = '<p>Weather unavailable</p>';
        }
    },

    renderWeather(daily) {
        elements.weatherForecast.innerHTML = '';
        for (let i = 0; i < daily.time.length; i++) {
            const day = document.createElement('div');
            day.className = 'weather-day';
            day.innerHTML = `<strong>${daily.time[i]}</strong><br>Max: ${daily.temperature_2m_max[i]}°C, Min: ${daily.temperature_2m_min[i]}°C`;
            elements.weatherForecast.appendChild(day);
        }
    },

    async loadCalendar() {
        elements.calendarEvents.innerHTML = '<p>Loading calendar...</p>';
        
        try {
            await auth.authenticate();
            const events = await api.fetchCalendarEvents();
            this.renderCalendar(events);
            if (elements.calendarLoginBtn) elements.calendarLoginBtn.classList.add('hidden');
        } catch (error) {
            console.error('Calendar load failed:', error);
            if (elements.calendarLoginBtn) elements.calendarLoginBtn.classList.remove('hidden');
            elements.calendarEvents.innerHTML = '<p>Calendar unavailable</p>';
        }
    },

    renderCalendar(events) {
        elements.calendarEvents.innerHTML = '';
        events.slice(0, 5).forEach(event => {
            const div = document.createElement('div');
            div.className = 'calendar-event';
            div.innerHTML = `
                <strong>${event.title}</strong><br>
                <small>${new Date(event.start).toLocaleString()}</small>
            `;
            elements.calendarEvents.appendChild(div);
        });
    }
};

// ===== Initialize Application =====
document.addEventListener('DOMContentLoaded', async () => {
    await dashboard.loadConfig();
    dashboard.initialize();
    
    // Set up login button if it exists
    if (elements.calendarLoginBtn) {
        elements.calendarLoginBtn.addEventListener('click', () => {
            dashboard.loadCalendar();
        });
    }
    
    // Set up admin logout if button exists
    if (elements.adminLogoutBtn) {
        elements.adminLogoutBtn.addEventListener('click', auth.logout);
    }
});