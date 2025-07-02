// Gallery management functions
import { showNotification, showConfirmModal } from './utils.js';
import { deleteImage } from './api.js';

// Initialize event delegation for gallery
export function initializeGalleryEventDelegation() {
    const galleryGrid = document.getElementById('gallery-grid');
    if (!galleryGrid) return;
    
    // Single event listener for all gallery interactions
    galleryGrid.addEventListener('click', handleGalleryClick);
    galleryGrid.addEventListener('change', handleGalleryChange);
}

// Handle all gallery click events through delegation
function handleGalleryClick(event) {
    const target = event.target;
    const actionBtn = target.closest('.action-btn');
    const imageCard = target.closest('.image-card');
    const img = target.closest('img:not(.action-btn img)');
    
    if (!imageCard) return;
    
    const imageId = imageCard.dataset.imageId;
    const fullImageUrl = imageCard.dataset.fullUrl || imageCard.querySelector('img').src;
    
    // Handle action buttons
    if (actionBtn) {
        event.preventDefault();
        event.stopPropagation();
        
        const actionType = actionBtn.dataset.action;
        switch (actionType) {
            case 'download':
                downloadImage(fullImageUrl, imageId);
                break;
            case 'view':
                openImageModal(fullImageUrl);
                break;
            case 'use':
                useAsReference(imageId);
                break;
            case 'delete':
                deleteImageHandler(imageId);
                break;
        }
    }
    // Handle image click for modal
    else if (img && !target.closest('.image-card-actions')) {
        event.preventDefault();
        openImageModal(fullImageUrl);
    }
}

// Handle checkbox changes through delegation
function handleGalleryChange(event) {
    const target = event.target;
    
    if (target.classList.contains('image-select')) {
        handleImageSelection();
    }
}

export function createImageCard(image, prompt) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.imageId = image.id;
    card.dataset.fullUrl = image.url || image.originalUrl;
    
    const imageId = image.id;
    const fullImageUrl = image.url || image.originalUrl;
    const thumbnailUrl = image.thumbnailUrl || fullImageUrl;
    const timestamp = image.timestamp ? new Date(image.timestamp) : new Date();
    const timeString = timestamp.toLocaleString();
    const modelName = image.model || 'Unknown Model';
    
    // Create card HTML with new hover-based design
    card.innerHTML = `
        <div class="image-card-header">
            <input type="checkbox" class="image-select" data-image-id="${imageId}">
        </div>
        <img src="${thumbnailUrl}" alt="${prompt}" loading="lazy">
        <div class="image-card-overlay">
            <div class="image-card-details">
                <p class="image-card-prompt">${prompt}</p>
                <span class="image-card-meta">${modelName} &bull; ${timeString}</span>
            </div>
            <div class="image-card-actions">
                <button class="action-btn" data-action="download" title="Download"><i class="fas fa-download"></i></button>
                <button class="action-btn" data-action="use" title="Use as Reference"><i class="fas fa-copy"></i></button>
                <button class="action-btn" data-action="view" title="View"><i class="fas fa-expand"></i></button>
                <button class="action-btn action-btn-delete" data-action="delete" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
    
    return card;
}

export function updateGalleryView(currentView, emptyState) {
    const imageCards = document.querySelectorAll('.image-card');
    
    // Always show all images for both tag and history views
    imageCards.forEach(card => {
        card.style.display = 'block';
        card.style.visibility = 'visible';
    });
    
    // Show/hide empty state based on whether we have images
    if (emptyState) {
        if (imageCards.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
    }
    
    // Force a reflow to ensure changes are applied
    const galleryGrid = document.getElementById('gallery-grid');
    if (galleryGrid) {
        galleryGrid.offsetHeight; // Force reflow
    }
}

export function addImagesToGallery(images, prompt, galleryGrid) {
    // Hide empty state first
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.classList.add('hidden');
    }
    
    // Use document fragment for batch DOM operations
    const fragment = document.createDocumentFragment();
    const newImageCards = [];
    
    images.forEach((image, index) => {
        const card = createImageCard(image, prompt);
        
        // Add entrance animation styles immediately
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        
        fragment.appendChild(card);
        newImageCards.push(card);
    });
    
    // Single DOM manipulation: prepend all cards at once
    galleryGrid.insertBefore(fragment, galleryGrid.firstChild);
    
    // Trigger entrance animations with staggered delays
    newImageCards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
    
    return newImageCards;
}

// Action handlers (no longer need to be global)
function downloadImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `kontext-${filename || Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Download started', 'success');
}

