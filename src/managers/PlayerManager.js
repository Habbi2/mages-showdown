export class PlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map();
        this.localPlayer = null;
        this.playersGroup = null;
        this.WORLD_PLAYER_SIZE = 15;
    this.bumpCooldownUntil = 0; // prevent continuous bumping
    }

    initialize() {
        this.playersGroup = this.scene.add.group();
    }

    createLocalPlayer(playerId, worldX, worldY) {
        const screenPos = this.scene.worldToScreen(worldX, worldY);
        const playerSize = this.WORLD_PLAYER_SIZE * this.scene.scaleX;
        
        const player = this.scene.add.circle(screenPos.x, screenPos.y, playerSize, 0x00ffff);
        player.setStrokeStyle(3, 0xffffff);
        
        const glow = this.scene.add.circle(screenPos.x, screenPos.y, playerSize * 2.2, 0x00ffff, 0.4);
        
        this.scene.physics.add.existing(player);
        player.body.setCollideWorldBounds(true);
        player.body.setDrag(200);
        player.body.setCircle(playerSize);
        player.body.setBounce(0.8);
        const baseMaxVel = Math.min(this.scene.gameWidth, this.scene.gameHeight) * 0.9;
        player.body.setMaxVelocity(baseMaxVel);
        
        this.localPlayer = {
            id: playerId,
            sprite: player,
            glow: glow,
            health: 100,
            x: screenPos.x,
            y: screenPos.y,
            worldX: worldX,
            worldY: worldY,
            isLocal: true,
            size: playerSize,
            lastMoveTime: 0,
            inCombat: false,
            baseDrag: 200,
            baseMaxVelocity: baseMaxVel
        };
        
        this.players.set(playerId, this.localPlayer);
        this.playersGroup.add(player);
        return this.localPlayer;
    }

    createRemotePlayer(data) {
        // If player already exists, just update its position/state
        if (this.players.has(data.id)) {
            this.updatePlayer(data.id, data);
            return this.players.get(data.id);
        }
        const screenPos = this.scene.worldToScreen(data.worldX, data.worldY);
        const playerSize = this.WORLD_PLAYER_SIZE * this.scene.scaleX;
        
        const player = this.scene.add.circle(screenPos.x, screenPos.y, playerSize, 0xff0080);
        player.setStrokeStyle(3, 0xffffff);
        
        const glow = this.scene.add.circle(screenPos.x, screenPos.y, playerSize * 2.2, 0xff0080, 0.4);
        
        const playerData = {
            id: data.id,
            sprite: player,
            glow: glow,
            health: data.health,
            x: screenPos.x,
            y: screenPos.y,
            worldX: data.worldX,
            worldY: data.worldY,
            isLocal: false,
            size: playerSize,
            lastMoveTime: Date.now(),
            inCombat: false
        };
        
        this.players.set(data.id, playerData);
        this.playersGroup.add(player);
        return playerData;
    }

    updatePlayer(playerId, data) {
        const player = this.players.get(playerId);
        if (!player || player.isLocal) return;

        player.worldX = data.worldX;
        player.worldY = data.worldY;
        player.health = data.health;
        player.lastMoveTime = Date.now();

        const screenPos = this.scene.worldToScreen(data.worldX, data.worldY);
        player.x = screenPos.x;
        player.y = screenPos.y;
        player.sprite.setPosition(screenPos.x, screenPos.y);

        if (player.glow) {
            player.glow.setPosition(screenPos.x, screenPos.y);
        }
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        if (player.sprite) player.sprite.destroy();
        if (player.glow) player.glow.destroy();
        
        this.players.delete(playerId);
        if (this.localPlayer && this.localPlayer.id === playerId) {
            this.localPlayer = null;
        }
    }

    updateLocalPlayerMovement(wasd, speed, analogVec = null) {
        if (!this.localPlayer) return;

        const player = this.localPlayer.sprite;
        let velocityX = player.body.velocity.x;
        let velocityY = player.body.velocity.y;
        
        const oldVelX = velocityX;
        const oldVelY = velocityY;

        // Apply acceleration-based movement from keyboard or joystick
        if (analogVec) {
            // Analog joystick input (normalized vector)
            const ax = analogVec.x || 0;
            const ay = analogVec.y || 0;
            velocityX = Phaser.Math.Linear(velocityX, ax * speed, 0.35);
            velocityY = Phaser.Math.Linear(velocityY, ay * speed, 0.35);
        } else {
            if (wasd.A.isDown) velocityX = Phaser.Math.Linear(velocityX, -speed, 0.3);
            else if (wasd.D.isDown) velocityX = Phaser.Math.Linear(velocityX, speed, 0.3);
            else velocityX = Phaser.Math.Linear(velocityX, 0, 0.2);

            if (wasd.W.isDown) velocityY = Phaser.Math.Linear(velocityY, -speed, 0.3);
            else if (wasd.S.isDown) velocityY = Phaser.Math.Linear(velocityY, speed, 0.3);
            else velocityY = Phaser.Math.Linear(velocityY, 0, 0.2);
        }
        
        // Normalize diagonal movement
        if ((wasd.A.isDown || wasd.D.isDown) && (wasd.W.isDown || wasd.S.isDown)) {
            velocityX *= 0.8;
            velocityY *= 0.8;
        }
        
        player.body.setVelocity(velocityX, velocityY);
        
        // Update glow
        this.localPlayer.glow.setPosition(player.x, player.y);
        this.localPlayer.glow.rotation += 0.02;
        
        // Update positions
        this.localPlayer.x = player.x;
        this.localPlayer.y = player.y;
        const worldPos = this.scene.screenToWorld(player.x, player.y);
        this.localPlayer.worldX = worldPos.x;
        this.localPlayer.worldY = worldPos.y;

        // Detect if moving for network rate optimization
        const isMoving = Math.abs(velocityX - oldVelX) > 0.1 || Math.abs(velocityY - oldVelY) > 0.1;
        if (isMoving) {
            this.localPlayer.lastMoveTime = Date.now();
        }
    }

    resizeAllPlayers() {
        this.players.forEach(player => {
            if (player.sprite && player.worldX !== undefined && player.worldY !== undefined) {
                const screenPos = this.scene.worldToScreen(player.worldX, player.worldY);
                const newPlayerSize = this.WORLD_PLAYER_SIZE * this.scene.scaleX;
                
                player.sprite.setPosition(screenPos.x, screenPos.y);
                player.sprite.setRadius(newPlayerSize);
                
                if (player.glow) {
                    player.glow.setPosition(screenPos.x, screenPos.y);
                    player.glow.setRadius(newPlayerSize * 2.2);
                }
                
                if (player.sprite.body) {
                    player.sprite.body.setCircle(newPlayerSize);
                    // Recompute baseMaxVelocity on resize for consistent knockbacks
                    if (player.isLocal) {
                        player.baseMaxVelocity = Math.min(this.scene.gameWidth, this.scene.gameHeight) * 0.9;
                        player.sprite.body.setMaxVelocity(player.baseMaxVelocity);
                    }
                }
                
                player.x = screenPos.x;
                player.y = screenPos.y;
                player.size = newPlayerSize;
            }
        });
    }

    getPlayerState(playerId) {
        const player = this.players.get(playerId);
        if (!player) return null;

        return {
            id: playerId,
            worldX: player.worldX,
            worldY: player.worldY,
            health: player.health,
            x: player.x,
            y: player.y,
            moving: Date.now() - player.lastMoveTime < 100,
            inCombat: player.inCombat
        };
    }

    setPlayerCombatState(playerId, inCombat) {
        const player = this.players.get(playerId);
        if (player) {
            player.inCombat = inCombat;
        }
    }

    getAllPlayers() {
        return this.players;
    }

    getPlayer(playerId) {
        return this.players.get(playerId);
    }

    getPlayerCount() {
        return this.players.size;
    }

    getLocalPlayer() {
        return this.localPlayer;
    }

    cleanup() {
        this.players.forEach(player => this.removePlayer(player.id));
        this.players.clear();
        this.localPlayer = null;
        if (this.playersGroup) {
            this.playersGroup.destroy();
        }
    }

    // Convenience for round resets: fully clear and recreate the group
    clearAll() {
        this.cleanup();
        this.playersGroup = this.scene.add.group();
    }

    // Apply an impulse to the local player with temporary physics tweaks for a strong "fly away" effect
    applyImpulseToLocal(dx, dy, opts = {}) {
        if (!this.localPlayer || !this.localPlayer.sprite || !this.localPlayer.sprite.body) return;
        const body = this.localPlayer.sprite.body;
        const duration = opts.duration ?? 500; // ms
        const drag = opts.drag ?? 40; // lower drag while flying
        const maxMultiplier = opts.maxMultiplier ?? 5; // temporarily raise max speed cap

        // Save original
        const originalDrag = this.localPlayer.baseDrag ?? 200;
        const originalMax = this.localPlayer.baseMaxVelocity ?? body.maxVelocity;

        // Boost caps and reduce drag
        body.setMaxVelocity(originalMax * maxMultiplier);
        body.setDrag(drag);
        // Add impulse (accumulate with current velocity)
        body.setVelocity(body.velocity.x + dx, body.velocity.y + dy);

        // Visual little spin on glow
        if (this.localPlayer.glow) {
            this.localPlayer.glow.rotation += 0.2;
        }

        // Restore after duration
        this.scene.time.delayedCall(duration, () => {
            if (!this.localPlayer || !this.localPlayer.sprite || !this.localPlayer.sprite.body) return;
            const b = this.localPlayer.sprite.body;
            b.setDrag(originalDrag);
            b.setMaxVelocity(originalMax);
        });
    }

    // Push local player away when colliding with another player; the other client will do the same symmetrically
    updatePlayerCollisions() {
        if (!this.localPlayer || !this.localPlayer.sprite) return;
        if (this.scene.isSpectating) return;
        const now = Date.now();
        const cooldownMs = 350;
        const me = this.localPlayer;

        for (const [id, other] of this.players.entries()) {
            if (!other || other.isLocal) continue;
            const dx = me.worldX - other.worldX;
            const dy = me.worldY - other.worldY;
            const dist = Math.hypot(dx, dy);
            const sumR = (me.size + other.size) * 0.55; // overlap threshold
            if (dist > 0 && dist < sumR) {
                if (now < this.bumpCooldownUntil) break;
                // Normalize and use the strongest knockback in the game
                const nx = dx / dist;
                const ny = dy / dist;
                const base = Math.min(this.scene.gameWidth, this.scene.gameHeight);
                const force = base * 4.5; // hardest knockback

                // Broadcast a synchronized bump so both clients apply equal and opposite impulses
                this.scene.networkManager.broadcast('player-bump', {
                    a: me.id,
                    b: other.id,
                    nx,
                    ny,
                    force
                }, true);

                // Apply locally immediately for responsiveness
                this.applyImpulseToLocal(nx * force, ny * force, { duration: 600, drag: 18, maxMultiplier: 7 });
                this.bumpCooldownUntil = now + cooldownMs;
                break; // one bump per frame is enough
            }
        }
    }
}
