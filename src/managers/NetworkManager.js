export class NetworkManager {
    constructor(supabase, playerId) {
        this.supabase = supabase;
        this.playerId = playerId;
        this.channel = null;
        this.eventHandlers = new Map();
        this.lastBroadcast = 0;
        this.isConnected = false;
        
        // Adaptive network rates
        this.NETWORK_RATES = {
            IDLE: 100,      // Slow when not moving
            MOVING: 50,     // Normal when moving  
            COMBAT: 16      // Fast during combat (60fps)
        };
        this.currentRate = this.NETWORK_RATES.IDLE;
        this.lastPlayerState = { x: 0, y: 0, moving: false };
    }

    async connect(channelName = 'game-room') {
        try {
            // Connecting to Supabase

            // Create channel with explicit broadcast configuration
                this.channel = this.supabase.channel(channelName, {
                    config: {
                        broadcast: { self: false }
                    }
                });

            // Set up event listeners BEFORE subscribing
            for (const [event, handler] of this.eventHandlers) {
                this.channel.on('broadcast', { event }, handler);
            }

            // Subscribing to channel
                const connected = await new Promise((resolve) => {
                    this.channel.subscribe((status) => {
                        // Realtime status update
                        if (status === 'SUBSCRIBED') {
                            this.isConnected = true;
                            resolve(true);
                        }
                        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                            this.isConnected = false;
                            resolve(false);
                        }
                    });
                    // Safety timeout (10s)
                    setTimeout(() => {
                        if (!this.isConnected) {
                            resolve(false);
                        }
                    }, 10000);
                });

                return connected;
        } catch (error) {
            // Network connection failed
            this.isConnected = false;
            return false;
        }
    }

    disconnect() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        this.isConnected = false;
    }

    on(event, handler) {
        this.eventHandlers.set(event, (payload) => {
            handler(payload.payload);
        });
        
        // If already connected, add the listener immediately
        if (this.channel) {
            this.channel.on('broadcast', { event }, (payload) => {
                handler(payload.payload);
            });
        }
    }

    off(event) {
        this.eventHandlers.delete(event);
    }

    broadcast(event, data, forceImmediate = false) {
    if (!this.isConnected || !this.channel) {
            return false;
        }

        const now = Date.now();
        if (!forceImmediate && now - this.lastBroadcast < this.currentRate) {
            return false; // Rate limited
        }

        try {
            // Use the correct Supabase broadcast method
            this.channel.send({
                type: 'broadcast',
                event: event,
                payload: data
            });
            this.lastBroadcast = now;
            return true;
        } catch (error) {
            // Broadcast failed
            return false;
        }
    }

    updateNetworkRate(playerState) {
        // Determine if player is moving
        const isMoving = Math.abs(playerState.x - this.lastPlayerState.x) > 1 || 
                        Math.abs(playerState.y - this.lastPlayerState.y) > 1;
        
        // Update rate based on activity
        if (playerState.inCombat) {
            this.currentRate = this.NETWORK_RATES.COMBAT;
        } else if (isMoving) {
            this.currentRate = this.NETWORK_RATES.MOVING;
        } else {
            this.currentRate = this.NETWORK_RATES.IDLE;
        }

        this.lastPlayerState = { ...playerState };
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            rate: this.currentRate,
            lastBroadcast: this.lastBroadcast
        };
    }
}
