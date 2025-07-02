// API functions for server communication
export async function generateImages(prompt, numImages, aspectRatio, model, imageUrl = null) {
    try {
        const requestBody = {
            prompt: prompt,
            num_images: numImages,
            aspect_ratio: aspectRatio,
            model: model
        };
        
        // Add image URL for editing models and upscaler
        if (imageUrl) {
            requestBody.image_url = imageUrl;
        }
        
        // Add model-specific parameters based on sliders in DOM
        if (model === 'juggernaut-pro') {
            const juggernautStrengthSlider = document.getElementById('juggernaut-strength');
            const juggernautGuidanceSlider = document.getElementById('juggernaut-guidance');
            const juggernautStepsSlider = document.getElementById('juggernaut-steps');
            
            requestBody.strength = parseFloat(juggernautStrengthSlider?.value || 0.95);
            requestBody.guidance_scale = parseFloat(juggernautGuidanceSlider?.value || 3.5);
            requestBody.num_inference_steps = parseInt(juggernautStepsSlider?.value || 40);
        }
        
        if (model === 'clarity-upscaler') {
            const upscaleFactorSlider = document.getElementById('upscale-factor');
            const creativitySlider = document.getElementById('creativity');
            const resemblanceSlider = document.getElementById('resemblance');
            const guidanceScaleSlider = document.getElementById('guidance-scale');
            const inferenceStepsSlider = document.getElementById('inference-steps');
            
            requestBody.upscale_factor = parseFloat(upscaleFactorSlider?.value || 2);
            requestBody.creativity = parseFloat(creativitySlider?.value || 0.35);
            requestBody.resemblance = parseFloat(resemblanceSlider?.value || 0.6);
            requestBody.guidance_scale = parseFloat(guidanceScaleSlider?.value || 4);
            requestBody.num_inference_steps = parseInt(inferenceStepsSlider?.value || 18);
        }
        
        if (model === 'scene-composition') {
            const sceneGuidanceScaleSlider = document.getElementById('scene-guidance-scale');
            const sceneInferenceStepsSlider = document.getElementById('scene-inference-steps');
            const sceneSafetyToleranceSlider = document.getElementById('scene-safety-tolerance');
            const sceneOutputFormatSelect = document.getElementById('scene-output-format');
            
            requestBody.guidance_scale = parseFloat(sceneGuidanceScaleSlider?.value || 3.5);
            requestBody.num_inference_steps = parseInt(sceneInferenceStepsSlider?.value || 30);
            requestBody.safety_tolerance = sceneSafetyToleranceSlider?.value || "2";
            requestBody.output_format = sceneOutputFormatSelect?.value || "jpeg";
        }
        
        if (model === 'hidream-i1-full') {
            const hidreamGuidanceScaleSlider = document.getElementById('hidream-guidance-scale');
            const hidreamInferenceStepsSlider = document.getElementById('hidream-inference-steps');
            const hidreamOutputFormatSelect = document.getElementById('hidream-output-format');
            const hidreamSafetyCheckerCheckbox = document.getElementById('hidream-safety-checker');
            
            requestBody.hidream_guidance_scale = parseFloat(hidreamGuidanceScaleSlider?.value || 5);
            requestBody.hidream_inference_steps = parseInt(hidreamInferenceStepsSlider?.value || 50);
            requestBody.hidream_output_format = hidreamOutputFormatSelect?.value || "jpeg";
            requestBody.hidream_safety_checker = hidreamSafetyCheckerCheckbox?.checked !== false;
        }
        
        if (model === 'kontext-max-text-to-image') {
            const kontextMaxGuidanceScaleSlider = document.getElementById('kontext-max-guidance-scale');
            const kontextMaxSafetyToleranceSlider = document.getElementById('kontext-max-safety-tolerance');
            const kontextMaxOutputFormatSelect = document.getElementById('kontext-max-output-format');
            const kontextMaxAspectRatioSelect = document.getElementById('kontext-max-aspect-ratio');
            const kontextMaxSyncModeCheckbox = document.getElementById('kontext-max-sync-mode');
            
            requestBody.kontext_max_guidance_scale = parseFloat(kontextMaxGuidanceScaleSlider?.value || 3.5);
            requestBody.kontext_max_safety_tolerance = kontextMaxSafetyToleranceSlider?.value || "2";
            requestBody.kontext_max_output_format = kontextMaxOutputFormatSelect?.value || "jpeg";
            requestBody.kontext_max_aspect_ratio = kontextMaxAspectRatioSelect?.value || "1:1";
            requestBody.kontext_max_sync_mode = kontextMaxSyncModeCheckbox?.checked || false;
        }
        
        console.log('Sending request to server:', requestBody);
        
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.images;
    } catch (error) {
        console.error('Error generating images:', error);
        throw error;
    }
}

export async function improvePrompt(prompt, imageUrl = null) {
    try {
        const requestBody = { prompt };
        
        // Include uploaded image URL if available for vision-based improvement
        if (imageUrl) {
            requestBody.image_url = imageUrl;
        }
        
        const response = await fetch('/api/enhance-prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.enhancedPrompt;
    } catch (error) {
        console.error('Error calling enhance-prompt API:', error);
        throw error;
    }
}

export async function loadPhotoHistory() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const historyImages = data.images || [];
        
        console.log('Loaded photo history:', historyImages.length, 'images');
        return historyImages;
        
    } catch (error) {
        console.error('Error loading photo history:', error);
        throw error;
    }
}

export async function uploadImage(file) {
    try {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            throw new Error('Please select a valid image file');
        }
        
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        
        // Upload to server
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const data = await response.json();
        return data.url;
        
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

export async function deleteImage(imageId) {
    try {
        const response = await fetch(`/api/history/${imageId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete image: ${response.status}`);
        }
        return true;
    } catch (error) {
        console.error('Error deleting image:', error);
        throw error;
    }
} 