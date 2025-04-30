// script.js - Complete Updated Version with All Fixes

// --- DOM Elements ---
const adminPanel = document.getElementById('admin-panel');
const adminLogin = document.getElementById('admin-login');
const adminSettings = document.getElementById('admin-settings');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const adminLoginError = document.getElementById('admin-login-error');
const adminLoginForm = document.getElementById('admin-login-form');
const calendarLoginBtn = document.getElementById('calendar-login-btn');

// --- Global Variables ---
let googleToken = null;
let config = {};
let currentPhotoIndex = 0;
let photoUrls = [];
let photoTimer = null;

// --- Token Management ---
function storeGoogleToken(token) {
    localStorage.setItem('googleToken', token);
    const expiresAt = new Date().getTime() + (60 * 60 * 1000); // 1 hour expiration
    localStorage.setItem('googleTokenExpiresAt', expiresAt);
}

function getStoredGoogleToken() {
    const token = localStorage.getItem('googleToken');
    const expiresAt = localStorage.getItem('googleTokenExpiresAt');
    
    if (!token || !expiresAt) return null;
    if (new Date().getTime() > parseInt(expiresAt)) {
        clearStoredGoogleToken();
        return null;
    }
    return token;
}

function clearStoredGoogleToken() {
    localStorage.removeItem('googleToken');
    localStorage.removeItem('googleTokenExpiresAt');
    googleToken = null;
}

// --- Authentication ---
async function authenticateWithGoogle() {
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

async function checkTokenValidity() {
    if (!googleToken) return;
    
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
            headers: { 'Authorization': `Bearer ${googleToken}` }
        });
        if (!response.ok) clearStoredGoogleToken();
    } catch (error) {
        clearStoredGoogleToken();
    }
}

function logoutGoogle() {
    if (googleToken) {
        fetch(`https://oauth2.googleapis.com/revoke?token=${googleToken}`, { 
            method: 'POST' 
        }).finally(() => {
            clearStoredGoogleToken();
            location.reload();
        });
    }
}

// --- API Helpers ---
async function fetchWithTokenRefresh(url, options = {}) {
    if (!googleToken) await authenticateWithGoogle();
    
    try {
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${googleToken}`;
        const response = await fetch(url, options);
        
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

// --- Photos Functions ---
async function fetchPhotosFromGoogleAlbum(albumId) {
    if (!albumId) {
        throw new Error('Google Photos album ID is not configured');
    }

    try {
        // First verify the album exists
        const albumResponse = await fetchWithTokenRefresh(
            `https://photoslibrary.googleapis.com/v1/albums/${albumId}`
        );
        
        if (!albumResponse.ok) {
            const error = await albumResponse.json();
            console.error('Album verification failed:', error);
            throw new Error('Failed to access photo album');
        }

        // Then fetch media items with proper request format
        const mediaResponse = await fetchWithTokenRefresh(
            'https://photoslibrary.googleapis.com/v1/mediaItems:search',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    albumId: albumId,
                    pageSize: 100,  // Increased from 50 for better coverage
                    filters: {
                        mediaTypeFilter: {
                            mediaTypes: ["PHOTO"]
                        },
                        includeArchivedMedia: false
                    }
                })
            }
        );

        if (!mediaResponse.ok) {
            const errorDetails = await mediaResponse.json();
            console.error('Photos API Error:', errorDetails);
            throw new Error(errorDetails.error?.message || 'Failed to fetch photos');
        }

        const data = await mediaResponse.json();
        return data.mediaItems?.map(item => item.baseUrl) || [];
    } catch (error) {
        console.error('Error in fetchPhotosFromGoogleAlbum:', error);
        throw error;
    }
}

async function loadPhotos() {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = '<p>Loading photos...</p>';

    try {
        if (!config.googlePhotosAlbumId) throw new Error('No album ID configured');
        
        await authenticateWithGoogle();
        photoUrls = await fetchPhotosFromGoogleAlbum(config.googlePhotosAlbumId);
        
        if (photoUrls.length === 0) throw new Error('No photos found in album');
        
        renderPhoto(photoUrls[currentPhotoIndex]);
        startPhotoRotation();
    } catch (error) {
        console.error('Error loading photos:', error);
        try {
            const response = await fetch('offline-data/photos.json');
            photoUrls = await response.json();
            renderPhoto(photoUrls[currentPhotoIndex]);
            startPhotoRotation();
        } catch (offlineError) {
            photoCarousel.innerHTML = '<p>Could not load photos</p>';
        }
    }
}

function renderPhoto(photoUrl) {
    const photoCarousel = document.getElementById('photo-carousel');
    photoCarousel.innerHTML = `
        <img src="${photoUrl}" 
             alt="Family Photo" 
             style="width:90%; max-width:600px; border-radius:20px; box-shadow:0 4px 8px rgba(0,0,0,0.2);"
             onerror="this.onerror=null;this.src='assets/placeholder-image.jpg'">
    `;
}

function startPhotoRotation() {
    if (photoTimer) clearInterval(photoTimer);
    if (photoUrls.length <= 1) return;
    
    photoTimer = setInterval(() => {
        currentPhotoIndex = (currentPhotoIndex + 1) % photoUrls.length;
        renderPhoto(photoUrls[currentPhotoIndex]);
    }, (config.photoRotationIntervalSeconds || 10) * 1000);
}

// [Rest of your existing functions (loadConfig, initializeDashboard, 
//  updateClock, loadFamilyMessages, loadTodoList, loadWeatherForecast, 
//  loadCalendarEvents, etc.) remain the same...]

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    setInterval(checkTokenValidity, 5 * 60 * 1000); // Check token every 5 minutes
    
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', logoutGoogle);
    }
});