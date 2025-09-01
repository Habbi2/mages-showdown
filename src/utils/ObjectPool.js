export class ObjectPool {
    constructor(createFn, resetFn, maxSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.maxSize = maxSize;
        this.pool = [];
        this.active = new Set();
    }

    get() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        this.active.add(obj);
        return obj;
    }

    release(obj) {
        if (this.active.has(obj)) {
            this.active.delete(obj);
            this.resetFn(obj);
            
            if (this.pool.length < this.maxSize) {
                this.pool.push(obj);
            } else {
                // Destroy excess objects to prevent memory leaks
                if (obj.destroy) obj.destroy();
            }
        }
    }

    clear() {
        // Release all active objects
        for (const obj of this.active) {
            this.release(obj);
        }
        
        // Clear the pool
        for (const obj of this.pool) {
            if (obj.destroy) obj.destroy();
        }
        this.pool.length = 0;
        this.active.clear();
    }

    getStats() {
        return {
            pooled: this.pool.length,
            active: this.active.size,
            total: this.pool.length + this.active.size
        };
    }
}
