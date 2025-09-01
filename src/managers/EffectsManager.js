import { ObjectPool } from '../utils/ObjectPool.js';
import { SpatialGrid } from '../utils/SpatialGrid.js';

export class EffectsManager {
    constructor(scene) {
        this.scene = scene;
        this.fireballs = [];
        this.explosions = [];
        this.spatialGrid = new SpatialGrid(scene.WORLD_WIDTH, scene.WORLD_HEIGHT, 100);
        
        this.WORLD_FIREBALL_SIZE = 8;
        
        // Fireball types with different properties
        this.FIREBALL_TYPES = {
            NORMAL: {
                speed: 0.8,
                size: 1.0,
                damage: 1.0,
                color: 0xff4400,
                glowColor: 0xffaa00,
                lifetime: 5000,
                bounce: 0.9,
                trail: true
            },
            FAST: {
                speed: 1.2,
                size: 0.7,
                damage: 0.8,
                color: 0xff6600,
                glowColor: 0xffff00,
                lifetime: 3000,
                bounce: 0.5,
                trail: true
            },
            HEAVY: {
                speed: 0.5,
                size: 1.5,
                damage: 1.5,
                color: 0xcc2200,
                glowColor: 0xff4400,
                lifetime: 7000,
                bounce: 1.2,
                trail: false
            }
        };
        
        // Set up object pools
        this.fireballPool = new ObjectPool(
            () => this.createFireballObject(),
            (fireball) => this.resetFireball(fireball),
            30 // Max pool size
        );
        
        this.explosionPool = new ObjectPool(
            () => this.createExplosionObject(),
            (explosion) => this.resetExplosion(explosion),
            20
        );
        
        this.activeFireballs = new Set();
        this.activeExplosions = new Set();
    }

    createFireballObject() {
        const fireballSize = this.WORLD_FIREBALL_SIZE * this.scene.scaleX;
        const fireball = this.scene.add.circle(0, 0, fireballSize, 0xff4400);
        fireball.setStrokeStyle(3, 0xffaa00);
        fireball.setVisible(false);
        
        this.scene.physics.add.existing(fireball);
        fireball.body.setCircle(fireballSize);
        fireball.body.setBounce(0.9);
        
        // Create glow effects
        const glow1 = this.scene.add.circle(0, 0, fireballSize * 2.5, 0xff4400, 0.5);
        const glow2 = this.scene.add.circle(0, 0, fireballSize * 3.5, 0xff6600, 0.3);
        const glow3 = this.scene.add.circle(0, 0, fireballSize * 4.5, 0xffaa00, 0.15);
        
        glow1.setVisible(false);
        glow2.setVisible(false);
        glow3.setVisible(false);
        
        return {
            sprite: fireball,
            glows: [glow1, glow2, glow3],
            shooterId: null,
            lifetime: 5000,
            startTime: 0,
            worldX: 0,
            worldY: 0,
            size: fireballSize,
            active: false
        };
    }

    resetFireball(fireballData) {
        fireballData.sprite.setVisible(false);
        fireballData.sprite.body.setVelocity(0, 0);
        fireballData.glows.forEach(glow => glow.setVisible(false));
        
        fireballData.shooterId = null;
        fireballData.startTime = 0;
        fireballData.worldX = 0;
        fireballData.worldY = 0;
        fireballData.active = false;
        
        // Remove from spatial grid
        this.spatialGrid.remove(fireballData);
        this.activeFireballs.delete(fireballData);
    }

