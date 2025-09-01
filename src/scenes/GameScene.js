import { supabase } from '../main.js';
import { NetworkManager } from '../managers/NetworkManager.js';
import { PlayerManager } from '../managers/PlayerManager.js';
import { GameStateManager } from '../managers/GameStateManager.js';
import { EffectsManager } from '../managers/EffectsManager.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.playerId = null;
        this.ringRadius = 0;
        this.ringCenter = { x: 0, y: 0 };
        this.shrinkRate = 0.8;
        this.currentRound = 1;
        this.roundStartTime = 0;
        this.maxPlayersThisRound = 0;
        this.gameWidth = 0;
        this.gameHeight = 0;
        this.isRingMaster = false;
        this.isSpectating = false;
        this.health = 100; // Initialize player health
        this.mana = 100; // Initialize mana (0-100)
        this.lastShotTime = 0;
        this.lastRingDamageTime = 0;
        this.lastManaRegen = 0;
        
        // Charging system for fireballs
        this.isCharging = false;
        this.chargeStartTime = 0;
        this.chargeLevel = 0;
        this.maxChargeTime = 2000; // 2 seconds for full charge
        
        // Fixed game world coordinates (independent of screen size)
        this.WORLD_WIDTH = 1000;
        this.WORLD_HEIGHT = 1000;
        this.WORLD_CENTER = { x: 500, y: 500 };
        this.WORLD_RING_RADIUS = 400;
        this.scaleX = 1;
        this.scaleY = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        
        // Initialize managers
        this.networkManager = null;
        this.playerManager = null;
        this.gameStateManager = null;
        this.effectsManager = null;
        
        // Event cleanup tracking
        this.eventCleanup = [];

    // Mobile joystick state
    this.isMobile = false;
    this.joyActive = false;
    this.joyPointerId = null;
    this.joyStart = { x: 0, y: 0 };
    this.joyVector = null; // normalized vector or null
    this.joyRadius = 80; // px
    this.joyBase = null;
    this.joyThumb = null;
    }

    preload() {
        // Create particle texture for background effects
        this.load.image('particle', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    }

    create() {
        // Set up responsive dimensions and scaling
        this.gameWidth = this.scale.width;
        this.gameHeight = this.scale.height;
        this.updateScaling();
        
        // Generate unique player ID
        this.playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Initialize managers
        this.networkManager = new NetworkManager(supabase, this.playerId);
        this.playerManager = new PlayerManager(this);
        this.gameStateManager = new GameStateManager(this);
        this.effectsManager = new EffectsManager(this);
        
        // Initialize managers
        this.playerManager.initialize();
        
        // Handle window resize
        const resizeHandler = () => this.handleResize();
        this.scale.on('resize', resizeHandler, this);
        this.eventCleanup.push(() => this.scale.off('resize', resizeHandler, this));
        
        // Create graphics for drawing the ring
        this.ringGraphics = this.add.graphics();
        
        // Create background effects
        this.createBackgroundEffects();
        
        // Set up input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,S,A,D');
        
        // Device check for mobile (prefer os.desktop flag when available)
        try {
            const os = this.sys?.game?.device?.os;
            this.isMobile = os ? !os.desktop : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
        } catch { this.isMobile = (('ontouchstart' in window) || navigator.maxTouchPoints > 0); }

        // Pointer input for joystick (left side) and aiming (right side)
        const onPointerDown = (pointer) => {
            if (!this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING) || this.isSpectating) return;

            const leftSide = pointer.x < this.gameWidth * 0.45;
            if (this.isMobile && leftSide && !this.joyActive) {
                // Start joystick
                this.joyActive = true;
                this.joyPointerId = pointer.id;
                this.joyStart = { x: pointer.x, y: pointer.y };
                this.createJoystickGraphics(pointer.x, pointer.y);
                this.joyVector = { x: 0, y: 0 };
                return; // do not start charging on joystick touch
            }

            // Right side (or desktop anywhere): start charging to shoot where touched
            if (this.mana >= 10) this.startCharging();
        };

        const onPointerMove = (pointer) => {
            if (!this.joyActive || pointer.id !== this.joyPointerId) return;
            const dx = pointer.x - this.joyStart.x;
            const dy = pointer.y - this.joyStart.y;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(dist, this.joyRadius);
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 0;
            this.joyVector = { x: nx, y: ny };
            // Position thumb within radius
            if (this.joyThumb) this.joyThumb.setPosition(this.joyStart.x + nx * clamped, this.joyStart.y + ny * clamped);
        };

        const onPointerUp = (pointer) => {
            if (this.joyActive && pointer.id === this.joyPointerId) {
                // End joystick
                this.destroyJoystickGraphics();
                this.joyActive = false;
                this.joyPointerId = null;
                this.joyVector = null;
                return;
            }
            if (this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING) && !this.isSpectating) {
                // Release charged fireball towards touch/cursor position
                this.shootFireball(pointer.x, pointer.y);
            }
        };
        
        this.input.on('pointerdown', onPointerDown);
        this.input.on('pointermove', onPointerMove);
        this.input.on('pointerup', onPointerUp);
        this.eventCleanup.push(() => this.input.off('pointerdown', onPointerDown));
        this.eventCleanup.push(() => this.input.off('pointermove', onPointerMove));
        this.eventCleanup.push(() => this.input.off('pointerup', onPointerUp));
        
        // Create local player
        this.createLocalPlayer();
        
        // Set up multiplayer
        this.setupMultiplayer();
        
        // Start the game - use proper state constant
        this.roundStartTime = this.time.now;
        this.ringRadius = this.WORLD_RING_RADIUS;
        this.gameStateManager.setState(this.gameStateManager.STATES.PLAYING);
        
        // Update UI
        this.updateUI();
    }

    createJoystickGraphics(x, y) {
        // Base
        this.joyBase = this.add.circle(x, y, this.joyRadius, 0x00ff88, 0.15);
        this.joyBase.setStrokeStyle(3, 0x00ffaa, 0.7);
        this.joyBase.setScrollFactor(0);
        // Thumb
        this.joyThumb = this.add.circle(x, y, this.joyRadius * 0.4, 0x00ffaa, 0.35);
        this.joyThumb.setStrokeStyle(2, 0xffffff, 0.8);
        this.joyThumb.setScrollFactor(0);
    }

    destroyJoystickGraphics() {
        if (this.joyBase) this.joyBase.destroy();
        if (this.joyThumb) this.joyThumb.destroy();
        this.joyBase = null;
        this.joyThumb = null;
    }

    updateScaling() {
        // Calculate scaling factors to fit world coordinates to screen
        this.scaleX = this.gameWidth / this.WORLD_WIDTH;
        this.scaleY = this.gameHeight / this.WORLD_HEIGHT;
        
        // Use uniform scaling to maintain aspect ratio
        const uniformScale = Math.min(this.scaleX, this.scaleY);
        this.scaleX = uniformScale;
        this.scaleY = uniformScale;
        
        // Calculate offset to center the world on screen
        const scaledWorldWidth = this.WORLD_WIDTH * this.scaleX;
        const scaledWorldHeight = this.WORLD_HEIGHT * this.scaleY;
        this.offsetX = (this.gameWidth - scaledWorldWidth) / 2;
        this.offsetY = (this.gameHeight - scaledWorldHeight) / 2;
        
        // Calculate screen center (should be screen center, not world center scaled)
        this.ringCenter = { 
            x: this.gameWidth / 2, 
            y: this.gameHeight / 2 
        };
    }

    // Helper functions for coordinate conversion
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scaleX + this.offsetX,
            y: worldY * this.scaleY + this.offsetY
        };
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scaleX,
            y: (screenY - this.offsetY) / this.scaleY
        };
    }

    handleResize() {
        this.gameWidth = this.scale.width;
        this.gameHeight = this.scale.height;
        this.updateScaling();
        
        // Update all player positions and sizes using PlayerManager
        this.playerManager.resizeAllPlayers(this.scaleX);
        
        // Update effects positions using EffectsManager
        this.effectsManager.resizeEffects(this.scaleX);
        
        // Update background effects
        if (this.backgroundParticles) {
            this.backgroundParticles.destroy();
        }
        this.createBackgroundEffects();
    }

    createBackgroundEffects() {
        // Create subtle particle system for atmosphere
        this.backgroundParticles = this.add.particles(0, 0, 'particle', {
            x: { min: 0, max: this.gameWidth },
            y: { min: 0, max: this.gameHeight },
            scale: { start: 0.1, end: 0 },
            alpha: { start: 0.3, end: 0 },
            lifespan: 3000,
            frequency: 200,
            tint: [0x00ffff, 0xff0080, 0x00ff00]
        });
    }

    createLocalPlayer() {
        // Generate position in world coordinates
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (this.WORLD_RING_RADIUS * 0.5);
        const worldX = this.WORLD_CENTER.x + Math.cos(angle) * distance;
        const worldY = this.WORLD_CENTER.y + Math.sin(angle) * distance;
        
        this.playerManager.createLocalPlayer(this.playerId, worldX, worldY);
    }

    setupMultiplayer() {
        // Set up network event handlers
        this.networkManager.on('player-move', (data) => this.handlePlayerMove(data));
        this.networkManager.on('fireball-shot', (data) => this.handleFireballShot(data));
        this.networkManager.on('player-join', (data) => this.handlePlayerJoin(data));
        this.networkManager.on('player-leave', (data) => this.handlePlayerLeave(data));
        this.networkManager.on('player-death', (data) => this.handlePlayerDeath_Remote(data));
        this.networkManager.on('round-reset', (data) => this.handleRoundReset(data));
        this.networkManager.on('ring-update', (data) => this.handleRingUpdate(data));
    // Symmetric player bump event
    this.networkManager.on('player-bump', (data) => this.handlePlayerBump(data));

        // Connect to network
        this.networkManager.connect().then((connected) => {
            if (connected) {
                this.isRingMaster = true;
                const localPlayer = this.playerManager.getLocalPlayer();
                this.networkManager.broadcast('player-join', {
                    id: this.playerId,
                    worldX: localPlayer.worldX,
                    worldY: localPlayer.worldY,
                    health: localPlayer.health,
                    isRingMaster: this.isRingMaster,
                    reply: false
                }, true);
            } else {
                // Failed to connect to multiplayer network
            }
        });
    }

    // Apply the same strongest knockback to both players involved in a body collision
    handlePlayerBump(data) {
        if (!data || !this.playerManager.getLocalPlayer()) return;
        const me = this.playerId;
        const { a, b, nx, ny, force } = data;
        if (me !== a && me !== b) return; // Not part of this collision

        // Direction: A gets +n, B gets -n
        const dir = (me === a) ? { x: nx, y: ny } : { x: -nx, y: -ny };
        this.playerManager.applyImpulseToLocal(dir.x * force, dir.y * force, {
            duration: 600,
            drag: 18,
            maxMultiplier: 7
        });
    }

    handlePlayerMove(data) {
        if (data.id === this.playerId) return;
        this.playerManager.updatePlayer(data.id, data);
    }

    handlePlayerJoin(data) {
        if (data.id === this.playerId) return;
        // New player joined

        if (data.isRingMaster && data.id < this.playerId) {
            this.isRingMaster = false;
        }
        
        this.playerManager.createRemotePlayer(data);
        this.updateUI();
    this.recalculateRingMaster();

        // Only respond once to initial join announcements to avoid echo loops
        if (!data.reply) {
            const localPlayer = this.playerManager.getLocalPlayer();
            if (localPlayer) {
                this.networkManager.broadcast('player-join', {
                    id: this.playerId,
                    worldX: localPlayer.worldX,
                    worldY: localPlayer.worldY,
                    health: localPlayer.health,
                    isRingMaster: this.isRingMaster,
                    reply: true
                }, true);
            }
        }
    }

    handlePlayerLeave(data) {
        this.playerManager.removePlayer(data.id);
        this.updateUI();
    this.recalculateRingMaster();
    }

    handlePlayerDeath_Remote(data) {
        if (data.id !== this.playerId) {
            // First make the dead player invisible before removing
            const deadPlayer = this.playerManager.getPlayer(data.id);
            if (deadPlayer) {
                deadPlayer.sprite.setVisible(false);
                deadPlayer.glow.setVisible(false);
            }
            
            this.playerManager.removePlayer(data.id);
            this.updateUI();
            this.recalculateRingMaster();
        }
    }

    handleRoundReset(data) {
        // Remote signal to restart round at a synchronized time
    // Do not set currentRound here to avoid double-increment; we bump it in startNextRound
        // Enter ROUND_END until scheduled restart
        this.gameStateManager.setState(this.gameStateManager.STATES.ROUND_END);

        const startAt = data?.startAt || (Date.now() + 3000);
        const delay = Math.max(0, startAt - Date.now());
        this.time.delayedCall(delay, () => {
            this.startNextRound();
        });
    }

    handleRingUpdate(data) {
        if (!this.isRingMaster) {
            this.ringRadius = data.radius;
            this.roundStartTime = data.startTime;
        }
    }

    handleFireballShot(data) {
        // Handle both old and new fireball shot formats
        if (data.direction) {
            // New format with direction
            this.effectsManager.createFireball(data.x, data.y, data.direction, data.playerId, data.type || 'NORMAL');
        } else {
            // Old format with target coordinates (fallback)
            this.effectsManager.createFireball(data.worldX, data.worldY, data.targetWorldX, data.targetWorldY, data.shooterId);
        }
    }

    update() {
        // Update game state manager
        this.gameStateManager.update();
        
        // Always update ring and UI
        this.updateRing();
        this.updateUI();
        
        if (!this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING)) {
            return;
        }
        
        // Update local player movement (only if alive and not spectating)
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer && !this.isSpectating) {
            this.updateLocalPlayer();
        }
        
        // Update effects
        this.effectsManager.updateFireballs();
        
        // Check for collisions (only if not spectating)
        if (!this.isSpectating) {
            this.effectsManager.checkCollisions(this.playerManager.getAllPlayers());
            // Player vs player bumping
            this.playerManager.updatePlayerCollisions();
        }
        
        // Check ring damage (only if not spectating)
        if (!this.isSpectating) {
            this.checkRingDamage();
        }
        
        // Regenerate mana over time
        this.updateMana();
        
        // Update charging system
        this.updateCharging();
        
        // Broadcast player position with adaptive rate
        if (!this.isSpectating && localPlayer) {
            const playerState = this.playerManager.getPlayerState(this.playerId);
            this.networkManager.updateNetworkRate(playerState);
            this.networkManager.broadcast('player-move', playerState);
        }

    // Evaluate win condition each frame so the round ends when one remains
    this.checkWinCondition();
    }

    startCharging() {
        if (!this.isCharging && this.mana >= 10) {
            this.isCharging = true;
            this.chargeStartTime = this.time.now;
            this.chargeLevel = 0;
        }
    }

    updateCharging() {
        if (this.isCharging) {
            const elapsed = this.time.now - this.chargeStartTime;
            this.chargeLevel = Math.min(1.0, elapsed / this.maxChargeTime);
            
            // Visual feedback for charging (make player glow brighter)
            const localPlayer = this.playerManager.getLocalPlayer();
            if (localPlayer && localPlayer.glow) {
                const glowIntensity = 1 + this.chargeLevel * 2;
                localPlayer.glow.setScale(glowIntensity);
                
                // Change glow color based on charge level
                if (this.chargeLevel < 0.33) {
                    localPlayer.glow.setFillStyle(0x00ffff); // Blue - normal
                } else if (this.chargeLevel < 0.66) {
                    localPlayer.glow.setFillStyle(0xffff00); // Yellow - charged
                } else {
                    localPlayer.glow.setFillStyle(0xff0000); // Red - fully charged
                }
            }
        }
    }

    getFireballType() {
        if (this.chargeLevel < 0.33) {
            return 'NORMAL';
        } else if (this.chargeLevel < 0.66) {
            return 'FAST';
        } else {
            return 'HEAVY';
        }
    }

    updateMana() {
        // Regenerate mana every 200ms (faster than old ammo)
        const currentTime = this.time.now;
        if (!this.lastManaRegen) this.lastManaRegen = currentTime;
        
        if (currentTime - this.lastManaRegen > 200 && this.mana < 100) {
            this.mana += 2; // Regenerate 2 mana per tick
            this.mana = Math.min(this.mana, 100); // Cap at 100
            this.lastManaRegen = currentTime;
        }
    }

    updateLocalPlayer() {
    const speed = Math.min(this.gameWidth, this.gameHeight) * 0.5;
    // If joystick is active, use analog movement; otherwise keyboard
    this.playerManager.updateLocalPlayerMovement(this.wasd, speed, this.joyVector);
    }

    updateRing() {
        // Only ring master calculates and broadcasts ring updates
        if (this.isRingMaster && this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING)) {
            // Shrink ring over time with much faster pace for more pressure
            const elapsed = (this.time.now - this.roundStartTime) / 1000;
            this.ringRadius = Math.max(this.WORLD_RING_RADIUS * 0.08, this.WORLD_RING_RADIUS - elapsed * this.shrinkRate * 2.5);
            
            // Broadcast ring update to other clients
            this.networkManager.broadcast('ring-update', {
                radius: this.ringRadius,
                startTime: this.roundStartTime
            });
        }
        
        // All clients draw the ring
        this.drawRing();
    }
    
    drawRing() {
        // Redraw ring with enhanced visuals and dynamic effects
        this.ringGraphics.clear();
        
        // Convert world ring radius to screen radius
        const screenRingRadius = this.ringRadius * this.scaleX;
        
        // Dynamic pulsing based on ring size
        const dangerLevel = 1 - (this.ringRadius / this.WORLD_RING_RADIUS);
        const pulseIntensity = Math.sin(this.time.now * 0.008) * 0.3 * dangerLevel;
        
        // Outer glow with dynamic intensity
        for (let i = 0; i < 6; i++) {
            const alpha = (0.15 - i * 0.025) * (1 + pulseIntensity);
            const width = 10 + i * 5;
            const color = dangerLevel > 0.7 ? 0xff0000 : 0x00ff00;
            this.ringGraphics.lineStyle(width, color, alpha);
            this.ringGraphics.strokeCircle(this.ringCenter.x, this.ringCenter.y, screenRingRadius + i * 4);
        }
        
        // Main ring with danger color transition
        const ringColor = dangerLevel > 0.5 ? 
            Phaser.Display.Color.Interpolate.ColorWithColor({r: 0, g: 255, b: 0}, {r: 255, g: 0, b: 0}, 1, dangerLevel * 2 - 1) :
            {r: 0, g: 255, b: 0};
        
        const mainColor = Phaser.Display.Color.GetColor(ringColor.r, ringColor.g, ringColor.b);
        this.ringGraphics.lineStyle(5, mainColor, 0.9 + pulseIntensity * 0.3);
        this.ringGraphics.strokeCircle(this.ringCenter.x, this.ringCenter.y, screenRingRadius);
        
        // Inner highlight
        this.ringGraphics.lineStyle(2, 0xffffff, 0.8);
        this.ringGraphics.strokeCircle(this.ringCenter.x, this.ringCenter.y, screenRingRadius);
        
        // Critical danger zone effects
        if (dangerLevel > 0.8) {
            const criticalPulse = Math.sin(this.time.now * 0.02) * 0.5 + 0.5;
            this.ringGraphics.lineStyle(8, 0xff0000, criticalPulse);
            this.ringGraphics.strokeCircle(this.ringCenter.x, this.ringCenter.y, screenRingRadius);
        }
    }

    shootFireball(targetScreenX, targetScreenY) {
        // Only allow shooting if we're alive and not spectating
        if (this.isSpectating || !this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING)) {
            this.stopCharging();
            return;
        }
        
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer) {
            this.stopCharging();
            return;
        }
        
        // Check mana and charging state
        if (this.isCharging) {
            // Determine fireball type and mana cost based on charge level
            const fireballType = this.getFireballType();
            let manaCost = 10; // Base cost
            
            if (fireballType === 'NORMAL') manaCost = 10;
            else if (fireballType === 'FAST') manaCost = 20;
            else if (fireballType === 'HEAVY') manaCost = 35;
            
            if (this.mana >= manaCost) {
                this.mana -= manaCost;
                this.mana = Math.max(0, this.mana); // Don't go below 0
                
                // Calculate direction from player position to mouse click position
                const angle = Phaser.Math.Angle.Between(localPlayer.x, localPlayer.y, targetScreenX, targetScreenY);
                const direction = {
                    x: Math.cos(angle),
                    y: Math.sin(angle)
                };
                
                // Create fireball locally with type - use world coordinates
                this.effectsManager.createFireball(localPlayer.worldX, localPlayer.worldY, direction, this.playerId, fireballType);
                
                // Broadcast fireball shot to other players (force immediate so it isn't throttled)
                this.networkManager.broadcast('fireball-shot', {
                    x: localPlayer.worldX,
                    y: localPlayer.worldY,
                    direction,
                    playerId: this.playerId,
                    type: fireballType
                }, true);
                
                // Update network rate to combat frequency with a proper state object
                this.networkManager.updateNetworkRate({
                    x: localPlayer.worldX,
                    y: localPlayer.worldY,
                    inCombat: true
                });
                
                // Screen shake based on fireball power
                const shakeIntensity = fireballType === 'HEAVY' ? 0.02 : 0.01;
                this.cameras.main.shake(200, shakeIntensity);
            }
        }
        
        // Stop charging
        this.stopCharging();
    }

    stopCharging() {
        this.isCharging = false;
        this.chargeLevel = 0;
        
        // Reset player glow to normal
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer && localPlayer.glow) {
            localPlayer.glow.setScale(1);
            localPlayer.glow.setFillStyle(0x00ffff); // Reset to blue
        }
    }

    checkRingDamage() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer || this.isSpectating) return;
        
        const currentTime = this.time.now;
        
        // Distance from center
        const centerX = this.gameWidth / 2;
        const centerY = this.gameHeight / 2;
        const distance = Phaser.Math.Distance.Between(localPlayer.x, localPlayer.y, centerX, centerY);
        const ringRadius = this.ringRadius * this.scaleX;
        
        // If outside the ring and enough time has passed
        if (distance > ringRadius && currentTime - this.lastRingDamageTime > 500) {
            this.lastRingDamageTime = currentTime;
            
            // Apply damage
            this.health -= 20;
            
            // Flash screen red
            this.cameras.main.flash(200, 255, 100, 100);
            
            // Check if player is dead
            if (this.health <= 0) {
                // Transition to spectating mode when player dies
                this.gameStateManager.setState(this.gameStateManager.STATES.SPECTATING);
            }
        }
    }

    handlePlayerDeath(player) {
        if (player.isLocal) {
            // Set to spectator mode using the game state manager
            this.gameStateManager.setState(this.gameStateManager.STATES.SPECTATING);
            
            // Broadcast player death to other players
            this.networkManager.broadcast('player-death', {
                id: this.playerId
            }, true); // Force immediate broadcast for death events
        }
    }

    removePlayer(playerId) {
        this.playerManager.removePlayer(playerId);
    }

    checkWinCondition() {
        const totalPlayers = this.playerManager.getPlayerCount();
        
        // Update max players count
        this.maxPlayersThisRound = Math.max(this.maxPlayersThisRound, totalPlayers);
        
    // Debug removed
        
        // Only ring master should end the round to avoid duplicates
        if (
            this.isRingMaster &&
            totalPlayers <= 1 &&
            this.maxPlayersThisRound > 1 &&
            this.gameStateManager.isState(this.gameStateManager.STATES.PLAYING)
        ) {
            this.handleRoundEnd();
        }
    }

    handleRoundEnd() {
        // Move to ROUND_END; round index will increment on actual restart
        this.gameStateManager.setState(this.gameStateManager.STATES.ROUND_END);
        
        // Show round end message
    const remainingPlayers = this.playerManager.getAllPlayers();
    if (remainingPlayers.size === 1) {
            // Round ended - winner
        } else {
            // Round ended - no survivors
        }
        
    // Broadcast round reset with a synchronized start time
    const nextRound = this.currentRound + 1;
    const startAt = Date.now() + 3000; // start in 3 seconds
    this.networkManager.broadcast('round-reset', { round: nextRound, startAt }, true);

        // Schedule local restart at the same synchronized time
        const delay = Math.max(0, startAt - Date.now());
        this.time.delayedCall(delay, () => {
            this.startNextRound();
        });
    }

    startNextRound() {
    // Increment round index on actual restart
    this.currentRound++;

        // Reset state and resources
        this.health = 100;
        this.mana = 100;
        this.isSpectating = false;
        this.ringRadius = this.WORLD_RING_RADIUS;
        this.roundStartTime = this.time.now;
        this.maxPlayersThisRound = 0;

        // Clear effects and players, then respawn locally
        this.effectsManager.clearAll();
        this.playerManager.clearAll();
        this.createLocalPlayer();

        // Enter PLAYING
        this.gameStateManager.setState(this.gameStateManager.STATES.PLAYING);
    this.recalculateRingMaster();

        // Announce rejoin to repopulate everyone
        const localPlayer = this.playerManager.getLocalPlayer();
        this.networkManager.broadcast('player-join', {
            id: this.playerId,
            worldX: localPlayer.worldX,
            worldY: localPlayer.worldY,
            health: this.health,
            isRingMaster: this.isRingMaster,
            reply: false
        }, true);
    }

    // Choose ring master deterministically as the lowest player id present
    recalculateRingMaster() {
    const playersMap = this.playerManager.getAllPlayers();
    if (!playersMap || playersMap.size === 0) return;
    const ids = Array.from(playersMap.keys());
        ids.sort();
        const lowest = ids[0];
        this.isRingMaster = (this.playerId === lowest);
    }

    updateUI() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer && !this.isSpectating) {
            let healthText = `Health: ${Math.ceil(this.health)} | Mana: ${Math.ceil(this.mana)}`;
            
            // Add charge indicator
            if (this.isCharging) {
                const chargePercent = Math.round(this.chargeLevel * 100);
                const chargeType = this.getFireballType();
                healthText += ` | Charging: ${chargePercent}% (${chargeType})`;
            }
            
            document.getElementById('health').textContent = healthText;
        } else if (this.isSpectating) {
            document.getElementById('health').textContent = `SPECTATING - Wait for round end`;
        } else {
            document.getElementById('health').textContent = `Health: -- | Mana: --`;
        }
        document.getElementById('players-count').textContent = `Players: ${this.playerManager.getPlayerCount()}`;
        document.getElementById('round').textContent = `Round: ${this.currentRound}`;
    }
}
