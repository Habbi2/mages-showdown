# Supabase Setup Instructions

## 1. Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Choose your organization and enter project details
4. Wait for the project to be created

## 2. Get Your Supabase Credentials

1. In your Supabase dashboard, go to Settings > API
2. Copy the following values:
   - **Project URL** (under "Project URL")
   - **Anon/public key** (under "Project API keys")

## 3. Configure the Game

1. Open `src/main.js`
2. Replace the placeholder values:
   ```javascript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Replace with your Project URL
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your anon key
   ```

## 4. Enable Real-time

1. In your Supabase dashboard, go to Settings > API
2. Make sure "Enable Realtime" is turned on
3. No additional table setup is needed - the game uses Supabase's broadcast feature

## 5. Test the Game

1. Run `npm run dev` to start the development server
2. Open multiple browser tabs to test multiplayer functionality
3. The connection status should show "Connected" in green

## 6. Deploy to Vercel

1. Push your code to a GitHub repository
2. Go to https://vercel.com and sign in
3. Click "New Project" and import your repository
4. Vercel will automatically detect the settings and deploy
5. Your game will be live at the provided URL

## Troubleshooting

- If you see "Connecting..." in red, check your Supabase credentials
- Make sure your Supabase project has real-time enabled
- Check the browser console for any error messages