    createFireball(worldX, worldY, targetWorldXOrDirection, targetWorldYOrShooterId, shooterIdOrType, type = 'NORMAL') {
        // Handle both calling patterns:
        // createFireball(worldX, worldY, targetWorldX, targetWorldY, shooterId) - old
        // createFireball(worldX, worldY, direction, shooterId, type) - new
        
        let direction, shooterId, fireballType;
        
        if (typeof targetWorldXOrDirection === 'object' && targetWorldXOrDirection.x !== undefined) {
            // New API: direction object provided
            direction = targetWorldXOrDirection;
            shooterId = targetWorldYOrShooterId;
            fireballType = shooterIdOrType || 'NORMAL';
        } else {
            // Old API: target coordinates provided
            const targetWorldX = targetWorldXOrDirection;
            const targetWorldY = targetWorldYOrShooterId;
            shooterId = shooterIdOrType;
            fireballType = type;
            
            // Calculate direction from coordinates
            const angle = Phaser.Math.Angle.Between(worldX, worldY, targetWorldX, targetWorldY);
            direction = {
                x: Math.cos(angle),
                y: Math.sin(angle)
            };
        }
        
        const fireballData = this.fireballPool.get();
        if (!fireballData) {
            return null;
        }
        
        // Get fireball type configuration
        const typeConfig = this.FIREBALL_TYPES[fireballType] || this.FIREBALL_TYPES.NORMAL;
        
        // Convert world coordinates to screen coordinates
        const screenPos = this.scene.worldToScreen(worldX, worldY);
        
        // Update fireball size for current scale and type
        const fireballSize = this.WORLD_FIREBALL_SIZE * this.scene.scaleX * typeConfig.size;
        fireballData.sprite.setRadius(fireballSize);
        fireballData.sprite.body.setCircle(fireballSize);
        fireballData.sprite.setFillStyle(typeConfig.color);
        fireballData.sprite.setStrokeStyle(3, typeConfig.glowColor);
        fireballData.size = fireballSize;
        
        // Position fireball
        fireballData.sprite.setPosition(screenPos.x, screenPos.y);
        fireballData.sprite.setVisible(true);
        fireballData.sprite.body.setBounce(typeConfig.bounce);
        
        // Position glows with type-specific colors
        fireballData.glows.forEach((glow, index) => {
            const multiplier = 2.5 + index;
            glow.setRadius(fireballSize * multiplier);
            glow.setPosition(screenPos.x, screenPos.y);
            glow.setFillStyle(typeConfig.glowColor, 0.5 - index * 0.1);
            glow.setVisible(true);
        });
        
        // Calculate velocity with type-specific speed
        const baseSpeed = Math.min(this.scene.gameWidth, this.scene.gameHeight) * typeConfig.speed;
        const velocityX = direction.x * baseSpeed;
        const velocityY = direction.y * baseSpeed;
        
        fireballData.sprite.body.setVelocity(velocityX, velocityY);
        
        // Set fireball properties
        fireballData.shooterId = shooterId;
        fireballData.startTime = this.scene.time.now;
        fireballData.worldX = worldX;
        fireballData.worldY = worldY;
        fireballData.active = true;
        fireballData.type = fireballType;
        fireballData.typeConfig = typeConfig;
        fireballData.lifetime = typeConfig.lifetime;
        
        // Add to collections
        this.fireballs.push(fireballData);
        this.activeFireballs.add(fireballData);
        this.spatialGrid.insert(fireballData, worldX, worldY, this.WORLD_FIREBALL_SIZE * typeConfig.size);
        
        // Set destruction timer
        this.scene.time.delayedCall(fireballData.lifetime, () => {
            this.destroyFireball(fireballData);
        });
        
        return fireballData;
    }

    destroyFireball(fireballData) {
        if (!fireballData.active) return;
        
        const index = this.fireballs.indexOf(fireballData);
        if (index > -1) {
            this.fireballs.splice(index, 1);
        }
        
        this.fireballPool.release(fireballData);
    }

    createExplosionObject() {
        const explosion = this.scene.add.circle(0, 0, 5, 0xffffff, 0.8);
        explosion.setVisible(false);
        return {
            sprite: explosion,
            active: false
        };
    }

    resetExplosion(explosionData) {
        explosionData.sprite.setVisible(false);
        explosionData.sprite.setRadius(5);
        explosionData.sprite.setAlpha(0.8);
        explosionData.active = false;
        this.activeExplosions.delete(explosionData);
    }

