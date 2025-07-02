// Modern Kontext Image Generator - Modular Version
import { updateGenerateButton, showNotification, showConfirmModal } from './modules/utils.js';
import { generateImages, improvePrompt, loadPhotoHistory } from './modules/api.js';
import { createImageCard, updateGalleryView, addImagesToGallery, initializeGalleryEventDelegation } from './modules/gallery.js';
import { initUploads, initializeGalleryDragDrop } from './modules/uploads.js';
import { initializeMasonry } from './modules/masonry.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log('Kontext Image Generator loaded');
    
    // DOM Elements
    const generateBtn = document.getElementById('generate-btn');
    const aiImproveBtn = document.getElementById('ai-improve');
    const promptTextarea = document.getElementById('prompt');
    const modelSelect = document.getElementById('model-select');
    const galleryGrid = document.getElementById('gallery-grid');
    const emptyState = document.getElementById('empty-state');
    const advancedBtn = document.querySelector('.btn-advanced');
    const advancedContent = document.querySelector('.advanced-content');
    const numImagesGroup = document.getElementById('num-images-group');
    const numImagesInput = document.getElementById('num-images');
    const aspectRatioSelect = document.getElementById('aspect-ratio');
    const zoomSlider = document.getElementById('zoom-slider');
    const tagBtns = document.querySelectorAll('.tag-btn');
    
    // Image upload elements
    const imageUploadSection = document.getElementById('image-upload-section');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImageBtn = document.getElementById('remove-image');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const imageUploadContainer = document.querySelector('.image-upload-container');
    
    // TTS section
    const ttsSection = document.getElementById('tts-section');
    const upscalerSection = document.getElementById('upscaler-section');
    const juggernautSection = document.getElementById('juggernaut-section');
    const sceneCompositionSection = document.getElementById('scene-composition-section');
    const hidreamSection = document.getElementById('hidream-section');
    
    // State
    let isGenerating = false;
    let generatedImages = [];
    let currentView = 'tag'; // 'tag' or 'history'
    let masonryManager = null;
    
    // Make global variables accessible for legacy onclick handlers
    window.generatedImages = generatedImages;
    window.currentView = currentView;
    
    // Initialize upload functionality
    const uploadManager = initUploads({
        imageUpload,
        imagePreview,
        previewImg,
        removeImageBtn,
        uploadPlaceholder,
        imageUploadContainer
    });
    
    // Initialize gallery drag and drop
    initializeGalleryDragDrop(document.querySelector('.gallery-container'));
    
    // Initialize gallery event delegation
    initializeGalleryEventDelegation();
    
    // Initialize masonry layout
    if (galleryGrid) {
        masonryManager = initializeMasonry(galleryGrid);
        masonryManager.optimizeForPerformance();
    }
    
    // Load photo history on page load
    loadHistoryImages();
    
    // Advanced options toggle
    if (advancedBtn && advancedContent) {
        advancedBtn.addEventListener('click', function() {
            const isVisible = !advancedContent.classList.contains('hidden');
            if (isVisible) {
                advancedContent.classList.add('hidden');
                advancedBtn.classList.remove('active');
            } else {
                advancedContent.classList.remove('hidden');
                advancedBtn.classList.add('active');
            }
        });
    }
    
    // Tag buttons functionality
    tagBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tagBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const isTag = this.querySelector('i').classList.contains('fa-tag');
            currentView = isTag ? 'tag' : 'history';
            window.currentView = currentView;
            
            updateGalleryView(currentView, emptyState);
        });
    });
    
    // Zoom slider functionality
    if (zoomSlider) {
        zoomSlider.addEventListener('input', function() {
            const zoomLevel = this.value;
            if (masonryManager) {
                masonryManager.setZoom(zoomLevel);
            } else {
                // Fallback for non-masonry mode
                const zoomFactor = zoomLevel / 100;
                const imageCards = document.querySelectorAll('.image-card');
                imageCards.forEach(card => {
                    card.style.transform = `scale(${zoomFactor})`;
                });
            }
        });
    }
    
    // Grid view button functionality
    const gridViewBtn = document.querySelector('.view-btn');
    if (gridViewBtn) {
        gridViewBtn.addEventListener('click', function() {
            if (galleryGrid && masonryManager) {
                const isCurrentlyListView = galleryGrid.classList.contains('list-view');
                const newIsListView = !isCurrentlyListView;
                
                masonryManager.setListView(newIsListView);
                
                const icon = this.querySelector('i');
                if (newIsListView) {
                    icon.className = 'fas fa-list';
                    this.title = 'List view';
                    this.setAttribute('aria-label', 'List view');
                } else {
                    icon.className = 'fas fa-th';
                    this.title = 'Grid view (Masonry Layout)';
                    this.setAttribute('aria-label', 'Grid view');
                }
            }
        });
    }
    
    // Generate button functionality
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }
    
    // AI Improve button functionality
    if (aiImproveBtn) {
        aiImproveBtn.addEventListener('click', handleAIImprove);
    }
    
    // Prompt textarea auto-resize
    if (promptTextarea) {
        promptTextarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }
    
    // Model selection handler
    if (modelSelect) {
        modelSelect.addEventListener('change', function() {
            const isKontextEdit = this.value === 'kontext-edit' || this.value === 'kontext-max' || this.value === 'seededit';
            const isTTS = this.value === 'minimax-tts';
            const isUpscaler = this.value === 'clarity-upscaler';
            const isJuggernaut = this.value === 'juggernaut-pro';
            const isSceneComposition = this.value === 'scene-composition';
            const isHidream = this.value === 'hidream-i1-full';
            const isKontextMaxTextToImage = this.value === 'kontext-max-text-to-image';
            
            // Show/hide sections based on model
            toggleSection(imageUploadSection, isKontextEdit || isUpscaler || isJuggernaut || isSceneComposition);
            toggleSection(ttsSection, isTTS);
            toggleSection(juggernautSection, isJuggernaut);
            toggleSection(upscalerSection, isUpscaler);
            toggleSection(sceneCompositionSection, isSceneComposition);
            toggleSection(hidreamSection, isHidream);
            
            // Show/hide Kontext Max text-to-image section
            const kontextMaxSection = document.getElementById('kontext-max-text-to-image-section');
            toggleSection(kontextMaxSection, isKontextMaxTextToImage);
            
            // Update model info badge and description
            const modelInfo = document.querySelector('.model-info');
            const modelBadge = modelInfo?.querySelector('.model-badge');
            const modelDescription = modelInfo?.querySelector('.model-description');
            
            if (modelBadge && modelDescription) {
                if (isKontextMaxTextToImage) {
                    modelBadge.textContent = 'Premium';
                    modelBadge.className = 'model-badge premium';
                    modelDescription.textContent = 'Frontier image generation with maximum performance and prompt adherence.';
                } else if (isKontextEdit || this.value === 'kontext-max') {
                    modelBadge.textContent = 'Premium';
                    modelBadge.className = 'model-badge premium';
                    modelDescription.textContent = 'Premium image editing with maximum quality and precision.';
                } else if (isTTS) {
                    modelBadge.textContent = 'Audio';
                    modelBadge.className = 'model-badge audio';
                    modelDescription.textContent = 'High-quality text-to-speech with voice cloning capabilities.';
                } else {
                    modelBadge.textContent = 'Standard';
                    modelBadge.className = 'model-badge';
                    modelDescription.textContent = 'High-quality image generation and processing.';
                }
            }
            
            // Update prompt placeholder based on model
            if (promptTextarea) {
                if (isKontextEdit) {
                    promptTextarea.placeholder = 'Describe how you want to edit the image...';
                } else if (isTTS) {
                    promptTextarea.placeholder = 'This model uses text-to-speech. Use the TTS section below.';
                } else if (isUpscaler) {
                    promptTextarea.placeholder = 'Describe the image details for better upscaling (optional)...';
                } else if (isJuggernaut) {
                    promptTextarea.placeholder = 'Describe how you want to transform the image...';
                } else if (isSceneComposition) {
                    promptTextarea.placeholder = 'Describe the scene you want to create...';
                } else if (isHidream) {
                    promptTextarea.placeholder = 'Describe the image you want to generate with Hidream I1 Full...';
                } else if (isKontextMaxTextToImage) {
                    promptTextarea.placeholder = 'Describe the image you want to generate with maximum quality and precision...';
                } else {
                    promptTextarea.placeholder = 'Enter your prompt here...';
                }
            }
        });
    }
    
    // Number of images selection
    if (numImagesGroup) {
        numImagesGroup.addEventListener('click', function(e) {
            if (e.target.classList.contains('num-img-btn')) {
                document.querySelectorAll('.num-img-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                if (numImagesInput) {
                    numImagesInput.value = e.target.dataset.value;
                }
            }
        });
    }
    
    // Initialize slider handlers for dynamic value updates
    initSliderHandlers();
    
    // Main handler functions
    async function handleGenerate() {
        if (isGenerating) return;
        
        const prompt = promptTextarea?.value?.trim();
        if (!prompt) {
            showNotification('Please enter a prompt', 'error');
            return;
        }
        
        try {
            isGenerating = true;
            updateGenerateButton(generateBtn, true);
            
            const numImages = parseInt(numImagesInput?.value || '1');
            const aspectRatio = aspectRatioSelect?.value || '1:1';
            const model = modelSelect?.value || 'kontext';
            const imageUrl = uploadManager.getUploadedImageUrl();
            
            console.log('Generating with:', { prompt, numImages, aspectRatio, model, imageUrl });
            
            // Check if image is required for editing/transformation models
            const requiresImage = ['kontext-edit', 'kontext-max', 'seededit', 'juggernaut-pro', 'clarity-upscaler', 'scene-composition'];
            if (requiresImage.includes(model) && !imageUrl) {
                showNotification('Please upload an image for this model', 'error');
                return;
            }
            
            // Create and add golden pulsing placeholders for each image
            const placeholders = [];
            for (let i = 0; i < numImages; i++) {
                const placeholder = document.createElement('div');
                placeholder.className = 'pulsing-placeholder';
                
                // Add generating text
                const generatingText = document.createElement('div');
                generatingText.textContent = 'Generating...';
                generatingText.style.cssText = `
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    color: #ffd700;
                    font-size: 14px;
                    font-weight: 500;
                    z-index: 1;
                `;
                placeholder.appendChild(generatingText);
                
                if (galleryGrid) {
                    galleryGrid.prepend(placeholder);
                    placeholders.push(placeholder);
                }
            }
            
            // Hide empty state while generating
            if (emptyState) {
                emptyState.classList.add('hidden');
            }
            
            const images = await generateImages(prompt, numImages, aspectRatio, model, imageUrl);
            
            // Remove all placeholders
            placeholders.forEach(placeholder => placeholder.remove());
            
            if (images && images.length > 0) {
                // Add to gallery first
                const newImageCards = addImagesToGallery(images, prompt, galleryGrid);
                
                // Integrate with masonry
                if (masonryManager && newImageCards) {
                    masonryManager.addImages(newImageCards);
                }
                
                // Update state
                generatedImages.unshift(...images);
                window.generatedImages = generatedImages;
                
                // Force gallery view update to ensure images are visible
                updateGalleryView(currentView, emptyState);
                
                // Additional force refresh to ensure DOM is updated
                setTimeout(() => {
                    updateGalleryView(currentView, emptyState);
                }, 100);
                
                showNotification(`Generated ${images.length} image(s) successfully!`, 'success');
            } else {
                showNotification('No images were generated', 'error');
                // Show empty state again if no images were generated
                updateGalleryView(currentView, emptyState);
            }
            
        } catch (error) {
            console.error('Generation error:', error);
            showNotification('Failed to generate images. Please try again.', 'error');
            // Remove placeholders on error
            const placeholders = document.querySelectorAll('.pulsing-placeholder');
            placeholders.forEach(placeholder => placeholder.remove());
            // Update gallery view to show empty state if needed
            updateGalleryView(currentView, emptyState);
        } finally {
            isGenerating = false;
            updateGenerateButton(generateBtn, false);
        }
    }
    
    async function handleAIImprove() {
        const prompt = promptTextarea?.value?.trim();
        if (!prompt) {
            showNotification('Please enter a prompt to improve', 'error');
            return;
        }
        
        try {
            aiImproveBtn.disabled = true;
            aiImproveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Improving...';
            
            const imageUrl = uploadManager.getUploadedImageUrl();
            const improvedPrompt = await improvePrompt(prompt, imageUrl);
            
            promptTextarea.value = improvedPrompt;
            promptTextarea.style.height = 'auto';
            promptTextarea.style.height = promptTextarea.scrollHeight + 'px';
            
            showNotification('Prompt improved successfully!', 'success');
            
        } catch (error) {
            console.error('AI Improve error:', error);
            showNotification('Failed to improve prompt. Please try again.', 'error');
        } finally {
            aiImproveBtn.disabled = false;
            aiImproveBtn.innerHTML = '<i class="fas fa-magic"></i> AI Improve';
        }
    }
    
    async function loadHistoryImages() {
        try {
            const historyImages = await loadPhotoHistory();
            
            if (historyImages.length > 0) {
                // Clear existing images
                generatedImages = [];
                galleryGrid.innerHTML = '';
                
                // Use document fragment for batch DOM operations
                const fragment = document.createDocumentFragment();
                
                // Add each image to fragment
                const imageCards = [];
                historyImages.forEach(image => {
                    const imageCard = createImageCard(image, image.prompt || 'No prompt');
                    fragment.appendChild(imageCard);
                    imageCards.push(imageCard);
                });
                
                // Single DOM manipulation: append all cards at once
                galleryGrid.appendChild(fragment);
                
                // Integrate with masonry
                if (masonryManager && imageCards.length > 0) {
                    masonryManager.addImages(imageCards);
                }
                
                // Update state
                generatedImages = historyImages;
                window.generatedImages = generatedImages;
                
                // Hide empty state
                if (emptyState) {
                    emptyState.classList.add('hidden');
                }
                
                updateGalleryView(currentView, emptyState);
            }
            
        } catch (error) {
            console.error('Error loading photo history:', error);
            // Don't show error notification for history loading failure
        }
    }
    
    // Helper functions
    function toggleSection(section, show) {
        if (section) {
            if (show) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        }
    }
    
    function initSliderHandlers() {
        // Initialize all range sliders with dynamic value display
        const sliders = document.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            const valueDisplay = document.getElementById(slider.id + '-value');
            if (valueDisplay) {
                slider.addEventListener('input', function() {
                    valueDisplay.textContent = this.value;
                });
            }
        });
    }
}); 