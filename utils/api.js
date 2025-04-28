// utils/api.js

// --- Fetch Google Sheet ---
export async function fetchGoogleSheet(sheetName, config) {
    if (!config.sheetId) {
        throw new Error('Missing sheetId in config');
    }

    const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
    const response = await fetch(url);
    const text = await response.text();

    const json = JSON.parse(text.substring(47, text.length - 2));
    return json.table.rows.map(row => row.c.map(cell => cell?.v || ''));
}


// --- Fetch Weather Forecast ---
export async function fetchWeatherForecast(latitude, longitude) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch weather data');
    }

    const data = await response.json();
    return data.daily;
}

// --- Fetch Photos (Placeholder for future OAuth2 setup) ---
export async function fetchPhotosFromAlbum(albumId) {
    // TODO: Implement when OAuth2 setup is complete
    console.warn('fetchPhotosFromAlbum() is not implemented yet.');
    return [];
}

// --- Fetch Photos from Google Photos Album ---
export async function fetchPhotosFromGoogleAlbum(albumId) {
    if (!gapi.client.photoslibrary) {
        throw new Error('Google Photos API not initialized.');
    }

    const response = await gapi.client.photoslibrary.mediaItems.search({
        albumId: albumId,
        pageSize: 50 // Up to 50 photos
    });

    const items = response.result.mediaItems || [];

    const photoUrls = items.map(item => item.baseUrl);

    return photoUrls;
}