    createExplosion(worldX, worldY) {
        const explosionData = this.explosionPool.get();
        const screenPos = this.scene.worldToScreen(worldX, worldY);
        
        explosionData.sprite.setPosition(screenPos.x, screenPos.y);
        explosionData.sprite.setVisible(true);
        explosionData.active = true;
        this.activeExplosions.add(explosionData);
        
        const maxRadius = Math.min(this.scene.gameWidth, this.scene.gameHeight) * 0.05;
        
        this.scene.tweens.add({
            targets: explosionData.sprite,
            radius: maxRadius,
            alpha: 0,
            duration: 200,
            ease: 'Power2',
            onComplete: () => {
                this.explosionPool.release(explosionData);
            }
        });
    }

    updateFireballs() {
        this.spatialGrid.clear();
        
        // Update active fireballs
        this.fireballs = this.fireballs.filter(fireball => {
            if (fireball.active && fireball.sprite.visible) {
                // Update world position from screen position
                const worldPos = this.scene.screenToWorld(fireball.sprite.x, fireball.sprite.y);
                fireball.worldX = worldPos.x;
                fireball.worldY = worldPos.y;
                
                // Add to spatial grid
                this.spatialGrid.insert(fireball, fireball.worldX, fireball.worldY, this.WORLD_FIREBALL_SIZE);
                
                // Update glow effects with enhanced animations
                const elapsed = this.scene.time.now - fireball.startTime;
                const ageRatio = elapsed / (fireball.lifetime || 5000);
                const pulseScale = 1 + Math.sin(elapsed * 0.015) * 0.25; // More dynamic pulsing
                
                fireball.glows.forEach((glow, index) => {
                    glow.setPosition(fireball.sprite.x, fireball.sprite.y);
                    
                    // Enhanced rotation with varying speeds
                    glow.rotation += 0.02 * (index + 1) * (1 + Math.sin(elapsed * 0.005) * 0.5);
                    
                    // Dynamic scaling with age-based shrinking
                    const baseScale = 1 - ageRatio * 0.15; // Gradually shrink
                    glow.setScale(baseScale * pulseScale);
                    
                    // Improved alpha with fade-out over time
                    const baseAlpha = 0.6 - index * 0.15;
                    const fadeAlpha = 1 - ageRatio * 0.4;
                    glow.setAlpha(Math.max(0.1, baseAlpha * fadeAlpha));
                });
                
                // No gravity - this is a top-down game
                
                return true;
            }
            return false;
        });
    }

    checkCollisions(players) {
        // Use spatial partitioning for efficient collision detection
        for (const fireball of this.activeFireballs) {
            if (!fireball.active) continue;
            
            // Get nearby players using spatial grid
            const nearbyObjects = this.spatialGrid.getNearby(
                fireball.worldX, 
                fireball.worldY, 
                this.WORLD_FIREBALL_SIZE + 20 // Add padding for player size
            );
            
            // Check collisions with nearby players only
            for (const player of players.values()) {
                if (fireball.shooterId === player.id) continue;
                
                const distance = Phaser.Math.Distance.Between(
                    fireball.worldX, fireball.worldY,
                    player.worldX, player.worldY
                );
                
                if (distance < (this.WORLD_FIREBALL_SIZE + 15)) { // 15 is world player size
                    this.handleFireballHit(fireball, player);
                    break; // Fireball can only hit one player
                }
            }
        }
    }

