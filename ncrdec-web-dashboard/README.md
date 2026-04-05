# NCRDEC Web Dashboard

A modern React + Vite web dashboard for monitoring coffee tree diseases and pests.

## Features

- **Dashboard**: View key metrics and statistics about tree health
- **Records**: Browse and search coffee tree monitoring records
- **Map**: Interactive map view of tagged trees on farms
- **Real-time Data**: Connected to Supabase for live data updates
- **Responsive Design**: Works on all screen sizes
- **No Authentication**: Direct access without login

## Project Structure

```
src/
├── pages/
│   ├── Dashboard.jsx
│   ├── Records.jsx
│   └── Map.jsx
├── components/
│   ├── Layout.jsx
│   ├── StatCard.jsx
│   └── Layout.css
├── lib/
│   └── supabase.js
├── App.jsx
├── main.jsx
└── index.css
```

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase
Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Get Supabase values from your [Supabase dashboard](https://supabase.com/dashboard). For the maps key, create a browser API key in Google Cloud and enable Maps JavaScript API.

### 3. Run Development Server
```bash
npm run dev
```

The dashboard will open at `http://localhost:3000`

## Building for Production

```bash
npm run build
```

The optimized build will be in the `dist/` folder.

## Next Steps for Enhancement

- [ ] Integrate Recharts for dashboard charts
- [ ] Enhance Google Maps markers and info windows
- [ ] Connect to real disease/pest detection models
- [ ] Add data export functionality (CSV, PDF)
- [ ] Implement farm filtering
- [ ] Add date range filtering for analytics
- [ ] Real-time data updates with WebSockets
- [ ] Dark mode support

## Tech Stack

- **Frontend**: React 18 + Vite
- **Routing**: React Router v6
- **Backend**: Supabase (PostgreSQL + Storage)
- **Charts**: Recharts (to be integrated)
- **Maps**: Google Maps (`@react-google-maps/api`)
- **Styling**: CSS3

## License

MIT
