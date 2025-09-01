# Mages Arena

A real-time multiplayer game where mages battle in a shrinking arena using fireballs to knock opponents out of the safe zone.

## Features

- Real-time multiplayer using Supabase
- Physics-based gameplay with Phaser.js
- Shrinking arena mechanics
- Fireball combat system with knockback
- Health system with ring damage
- Multiple rounds
- Neon visual style optimized for smooth gameplay

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Supabase:
   - Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` in `src/main.js` with your actual Supabase credentials
   - Make sure your Supabase project has real-time enabled

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Deployment

This project is configured for Vercel deployment. Simply connect your repository to Vercel and it will automatically deploy.

## Controls

- **WASD**: Move your mage
- **Mouse Click**: Shoot fireball at cursor position

## Game Rules

- Stay inside the green ring to avoid taking damage
- The ring shrinks over time
- Fireballs knock players around - use them to push opponents out of the ring
- Last mage standing wins the round
- Multiple rounds are played automatically

## Technologies

- Phaser.js for game engine and graphics
- Supabase for real-time multiplayer
- Vite for build tooling
- Vercel for deployment