    handleFireballHit(fireball, player) {
        // Calculate damage based on fireball type
        const typeConfig = fireball.typeConfig || this.FIREBALL_TYPES.NORMAL;
        let damage = 15; // Base damage
        
        if (fireball.type === 'NORMAL') damage = 15;
        else if (fireball.type === 'FAST') damage = 12;
        else if (fireball.type === 'HEAVY') damage = 25;
        
        // Apply damage to local player
        if (player.isLocal) {
            this.scene.health -= damage;
            this.scene.health = Math.max(0, this.scene.health); // Don't go below 0
            
            // Check if player died
            if (this.scene.health <= 0) {
                this.scene.gameStateManager.setState(this.scene.gameStateManager.STATES.SPECTATING);
            }
        }
        
        // Calculate knockback force based on fireball type - much stronger knockback
        const angle = Phaser.Math.Angle.Between(
            fireball.worldX, fireball.worldY,
            player.worldX, player.worldY
        );

        let knockbackMultiplier = 1.0;
        if (fireball.type === 'NORMAL') knockbackMultiplier = 2.5;
        else if (fireball.type === 'FAST') knockbackMultiplier = 2.0; // Fast has less knockback
        else if (fireball.type === 'HEAVY') knockbackMultiplier = 4.0; // Heavy sends flying

        const baseKnockbackForce = Math.min(this.scene.gameWidth, this.scene.gameHeight) * 3.2; // stronger base
        const knockbackForce = baseKnockbackForce * knockbackMultiplier;
        const knockbackX = Math.cos(angle) * knockbackForce;
        const knockbackY = Math.sin(angle) * knockbackForce;
        
        if (player.isLocal) {
            // Apply stronger impulse with temporary physics tweaks
            this.scene.playerManager.applyImpulseToLocal(knockbackX, knockbackY, {
                duration: (fireball.type === 'HEAVY') ? 700 : (fireball.type === 'FAST' ? 300 : 500),
                drag: (fireball.type === 'HEAVY') ? 20 : 35,
                maxMultiplier: (fireball.type === 'HEAVY') ? 6 : 4
            });
            
            // Stronger screen shake based on fireball type
            let shakeIntensity = 0.04;
            let shakeDuration = 300;
            if (fireball.type === 'FAST') {
                shakeIntensity = 0.03;
                shakeDuration = 200;
            } else if (fireball.type === 'HEAVY') {
                shakeIntensity = 0.08;
                shakeDuration = 500;
            }
            this.scene.cameras.main.shake(shakeDuration, shakeIntensity);
            
            // Flash effect - red for damage, intensity based on fireball type
            let flashColor = 0xff4444;
            let flashDuration = 150;
            if (fireball.type === 'HEAVY') {
                flashColor = 0xff2222;
                flashDuration = 250;
            }
            
            if (player.sprite) player.sprite.setFillStyle(flashColor);
            if (player.glow) player.glow.setFillStyle(flashColor);
            this.scene.time.delayedCall(flashDuration, () => {
                if (player.sprite) player.sprite.setFillStyle(0x00ffff);
                if (player.glow) player.glow.setFillStyle(0x00ffff);
            });
            
            // Set combat state for network optimization
            this.scene.playerManager.setPlayerCombatState(player.id, true);
            this.scene.time.delayedCall(2000, () => {
                this.scene.playerManager.setPlayerCombatState(player.id, false);
            });
        }
        
        // Create explosion with size based on fireball type
    this.createExplosion(fireball.worldX, fireball.worldY);
        
        // Destroy fireball
        this.destroyFireball(fireball);
    }

    resizeEffects() {
        // Resize all active fireballs
        for (const fireball of this.activeFireballs) {
            if (fireball.active) {
                const newSize = this.WORLD_FIREBALL_SIZE * this.scene.scaleX;
                fireball.sprite.setRadius(newSize);
                fireball.sprite.body.setCircle(newSize);
                fireball.size = newSize;
                
                fireball.glows.forEach((glow, index) => {
                    const multiplier = 2.5 + index;
                    glow.setRadius(newSize * multiplier);
                });
            }
        }
        
        // Resize explosions
        for (const explosion of this.activeExplosions) {
            if (explosion.active) {
                // Explosions will resize with their tweens
            }
        }
    }

    getStats() {
        return {
            fireballs: {
                active: this.activeFireballs.size,
                pooled: this.fireballPool.getStats()
            },
            explosions: {
                active: this.activeExplosions.size,
                pooled: this.explosionPool.getStats()
            },
            spatialGrid: this.spatialGrid.getStats()
        };
    }

    cleanup() {
        // Clear all active effects
        this.fireballs.forEach(fireball => this.destroyFireball(fireball));
        this.fireballs.length = 0;
        
        // Clear pools
        this.fireballPool.clear();
        this.explosionPool.clear();
        
        // Clear spatial grid
        this.spatialGrid.clear();
        
        // Clear sets
        this.activeFireballs.clear();
        this.activeExplosions.clear();
    }

    clearAll() {
        this.cleanup();
    }
}
