// File upload and drag-drop functionality
import { showNotification } from './utils.js';
import { uploadImage } from './api.js';
import { addImagesToGallery } from './gallery.js';

export function initUploads(elements) {
    const {
        imageUpload,
        imagePreview,
        previewImg,
        removeImageBtn,
        uploadPlaceholder,
        imageUploadContainer
    } = elements;

    let uploadedImageUrl = null;

    // Image upload handler
    if (imageUpload) {
        imageUpload.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                await handleImageUpload(file);
            }
        });
    }

    // Remove image button
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', removeUploadedImage);
    }

    // Drag and drop for image upload container
    if (imageUploadContainer) {
        imageUploadContainer.addEventListener('dragover', handleDragOver);
        imageUploadContainer.addEventListener('dragleave', handleDragLeave);
        imageUploadContainer.addEventListener('drop', handleDrop);
    }

    async function handleImageUpload(file) {
        try {
            // Show loading state
            if (uploadPlaceholder) {
                uploadPlaceholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i><p>Uploading...</p>';
            }
            
            // Upload to server
            uploadedImageUrl = await uploadImage(file);
            
            // Show preview
            if (previewImg && imagePreview && uploadPlaceholder) {
                previewImg.src = URL.createObjectURL(file);
                imagePreview.classList.remove('hidden');
                uploadPlaceholder.classList.add('hidden');
            }
            
            showNotification('Image uploaded successfully!', 'success');
            
        } catch (error) {
            console.error('Upload error:', error);
            showNotification(error.message || 'Failed to upload image. Please try again.', 'error');
            
            // Reset upload placeholder
            if (uploadPlaceholder) {
                uploadPlaceholder.innerHTML = `
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Click to upload an image or drag and drop</p>
                    <span class="upload-hint">Supports JPG, PNG, WebP</span>
                `;
            }
        }
    }

    function removeUploadedImage() {
        uploadedImageUrl = null;
        
        if (imagePreview) {
            imagePreview.classList.add('hidden');
        }
        if (uploadPlaceholder) {
            uploadPlaceholder.classList.remove('hidden');
        }
        if (imageUpload) {
            imageUpload.value = '';
        }
        
        showNotification('Image removed', 'info');
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (imageUploadContainer) {
            imageUploadContainer.classList.add('dragover');
        }
    }

    function handleDragLeave(event) {
        event.preventDefault();
        if (imageUploadContainer) {
            imageUploadContainer.classList.remove('dragover');
        }
    }

    async function handleDrop(event) {
        event.preventDefault();
        if (imageUploadContainer) {
            imageUploadContainer.classList.remove('dragover');
        }
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                await handleImageUpload(file);
            } else {
                showNotification('Please drop a valid image file', 'error');
            }
        }
    }

    // Return the current uploaded image URL
    return {
        getUploadedImageUrl: () => uploadedImageUrl,
        setUploadedImageUrl: (url) => { uploadedImageUrl = url; },
        removeUploadedImage
    };
}

export function initializeGalleryDragDrop(galleryContainer) {
    let isDraggingOverGallery = false;

    if (!galleryContainer) return;

    // Add drag and drop event listeners to gallery
    galleryContainer.addEventListener('dragover', handleGalleryDragOver);
    galleryContainer.addEventListener('dragleave', handleGalleryDragLeave);
    galleryContainer.addEventListener('drop', handleGalleryDrop);

    function handleGalleryDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Only handle image files
        const hasImageFiles = Array.from(event.dataTransfer.items).some(item => 
            item.type.startsWith('image/')
        );
        
        if (hasImageFiles && !isDraggingOverGallery) {
            isDraggingOverGallery = true;
            showGalleryDropZone();
        }
    }

    function handleGalleryDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Check if we're leaving the gallery container completely
        if (!galleryContainer.contains(event.relatedTarget)) {
            isDraggingOverGallery = false;
            hideGalleryDropZone();
        }
    }

    async function handleGalleryDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        
        isDraggingOverGallery = false;
        hideGalleryDropZone();
        
        const files = Array.from(event.dataTransfer.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length > 0) {
            await processDroppedImages(files);
        } else {
            showNotification('Please drop valid image files', 'error');
        }
    }

    function showGalleryDropZone() {
        // Remove existing drop zone
        const existing = document.querySelector('.gallery-drop-zone');
        if (existing) existing.remove();

        const dropZone = document.createElement('div');
        dropZone.className = 'gallery-drop-zone active';
        dropZone.innerHTML = `
            <div class="drop-zone-content">
                <i class="fa-solid fa-cloud-upload-alt"></i>
                <h3>Drop images here to add to gallery</h3>
                <p>Release to upload and save to history</p>
                <div class="drop-zone-hint">
                    <i class="fa-solid fa-images"></i>
                    Multiple images supported
                </div>
            </div>
        `;

        galleryContainer.appendChild(dropZone);
        
        // Trigger animation
        requestAnimationFrame(() => {
            dropZone.style.opacity = '1';
            dropZone.style.transform = 'scale(1)';
        });
    }

    function hideGalleryDropZone() {
        const dropZone = document.querySelector('.gallery-drop-zone');
        if (dropZone) {
            dropZone.style.opacity = '0';
            dropZone.style.transform = 'scale(0.95)';
            setTimeout(() => {
                if (dropZone.parentNode) {
                    dropZone.parentNode.removeChild(dropZone);
                }
            }, 300);
        }
    }

    async function processDroppedImages(imageFiles) {
        showNotification(`Processing ${imageFiles.length} image(s)...`, 'info');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const file of imageFiles) {
            try {
                const imageUrl = await uploadImage(file);
                
                // Create image data object similar to generated images
                const imageData = {
                    id: `uploaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    url: imageUrl,
                    originalUrl: imageUrl,
                    thumbnailUrl: imageUrl,
                    prompt: `Uploaded: ${file.name}`,
                    model: 'User Upload',
                    timestamp: Date.now()
                };
                
                // Add to gallery using the imported addImagesToGallery function
                const galleryGrid = document.getElementById('gallery-grid');
                if (galleryGrid) {
                    addImagesToGallery([imageData], imageData.prompt, galleryGrid);
                }
                
                // Add to generatedImages array if it exists
                if (window.generatedImages) {
                    window.generatedImages.unshift(imageData);
                }
                
                successCount++;
                
            } catch (error) {
                console.error('Error processing dropped image:', file.name, error);
                failCount++;
            }
        }
        
        // Show results
        if (successCount > 0) {
            showNotification(`Successfully added ${successCount} image(s) to gallery`, 'success');
        }
        if (failCount > 0) {
            showNotification(`Failed to process ${failCount} image(s)`, 'error');
        }
    }
} 