function openImageModal(url) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 8px;
    `;
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    // Close on click
    modal.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Close on escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function useAsReference(imageId) {
    // Get the generated images from the main app context
    const generatedImages = window.generatedImages || [];
    const image = generatedImages.find(img => img.id == imageId);
    if (image) {
        const prompt = image.prompt || 'No prompt available';
        const promptTextarea = document.getElementById('prompt');
        if (promptTextarea) {
            promptTextarea.value = prompt;
            promptTextarea.style.height = 'auto';
            promptTextarea.style.height = promptTextarea.scrollHeight + 'px';
            showNotification('Prompt copied to input', 'success');
        }
    }
}

async function deleteImageHandler(imageId) {
    showConfirmModal('Are you sure you want to delete this image? This action cannot be undone.', async () => {
        try {
            await deleteImage(imageId);
            
            // Remove from DOM with animation
            const imageCard = document.querySelector(`[data-image-id="${imageId}"]`);
            if (imageCard) {
                imageCard.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    if (imageCard.parentNode) {
                        imageCard.parentNode.removeChild(imageCard);
                    }
                    // Update gallery view after removal
                    const emptyState = document.getElementById('empty-state');
                    updateGalleryView(window.currentView || 'tag', emptyState);
                }, 300);
            }
            
            // Remove from generatedImages array if it exists
            if (window.generatedImages) {
                const imageIndex = window.generatedImages.findIndex(img => img.id == imageId);
                if (imageIndex !== -1) {
                    window.generatedImages.splice(imageIndex, 1);
                }
            }
            
            showNotification('Image deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting image:', error);
            showNotification('Failed to delete image', 'error');
        }
    });
}

function handleImageSelection() {
    const selectedImages = document.querySelectorAll('.image-select:checked');
    const bulkActions = document.getElementById('bulk-actions');
    
    if (bulkActions) {
        if (selectedImages.length > 0) {
            bulkActions.style.display = 'flex';
        } else {
            bulkActions.style.display = 'none';
        }
    }
}

// Bulk operations (keep as global functions for now since they're called from UI)
window.selectAllImages = function() {
    const allCheckboxes = document.querySelectorAll('.image-select');
    allCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    handleImageSelection();
};

window.deselectAllImages = function() {
    const allCheckboxes = document.querySelectorAll('.image-select');
    allCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    handleImageSelection();
};

window.deleteSelectedImages = async function() {
    const selectedImages = document.querySelectorAll('.image-select:checked');
    if (selectedImages.length === 0) {
        showNotification('No images selected', 'error');
        return;
    }
    
    showConfirmModal(`Are you sure you want to delete ${selectedImages.length} selected image(s)? This action cannot be undone.`, async () => {
        let deletedCount = 0;
        let successCount = 0;
        const totalToDelete = selectedImages.length;
        
        // Use document fragment for batch DOM removals
        const imageCards = Array.from(selectedImages).map(checkbox => 
            document.querySelector(`[data-image-id="${checkbox.dataset.imageId}"]`)
        ).filter(Boolean);
        
        // Create array of promises for all delete operations
        const deletePromises = Array.from(selectedImages).map(async (checkbox, index) => {
            const imageId = checkbox.dataset.imageId;
            
            try {
                await deleteImage(imageId);
                successCount++;
                
                // Remove from DOM with staggered animation
                const imageCard = document.querySelector(`[data-image-id="${imageId}"]`);
                if (imageCard) {
                    imageCard.style.animation = 'fadeOut 0.3s ease';
                    setTimeout(() => {
                        if (imageCard.parentNode) {
                            imageCard.parentNode.removeChild(imageCard);
                        }
                        deletedCount++;
                        if (deletedCount === totalToDelete) {
                            const emptyState = document.getElementById('empty-state');
                            updateGalleryView(window.currentView || 'tag', emptyState);
                            handleImageSelection(); // Hide bulk actions
                        }
                    }, 300 + (index * 50)); // Stagger the animations
                }
                
                // Remove from generatedImages array if it exists
                if (window.generatedImages) {
                    const imageIndex = window.generatedImages.findIndex(img => img.id == imageId);
                    if (imageIndex !== -1) {
                        window.generatedImages.splice(imageIndex, 1);
                    }
                }
                
            } catch (error) {
                console.error('Error deleting image:', imageId, error);
                deletedCount++;
                if (deletedCount === totalToDelete) {
                    const emptyState = document.getElementById('empty-state');
                    updateGalleryView(window.currentView || 'tag', emptyState);
                    handleImageSelection(); // Hide bulk actions
                }
            }
        });
        
        // Wait for all delete operations to complete
        await Promise.allSettled(deletePromises);
        
        if (successCount > 0) {
            showNotification(`Successfully deleted ${successCount} image(s)`, 'success');
        }
        if (successCount < totalToDelete) {
            showNotification(`Failed to delete ${totalToDelete - successCount} image(s)`, 'error');
        }
    });
}; 