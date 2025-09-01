export class GameStateManager {
    constructor(scene) {
        this.scene = scene;
        this.state = null; // Will be set properly in initializeStates
        this.stateHandlers = new Map();
        this.stateData = new Map();
        this.transitions = new Map();
        this.eventCleanup = [];
        
        this.initializeStates();
        // Set initial state after states are defined
        this.state = this.STATES.WAITING;
    }

    initializeStates() {
        // Define game states
        this.STATES = {
            WAITING: 'waiting',
            PLAYING: 'playing', 
            ROUND_END: 'round_end',
            SPECTATING: 'spectating',
            DISCONNECTED: 'disconnected'
        };

        // Set up state handlers
        this.stateHandlers.set(this.STATES.WAITING, {
            enter: () => this.onEnterWaiting(),
            update: () => this.onUpdateWaiting(),
            exit: () => this.onExitWaiting()
        });

        this.stateHandlers.set(this.STATES.PLAYING, {
            enter: () => this.onEnterPlaying(),
            update: () => this.onUpdatePlaying(),
            exit: () => this.onExitPlaying()
        });

        this.stateHandlers.set(this.STATES.ROUND_END, {
            enter: () => this.onEnterRoundEnd(),
            update: () => this.onUpdateRoundEnd(),
            exit: () => this.onExitRoundEnd()
        });

        this.stateHandlers.set(this.STATES.SPECTATING, {
            enter: () => this.onEnterSpectating(),
            update: () => this.onUpdateSpectating(),
            exit: () => this.onExitSpectating()
        });

        // Define valid transitions
        this.transitions.set(this.STATES.WAITING, [this.STATES.PLAYING, this.STATES.DISCONNECTED]);
    this.transitions.set(this.STATES.PLAYING, [this.STATES.ROUND_END, this.STATES.SPECTATING, this.STATES.DISCONNECTED]);
    // Allow ROUND_END to transition directly back to PLAYING for synchronized restarts
    this.transitions.set(this.STATES.ROUND_END, [this.STATES.WAITING, this.STATES.PLAYING, this.STATES.DISCONNECTED]);
        this.transitions.set(this.STATES.SPECTATING, [this.STATES.ROUND_END, this.STATES.DISCONNECTED]);
        this.transitions.set(this.STATES.DISCONNECTED, [this.STATES.WAITING]);
    }

    setState(newState, data = {}) {
        if (newState === this.state) return false;

        // Check if transition is valid
        const validTransitions = this.transitions.get(this.state) || [];
        
        if (!validTransitions.includes(newState)) {
            return false;
        }

        const oldState = this.state;
        
        // Exit current state
        const currentHandler = this.stateHandlers.get(this.state);
        if (currentHandler && currentHandler.exit) {
            currentHandler.exit();
        }

        // Update state
        this.state = newState;
        this.stateData.set(newState, data);

        // Enter new state
        const newHandler = this.stateHandlers.get(newState);
        if (newHandler && newHandler.enter) {
            newHandler.enter(data);
        }

    // State transition
        return true;
    }

    update() {
        const handler = this.stateHandlers.get(this.state);
        if (handler && handler.update) {
            handler.update();
        }
    }

    getState() {
        return this.state;
    }

    getCurrentState() {
        return this.state;
    }

    getStateData(state = this.state) {
        return this.stateData.get(state) || {};
    }

    isState(state) {
        return this.state === state;
    }

    canTransitionTo(state) {
        const validTransitions = this.transitions.get(this.state) || [];
        return validTransitions.includes(state);
    }

    // State handlers
    onEnterWaiting() {
    // Entering WAITING state
        this.scene.isSpectating = false;
    }

    onUpdateWaiting() {
        // Check if we can start playing
        const playerCount = this.scene.playerManager.getAllPlayers().size;
        if (playerCount >= 2) {
            this.setState(this.STATES.PLAYING);
        }
    }

    onExitWaiting() {
        // Exiting WAITING state
    }

    onEnterPlaying() {
    // Entering PLAYING state
        this.scene.roundStartTime = this.scene.time.now;
        this.scene.ringRadius = this.scene.WORLD_RING_RADIUS;
        this.scene.maxPlayersThisRound = Math.max(this.scene.maxPlayersThisRound, this.scene.playerManager.getAllPlayers().size);
    }

    onUpdatePlaying() {
    // Round-end is orchestrated by GameScene (ring-master broadcasts and syncs restart).
    // Avoid auto-transitioning here to prevent race conditions and freezes.
    }

    onExitPlaying() {
        // Exiting PLAYING state
    }

    onEnterRoundEnd() {
    // Entering ROUND_END state
    // GameScene manages restart timing and round index.
    // No auto-transition here to avoid conflicts.
    }

    onUpdateRoundEnd() {
        // Wait for transition
    }

    onExitRoundEnd() {
        // Exiting ROUND_END state
        // Reset for next round
        this.scene.maxPlayersThisRound = 0;
    }

    onEnterSpectating() {
        // Entering SPECTATING state
        this.scene.isSpectating = true;
        
        // Hide the dead player completely
        const localPlayer = this.scene.playerManager.getLocalPlayer();
        if (localPlayer) {
            localPlayer.sprite.setVisible(false);
            localPlayer.glow.setVisible(false);
            // Broadcast death so all peers remove and hide this player
            if (this.scene.networkManager) {
                this.scene.networkManager.broadcast('player-death', { id: this.scene.playerId }, true);
            }
            // Remove from active players so counts reflect one remaining
            this.scene.playerManager.removePlayer(localPlayer.id);
        }
    }
    onUpdateSpectating() {
        // Wait for round to end
        if (this.scene.playerManager.getAllPlayers().size <= 1) {
            this.setState(this.STATES.ROUND_END);
        }
    }

    onExitSpectating() {
        // Exiting SPECTATING state
        this.scene.isSpectating = false;
        
        // Make player visible again for next round
        const localPlayer = this.scene.playerManager.getLocalPlayer();
        if (localPlayer) {
            localPlayer.sprite.setVisible(true);
            localPlayer.glow.setVisible(true);
            localPlayer.sprite.setAlpha(1);
            localPlayer.glow.setAlpha(0.4);
        }
    }

    // Event management for cleanup
    addEventCleanup(cleanupFn) {
        this.eventCleanup.push(cleanupFn);
    }

    cleanup() {
        // Execute all cleanup functions
        this.eventCleanup.forEach(fn => {
            try {
                fn();
            } catch (error) {
                // Cleanup error
            }
        });
        this.eventCleanup.length = 0;

        // Clear state data
        this.stateData.clear();
        this.stateHandlers.clear();
        this.transitions.clear();
    }
}
