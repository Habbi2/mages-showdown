export class SpatialGrid {
    constructor(worldWidth, worldHeight, cellSize = 100) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.cellSize = cellSize;
        this.cols = Math.ceil(worldWidth / cellSize);
        this.rows = Math.ceil(worldHeight / cellSize);
        this.grid = new Array(this.cols * this.rows);
        this.objectCells = new Map(); // Track which cells each object is in
        
        this.clear();
    }

    clear() {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] = [];
        }
        this.objectCells.clear();
    }

    getIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return -1;
        }
        
        return row * this.cols + col;
    }

    insert(obj, x, y, radius = 0) {
        const cells = this.getCellsForObject(x, y, radius);
        
        // Remove from previous cells
        this.remove(obj);
        
        // Add to new cells
        for (const cellIndex of cells) {
            if (cellIndex >= 0 && cellIndex < this.grid.length) {
                this.grid[cellIndex].push(obj);
            }
        }
        
        this.objectCells.set(obj, cells);
    }

    remove(obj) {
        const cells = this.objectCells.get(obj);
        if (cells) {
            for (const cellIndex of cells) {
                if (cellIndex >= 0 && cellIndex < this.grid.length) {
                    const cell = this.grid[cellIndex];
                    const index = cell.indexOf(obj);
                    if (index !== -1) {
                        cell.splice(index, 1);
                    }
                }
            }
            this.objectCells.delete(obj);
        }
    }

    getCellsForObject(x, y, radius) {
        const cells = new Set();
        
        const minX = x - radius;
        const maxX = x + radius;
        const minY = y - radius;
        const maxY = y + radius;
        
        const startCol = Math.max(0, Math.floor(minX / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
        const startRow = Math.max(0, Math.floor(minY / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));
        
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                cells.add(row * this.cols + col);
            }
        }
        
        return Array.from(cells);
    }

    getNearby(x, y, radius = 0) {
        const cells = this.getCellsForObject(x, y, radius);
        const nearby = new Set();
        
        for (const cellIndex of cells) {
            if (cellIndex >= 0 && cellIndex < this.grid.length) {
                for (const obj of this.grid[cellIndex]) {
                    nearby.add(obj);
                }
            }
        }
        
        return Array.from(nearby);
    }

    getAll() {
        const all = new Set();
        for (const cell of this.grid) {
            for (const obj of cell) {
                all.add(obj);
            }
        }
        return Array.from(all);
    }

    getStats() {
        let totalObjects = 0;
        let occupiedCells = 0;
        let maxObjectsPerCell = 0;
        
        for (const cell of this.grid) {
            if (cell.length > 0) {
                occupiedCells++;
                totalObjects += cell.length;
                maxObjectsPerCell = Math.max(maxObjectsPerCell, cell.length);
            }
        }
        
        return {
            totalCells: this.grid.length,
            occupiedCells,
            totalObjects,
            maxObjectsPerCell,
            averageObjectsPerOccupiedCell: occupiedCells > 0 ? totalObjects / occupiedCells : 0
        };
    }
}
