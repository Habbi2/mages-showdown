import Phaser from 'phaser';
import { createClient } from '@supabase/supabase-js';
import GameScene from './scenes/GameScene.js';

// Supabase configuration - replace with your actual Supabase URL and anon key
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Debug logs removed

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: GameScene,
    render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false
    }
};

const game = new Phaser.Game(config);

// Update connection status
document.getElementById('connection-status').textContent = 'Connected';
document.getElementById('connection-status').style.color = '#00ff00';
