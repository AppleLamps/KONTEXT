// Masonry layout helper functions
export class MasonryManager {
    constructor(galleryGrid) {
        this.galleryGrid = galleryGrid;
        this.isListView = false;
        this.currentZoom = 100;
        this.resizeObserver = null;
        this.init();
    }

    init() {
        this.setupResizeObserver();
        this.updateLayout();
    }

    setupResizeObserver() {
        // Observe when images load and resize
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(entries => {
                // Debounce layout updates
                clearTimeout(this.layoutTimer);
                this.layoutTimer = setTimeout(() => {
                    this.updateLayout();
                }, 100);
            });

            // Observe the gallery container
            this.resizeObserver.observe(this.galleryGrid);
        }
    }

    updateLayout() {
        if (this.isListView) return;
        
        // Store current column count for comparison
        const currentColumnCount = parseInt(this.galleryGrid.style.columnCount) || 4;
        
        // Force a reflow to ensure proper masonry positioning
        this.galleryGrid.style.columnCount = '';
        this.galleryGrid.offsetHeight; // Force reflow
        
        // Apply responsive column count based on container width and zoom
        const containerWidth = this.galleryGrid.offsetWidth;
        const zoomFactor = this.currentZoom / 100;
        const baseColumnWidth = 350 * zoomFactor;
        
        let columnCount = Math.max(1, Math.floor(containerWidth / baseColumnWidth));
        
        // Apply responsive breakpoints with zoom consideration
        if (containerWidth <= 600 * zoomFactor) {
            columnCount = 1;
        } else if (containerWidth <= 900 * zoomFactor) {
            columnCount = Math.min(columnCount, 2);
        } else if (containerWidth <= 1200 * zoomFactor) {
            columnCount = Math.min(columnCount, 3);
        } else {
            columnCount = Math.min(columnCount, 4);
        }

        // Add layout adjustment animation if column count changed
        if (currentColumnCount !== columnCount) {
            const imageCards = this.galleryGrid.querySelectorAll('.image-card');
            imageCards.forEach(card => {
                card.classList.add('masonry-adjust');
                setTimeout(() => {
                    card.classList.remove('masonry-adjust');
                }, 200);
            });
        }

        this.galleryGrid.style.columnCount = columnCount;
        
        // Update gap based on column count for better visual balance
        const gap = columnCount === 1 ? '16px' : '24px';
        this.galleryGrid.style.columnGap = gap;
    }

    setZoom(zoomLevel) {
        this.currentZoom = zoomLevel;
        
        if (this.isListView) return;
        
        // Update all image cards with zoom scaling
        const imageCards = this.galleryGrid.querySelectorAll('.image-card');
        imageCards.forEach(card => {
            card.style.transform = `scale(${zoomLevel / 100})`;
            card.style.transformOrigin = 'top center';
            card.style.marginBottom = `${24 * (zoomLevel / 100)}px`;
        });
        
        // Update layout after zoom change
        setTimeout(() => this.updateLayout(), 50);
    }

    setListView(isListView) {
        this.isListView = isListView;
        
        if (isListView) {
            this.galleryGrid.classList.add('list-view');
            // Reset any masonry styles
            this.galleryGrid.style.columnCount = '1';
            this.galleryGrid.style.display = 'flex';
            this.galleryGrid.style.flexDirection = 'column';
            
            // Reset card styles for list view
            const imageCards = this.galleryGrid.querySelectorAll('.image-card');
            imageCards.forEach(card => {
                card.style.transform = '';
                card.style.marginBottom = '16px';
            });
        } else {
            this.galleryGrid.classList.remove('list-view');
            this.galleryGrid.style.display = '';
            this.galleryGrid.style.flexDirection = '';
            this.updateLayout();
            this.setZoom(this.currentZoom); // Reapply zoom
        }
    }

    // Add new image cards with masonry-friendly loading
    addImages(imageCards) {
        if (this.isListView) return;
        
        // Handle image loading for proper masonry positioning
        imageCards.forEach((card, index) => {
            // Add entrance animation class
            card.classList.add('masonry-enter');
            
            const img = card.querySelector('img');
            if (img) {
                // Add loading class
                img.classList.add('loading-masonry');
                
                const handleImageLoad = () => {
                    img.classList.remove('loading-masonry');
                    img.classList.add('loaded-masonry');
                    
                    // Trigger layout update after image loads
                    setTimeout(() => this.updateLayout(), 10);
                };

                if (img.complete) {
                    handleImageLoad();
                } else {
                    img.addEventListener('load', handleImageLoad, { once: true });
                    img.addEventListener('error', handleImageLoad, { once: true });
                }
            }
            
            // Remove animation class after animation completes
            setTimeout(() => {
                card.classList.remove('masonry-enter');
            }, 400);
        });
    }

    // Optimize for performance
    optimizeForPerformance() {
        // Use CSS containment for better performance
        this.galleryGrid.style.contain = 'layout style';
        
        // Add will-change for smoother animations
        const imageCards = this.galleryGrid.querySelectorAll('.image-card');
        imageCards.forEach(card => {
            card.style.willChange = 'transform';
        });
    }

    // Clean up resources
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        clearTimeout(this.layoutTimer);
    }
}

// Export utility functions for direct use
export function initializeMasonry(galleryGrid) {
    return new MasonryManager(galleryGrid);
}

export function getOptimalImageHeight(imageWidth, originalWidth, originalHeight) {
    // Calculate aspect-ratio preserving height
    return Math.round((imageWidth * originalHeight) / originalWidth);
}

export function preloadImages(imageUrls) {
    // Preload images for smoother masonry experience
    return Promise.all(
        imageUrls.map(url => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = url;
            });
        })
    );
} 