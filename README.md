
# Family TV Dashboard 📺👨‍👩‍👧‍👦

A family dashboard web app designed for LG TV web browsers.
Displays family messages, to-do lists, weather forecasts, photos from Google Photos, and Google Calendar events.

---

## ✨ Features
- Family Messages (Google Sheets)
- To-Do List (Google Sheets)
- Family Photos (Google Photos Album - OAuth2.0)
- Weather Forecast (Auto-detect location via Open-Meteo)
- Admin Config Panel (theme, language, refresh rates)
- Multi-language Support (English and Hebrew)
- TV Remote compatible design

---

## 📂 Project Structure

/assets/weather/         # Weather icons
/config/config.json       # App configuration
/scripts/main.js          # Main JavaScript logic
/styles/admin.css         # Admin panel styles
/styles/style.css         # General styles
index.html                # Dashboard layout

---

## 🚀 Installation Instructions

1. Clone this repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/family-tv-dashboard.git
   cd family-tv-dashboard
   ```

2. Open `config/config.json` and **update**:

   | Key | What to do |
   |----|----|
   | `googleApiKey` | Your Google Sheets API key |
   | `googleClientId` | Your Google OAuth2 Client ID |
   | `googleRedirectUri` | Must match your deployed site (e.g., Netlify URL) |
   | `sheetId` | ID of your Google Sheet |
   | `googlePhotosAlbumId` | ID of your Google Photos Album (after OAuth) |

3. Deploy to Netlify / Vercel / your hosting provider.

4. Make sure you configure your OAuth Consent Screen and add yourself as a Test User.

---

## 🔑 Notes about API and Auth setup
- Google Sheets API must be enabled in Google Cloud Console.
- Google Photos Library API must be enabled.
- OAuth2.0 must be configured for Web Application with correct redirect URI.
- Your site domain must be added to OAuth authorized domains.

---

## 💬 Future Plans
- Add calendar event syncing
- Improve offline handling with service workers
- Add user-selectable themes and animations

---

## 📸 Credits
Weather icons are based on open license images.
Google Photos and Sheets integrations use public Google APIs.

---

Enjoy your Family TV Dashboard! 🎉
