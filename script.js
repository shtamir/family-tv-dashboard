// script.js - Complete Production Version

// DOM Elements
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

// Application State
const state = {
    googleToken: null,
    config: {},
    currentPhotoIndex: 0,
    photoUrls: [],
    photoTimer: null
};

// Token Management
const tokenManager = {
    storeToken(token) {
        localStorage.setItem('googleToken', token);
        const expiresAt = Date.now() + 3600000; // 1 hour expiration
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

    async validateToken() {
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

// Authentication Service
const authService = {
    async authenticate() {
        const storedToken = tokenManager.getStoredToken();
        if (storedToken) {
            state.googleToken = storedToken;
            return { access_token: storedToken };
        }

        return new Promise((resolve, reject) => {
            if (!window.google) {
                return reject(new Error('Google auth client not loaded'));
            }

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
            } catch (error) {
                console.error('Logout error:', error);
            } finally {
                tokenManager.clearToken();
                window.location.reload();
            }
        }
    }
};

// API Service
const apiService = {
    async fetchWithAuth(url, options = {}) {
        if (!state.googleToken || !(await tokenManager.validateToken())) {
            await authService.authenticate();
        }
        
        const headers = {
            'Authorization': `Bearer ${state.googleToken}`,
            ...(options.headers || {})
        };
        
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            tokenManager.clearToken();
            await authService.authenticate();
            headers['Authorization'] = `Bearer ${state.googleToken}`;
            return await fetch(url, { ...options, headers });
        }
        
        return response;
    },

    async fetchGoogleSheet(sheetName) {
        try {
            const response = await fetch(`${state.config.sheetsApiUrl}?sheet=${encodeURIComponent(sheetName)}`);
            if (!response.ok) throw new Error('Sheet fetch failed');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch sheet:', error);
            throw error;
        }
    },

    async fetchWeatherForecast(lat, lon) {
        try {
            const response = await fetch(`${state.config.weatherApiUrl}?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('Weather fetch failed');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch weather:', error);
            throw error;
        }
    },

    async fetchGooglePhotos(albumId) {
        if (!albumId) throw new Error('Missing album ID');
        
        try {
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
                throw new Error(error.error?.message || 'Photo fetch failed');
            }

            const data = await mediaResponse.json();
            return data.mediaItems?.map(item => item.baseUrl) || [];
        } catch (error) {
            console.error('Google Photos API error:', error);
            throw error;
        }
    },

    async fetchCalendarEvents() {
        try {
            const now = new Date();
            const end = new Date();
            end.setDate(now.getDate() + 7);

            const response = await this.fetchWithAuth(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
                `timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&` +
                `orderBy=startTime&singleEvents=true`
            );

            if (!response.ok) throw new Error('Calendar fetch failed');

            const data = await response.json();
            return data.items.map(event => ({
                title: event.summary,
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date
            }));
        } catch (error) {
            console.error('Calendar API error:', error);
            throw error;
        }
    }
};

// UI Components
const uiComponents = {
    showSpinner() {
        elements.spinner.classList.remove('hidden');
    },

    hideSpinner() {
        elements.spinner.classList.add('hidden');
    },

    updateClock() {
        const now = new Date();
        elements.datetime.textContent = now.toLocaleString('en-GB', { 
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    renderMessages(messages) {
        elements.messagesList.innerHTML = '';
        messages.forEach(msg => {
            const element = document.createElement('div');
            element.className = 'message-item';
            element.textContent = msg;
            elements.messagesList.appendChild(element);
        });
    },

    renderTodos(todos) {
        elements.todoList.innerHTML = '';
        todos.forEach(task => {
            const element = document.createElement('div');
            element.className = 'todo-item';
            element.innerHTML = `<span class="bullet">•</span> ${task}`;
            elements.todoList.appendChild(element);
        });
    },

    renderPhoto(url) {
        elements.photoCarousel.innerHTML = `
            <div class="photo-container">
                <img src="${url}" 
                     alt="Family photo" 
                     class="family-photo"
                     onerror="this.onerror=null;this.classList.add('photo-error')">
            </div>
        `;
    },

    renderWeather(forecast) {
        elements.weatherForecast.innerHTML = '';
        forecast.daily.time.forEach((day, index) => {
            const element = document.createElement('div');
            element.className = 'weather-day';
            element.innerHTML = `
                <div class="weather-day-name">${new Date(day).toLocaleDateString('en', { weekday: 'short' })}</div>
                <div class="weather-temp-max">${Math.round(forecast.daily.temperature_2m_max[index])}°</div>
                <div class="weather-temp-min">${Math.round(forecast.daily.temperature_2m_min[index])}°</div>
            `;
            elements.weatherForecast.appendChild(element);
        });
    },

    renderCalendar(events) {
        elements.calendarEvents.innerHTML = '';
        if (events.length === 0) {
            elements.calendarEvents.innerHTML = '<p>No upcoming events</p>';
            return;
        }

        events.slice(0, 5).forEach(event => {
            const element = document.createElement('div');
            element.className = 'calendar-event';
            element.innerHTML = `
                <div class="event-title">${event.title}</div>
                <div class="event-time">
                    ${new Date(event.start).toLocaleString('en', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
            `;
            elements.calendarEvents.appendChild(element);
        });
    }
};

// Dashboard Controller
const dashboardController = {
    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.initializeModules();
    },

    async loadConfig() {
        try {
            // Try to load from localStorage first
            const savedConfig = localStorage.getItem('dashboardConfig');
            if (savedConfig) {
                state.config = JSON.parse(savedConfig);
            }

            // Then load from server
            const response = await fetch('/config.json');
            if (response.ok) {
                const serverConfig = await response.json();
                state.config = { ...serverConfig, ...state.config };
                localStorage.setItem('dashboardConfig', JSON.stringify(serverConfig));
            }
        } catch (error) {
            console.error('Config load failed:', error);
        }
    },

    setupEventListeners() {
        // Clock update
        setInterval(uiComponents.updateClock, 1000);
        
        // Calendar login button
        if (elements.calendarLoginBtn) {
            elements.calendarLoginBtn.addEventListener('click', () => {
                this.loadCalendarData();
            });
        }

        // Admin logout
        if (elements.adminLogoutBtn) {
            elements.adminLogoutBtn.addEventListener('click', () => {
                authService.logout();
            });
        }

        // Token validation check every 5 minutes
        setInterval(() => tokenManager.validateToken(), 300000);
    },

    initializeModules() {
        uiComponents.updateClock();
        this.loadMessagesData();
        this.loadTodoData();
        this.loadPhotosData();
        this.loadWeatherData();
        this.loadCalendarData();
    },

    async loadMessagesData() {
        try {
            uiComponents.showSpinner();
            const messages = await apiService.fetchGoogleSheet('Messages');
            uiComponents.renderMessages(messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
            elements.messagesList.innerHTML = '<p class="error-message">Messages unavailable</p>';
        } finally {
            uiComponents.hideSpinner();
        }
    },

    async loadTodoData() {
        try {
            const todos = await apiService.fetchGoogleSheet('ToDo');
            uiComponents.renderTodos(todos);
        } catch (error) {
            console.error('Failed to load todos:', error);
            elements.todoList.innerHTML = '<p class="error-message">To-do list unavailable</p>';
        }
    },

    async loadPhotosData() {
        if (!state.config.googlePhotosAlbumId) {
            elements.photoCarousel.innerHTML = '<p class="error-message">Photo album not configured</p>';
            return;
        }

        try {
            uiComponents.showSpinner();
            state.photoUrls = await apiService.fetchGooglePhotos(state.config.googlePhotosAlbumId);
            
            if (state.photoUrls.length === 0) {
                throw new Error('No photos found in album');
            }
            
            uiComponents.renderPhoto(state.photoUrls[state.currentPhotoIndex]);
            this.startPhotoRotation();
        } catch (error) {
            console.error('Failed to load photos:', error);
            elements.photoCarousel.innerHTML = '<p class="error-message">Photos unavailable</p>';
        } finally {
            uiComponents.hideSpinner();
        }
    },

    startPhotoRotation() {
        if (state.photoTimer) clearInterval(state.photoTimer);
        if (state.photoUrls.length <= 1) return;
        
        state.photoTimer = setInterval(() => {
            state.currentPhotoIndex = (state.currentPhotoIndex + 1) % state.photoUrls.length;
            uiComponents.renderPhoto(state.photoUrls[state.currentPhotoIndex]);
        }, state.config.photoRotationIntervalSeconds * 1000);
    },

    async loadWeatherData() {
        if (!state.config.latitude || !state.config.longitude) {
            elements.weatherForecast.innerHTML = '<p class="error-message">Location not configured</p>';
            return;
        }

        try {
            const forecast = await apiService.fetchWeatherForecast(
                state.config.latitude,
                state.config.longitude
            );
            uiComponents.renderWeather(forecast);
        } catch (error) {
            console.error('Failed to load weather:', error);
            elements.weatherForecast.innerHTML = '<p class="error-message">Weather unavailable</p>';
        }
    },

    async loadCalendarData() {
        try {
            uiComponents.showSpinner();
            const events = await apiService.fetchCalendarEvents();
            uiComponents.renderCalendar(events);
            if (elements.calendarLoginBtn) {
                elements.calendarLoginBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to load calendar:', error);
            if (elements.calendarLoginBtn) {
                elements.calendarLoginBtn.classList.remove('hidden');
            }
            elements.calendarEvents.innerHTML = '<p class="error-message">Calendar unavailable</p>';
        } finally {
            uiComponents.hideSpinner();
        }
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    dashboardController.init();
});