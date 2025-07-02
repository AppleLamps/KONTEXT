import { fal } from "@fal-ai/client";
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { put, del } from '@vercel/blob';
import { kv } from '@vercel/kv';

dotenv.config();

// Configure Fal.ai SDK with API key from environment variables
fal.config({
    credentials: process.env.FAL_API_KEY
});

const app = express();
const port = 3000;

// Create audio directory if it doesn't exist
const audioDir = path.join(process.cwd(), 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

// Middleware
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json()); // Parse JSON bodies
app.use(express.static('.'));
app.use('/audio', express.static(audioDir)); // Serve audio files

// Handle favicon.ico requests to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response
});

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Multer setup for audio uploads
const audioUpload = multer({ dest: 'audio/' });

// IMPORTANT: Use environment variable for FAL API key in production
const falApiKey = process.env.FAL_API_KEY;

// IMPORTANT: Use environment variable for xAI API key in production
const xaiApiKey = process.env.XAI_API_KEY;

// NEW version of saveImageToHistory using Vercel Blob
async function saveImageToHistory(imageUrl, metadata) {
    try {
        const timestamp = Date.now();
        const imageId = `img_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

        // 1. Fetch the image from its source URL
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const imageBuffer = await response.arrayBuffer().then(Buffer.from);
        
        // 2. Create a thumbnail from the image buffer
        const thumbnailBuffer = await createThumbnail(imageBuffer);

        // 3. Upload both the full image and thumbnail to Vercel Blob
        const [imageBlob, thumbnailBlob] = await Promise.all([
             put(`${imageId}_full.jpg`, imageBuffer, { access: 'public', addRandomSuffix: false }),
             thumbnailBuffer ? put(`${imageId}_thumb.jpg`, thumbnailBuffer, { access: 'public', addRandomSuffix: false }) : Promise.resolve(null)
        ]);

        // 4. Prepare metadata with the new Blob URLs
        const imageData = {
            id: imageId,
            url: imageBlob.url,
            thumbnailUrl: thumbnailBlob ? thumbnailBlob.url : imageBlob.url,
            originalUrl: imageUrl,
            prompt: metadata.prompt,
            model: metadata.model,
            timestamp: timestamp,
            createdAt: new Date().toISOString(),
            metadata: metadata
        };

        // 5. Save the metadata to your Vercel KV store
        await kv.lpush('images', JSON.stringify(imageData));
        await kv.ltrim('images', 0, 999); // Keep the latest 1000 images

        return imageData;

    } catch (error) {
        console.error('Error saving image to history:', error);
        throw error;
    }
}

// Route to get photo history from Vercel KV
app.get('/history', async (req, res) => {
    try {
        const imageJsonStrings = await kv.lrange('images', 0, -1);
        const history = imageJsonStrings.map(str => JSON.parse(str));
        res.json({ images: history });
    } catch (error) {
        console.error('Error loading photo history from KV:', error);
        res.status(500).json({ error: 'Failed to load photo history' });
    }
});

// Route to delete image from Vercel Blob and KV
app.delete('/history/:imageId', async (req, res) => {
    try {
        const imageId = req.params.imageId;
        const imageJsonStrings = await kv.lrange('images', 0, -1);
        const imageToDeleteString = imageJsonStrings.find(str => str.includes(`"id":"${imageId}"`));

        if (imageToDeleteString) {
            const imageToDelete = JSON.parse(imageToDeleteString);

            // 1. Delete the image and thumbnail from Vercel Blob
            await del([imageToDelete.url, imageToDelete.thumbnailUrl]);

            // 2. Remove the metadata from the Vercel KV list
            await kv.lrem('images', 1, imageToDeleteString);
           
            res.json({ success: true, message: 'Image deleted successfully' });
        } else {
            res.status(404).json({ error: 'Image not found' });
        }
    } catch (error) {
        console.error('Error deleting image from history:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// Route to upload image to Fal storage
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Use Fal SDK for file upload
        const file = new File([req.file.buffer], req.file.originalname, {
            type: req.file.mimetype
        });
        
        const url = await fal.storage.upload(file);
        
        res.json({ url: url });
    } catch (error) {
        console.error('Error uploading to Fal storage:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Route to upload audio files to Vercel Blob storage
app.post('/upload-audio', audioUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }
        // Upload audio file to Vercel Blob
        const file = new File([req.file.buffer], req.file.originalname, {
            type: req.file.mimetype
        });
        const audioBlob = await put(`audio_${Date.now()}_${req.file.originalname}`, req.file.buffer, { access: 'public', addRandomSuffix: false });
        res.json({ url: audioBlob.url, filename: req.file.originalname });
    } catch (error) {
        console.error('Error uploading audio to Vercel Blob:', error);
        res.status(500).json({ error: 'Failed to upload audio' });
    }
});

// Route to clone voice using MiniMax API
app.post('/clone-voice', async (req, res) => {
    try {
        const { audio_url } = req.body;
        if (!audio_url) return res.status(400).json({ error: 'No audio_url provided' });
        
        // Check if the audio_url is a local URL and needs to be uploaded to fal.ai storage
        let falAudioUrl = audio_url;
        if (audio_url.includes('localhost') || audio_url.startsWith('/')) {
            // Extract the filename from the local URL
            const filename = audio_url.split('/').pop();
            const localFilePath = path.join(audioDir, filename);
            
            if (!fs.existsSync(localFilePath)) {
                return res.status(400).json({ error: 'Audio file not found' });
            }
            
            // Read the local audio file and upload it to fal.ai storage
            const audioBuffer = fs.readFileSync(localFilePath);
            
            // Determine MIME type based on file extension
            let mimeType = 'audio/wav';
            const ext = path.extname(filename).toLowerCase();
            if (ext === '.mp3') mimeType = 'audio/mpeg';
            else if (ext === '.m4a') mimeType = 'audio/mp4';
            else if (ext === '.ogg') mimeType = 'audio/ogg';
            else if (ext === '.flac') mimeType = 'audio/flac';
            
            const audioFile = new File([audioBuffer], filename, {
                type: mimeType
            });
            
            falAudioUrl = await fal.storage.upload(audioFile);
            console.log('Uploaded audio to fal.ai storage:', falAudioUrl);
        }
        
        const result = await fal.subscribe("fal-ai/minimax/voice-clone", {
            input: { audio_url: falAudioUrl }
        });
        
        const { custom_voice_id } = result.data;
        if (!custom_voice_id) throw new Error('No custom_voice_id returned');
        
        res.json({ custom_voice_id });
    } catch (error) {
        console.error('Voice cloning error:', error);
        res.status(500).json({ error: error.message || error });
    }
});

// Route to edit image using Flux Kontext API
app.post('/edit', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file.path;
        const prompt = req.body.prompt;
        const photoCount = parseInt(req.body.photoCount);
        
        // Get advanced options
        const seed = req.body.seed ? parseInt(req.body.seed) : null;
        const guidanceScale = parseFloat(req.body.guidanceScale);
        const inferenceSteps = parseInt(req.body.inferenceSteps);
        const outputFormat = req.body.outputFormat;
        const resolutionMode = req.body.resolutionMode;
        
        // Read the image file as a buffer
        const imageBuffer = fs.readFileSync(imagePath);
        
        // Prepare payload for Fal API
        const payload = {
            image: imageBuffer,
            prompt: prompt,
            num_images: photoCount,
            guidance_scale: guidanceScale,
            num_inference_steps: inferenceSteps,
            output_format: outputFormat,
            resolution_mode: resolutionMode
        };
        if (seed) {
            payload.seed = seed;
        }
        
        // Call Fal API (mocked here)
        console.log('Sending payload to Fal API:', payload);
        const falResponse = await mockFalApiCall(payload);
        
        // Clean up the uploaded file
        fs.unlinkSync(imagePath);
        
        // Return the result to the client
        res.json(falResponse);
    } catch (error) {
        console.error('Error processing edit request:', error);
        res.status(500).json({ error: 'Failed to process edit request' });
    }
});

// Route to enhance prompt using xAI Grok-2 Vision API
app.post('/enhance-prompt', async (req, res) => {
    try {
        const { prompt, image_url } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        // Call xAI Grok-2 Vision API to rewrite the prompt for Flux Kontext image editing
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${xaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'grok-2-vision-latest',
                messages: [{
                    role: 'system',
                    content: '**Role:**\nYou are an expert prompt engineer for Flux-Kontext-Max AI image editing. Analyze the uploaded image and create a concise, precise prompt that makes only the user\'s requested changes while preserving everything else.\n\n**Critical Rules:**\n1. ONLY output the final prompt - no analysis, no explanations, no extra text\n2. Make ONLY the change the user requests - don\'t add new scenarios or environments\n3. Preserve the exact pose, expression, lighting, background, and style\n4. Be specific about what changes and what stays the same\n\n**Output Format:**\nJust the prompt text, nothing else.\n\n**Examples:**\n\nUser: "change her outfit to a red dress"\nOutput: Replace the current black workout outfit with an elegant red dress while keeping everything else identical. Maintain the same pose, facial expression, hair, lighting, and background. The red dress should fit naturally with the indoor setting and lighting. Keep the photorealistic style and image quality.\n\nUser: "add sunglasses"\nOutput: Add stylish sunglasses to the person while preserving their exact pose, expression, outfit, and all other details. Keep the same lighting, background, and photographic style. The sunglasses should look natural and properly fitted.\n\nUser: "change background to beach"\nOutput: Replace the current indoor background with a tropical beach setting while keeping the subject, pose, outfit, and lighting exactly the same. Ensure the beach background complements the existing lighting and maintains the photorealistic quality.\n\n**Remember: Output ONLY the prompt, no analysis or explanations.**'
                }, {
                    role: 'user',
                    content: image_url ? [
                        {
                            type: 'image_url',
                            image_url: {
                                url: image_url,
                                detail: 'high'
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ] : prompt
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`xAI API request failed with status ${response.status}`);
        }

        const data = await response.json();
        // Extract the rewritten prompt from the response
        const enhancedPrompt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!enhancedPrompt) {
            throw new Error('No content found in xAI API response');
        }
        res.json({ enhancedPrompt });
    } catch (error) {
        console.error('Error enhancing prompt with xAI Grok-3 API:', error);
        res.status(500).json({ error: 'Failed to enhance prompt: ' + error.message });
    }
});

app.post('/generate', async (req, res) => {
    try {
        console.log('Received generate request:', req.body);
        console.log('Image URL in request:', req.body.image_url);
        const { model, prompt, negative_prompt, style, num_images, aspect_ratio, seed } = req.body;
        let endpoint = '';
        let payload = {};

        if (model === 'kontext') {
            // Use FLUX [dev] for text-to-image generation
            endpoint = 'fal-ai/flux/dev';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                num_images: num_images,
                image_size: aspect_ratio === '1:1' ? 'square' : 'landscape_4_3',
                seed: seed || null
            };
        } else if (model === 'flux-1') {
            // Use FLUX-1 [dev] for text-to-image generation
            endpoint = 'fal-ai/flux-1/dev';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                num_images: num_images,
                image_size: aspect_ratio === '1:1' ? 'square' : 'landscape_4_3',
                seed: seed || null
            };
        } else if (model === 'hidream-i1-full') {
            // Use Hidream I1 Full for text-to-image generation
            endpoint = 'fal-ai/hidream-i1-full';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                negative_prompt: negative_prompt || '',
                image_size: aspect_ratio === '1:1' ? { width: 1024, height: 1024 } : 
                           aspect_ratio === '16:9' ? { width: 1344, height: 768 } :
                           aspect_ratio === '9:16' ? { width: 768, height: 1344 } :
                           { width: 1024, height: 1024 },
                num_inference_steps: req.body.hidream_inference_steps || req.body.num_inference_steps || 50,
                guidance_scale: req.body.hidream_guidance_scale || req.body.guidance_scale || 5,
                seed: seed || null,
                num_images: num_images,
                enable_safety_checker: req.body.hidream_safety_checker !== undefined ? req.body.hidream_safety_checker : (req.body.enable_safety_checker !== false),
                output_format: req.body.hidream_output_format || req.body.output_format || 'jpeg'
            };
        } else if (model === 'kontext-edit') {
            // Use FLUX Kontext for image-to-image editing
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for Kontext editing' });
            }
            endpoint = 'fal-ai/flux-pro/kontext';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                image_url: req.body.image_url, // Required for Kontext editing
                num_images: num_images,
                aspect_ratio: aspect_ratio,
                seed: seed || null
            };
        } else if (model === 'kontext-max') {
            // Use FLUX Kontext Max for image-to-image editing
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for Kontext Max editing' });
            }
            endpoint = 'fal-ai/flux-pro/kontext/max';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                image_url: req.body.image_url, // Required for Kontext Max editing
                num_images: num_images,
                aspect_ratio: aspect_ratio,
                seed: seed || null,
                safety_tolerance: 5
            };
        } else if (model === 'kontext-max-text-to-image') {
            // Use FLUX Kontext Max for premium text-to-image generation
            endpoint = 'fal-ai/flux-pro/kontext/max/text-to-image';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                guidance_scale: req.body.kontext_max_guidance_scale || 3.5,
                num_images: num_images,
                safety_tolerance: req.body.kontext_max_safety_tolerance || "2",
                output_format: req.body.kontext_max_output_format || "jpeg",
                aspect_ratio: req.body.kontext_max_aspect_ratio || aspect_ratio || "16:9",
                sync_mode: req.body.kontext_max_sync_mode || false
            };
            // Add seed if provided
            if (seed) {
                payload.seed = seed;
            }
        } else if (model === 'seededit') {
            // Use ByteDance SeedEdit 3.0 for image-to-image editing
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for SeedEdit editing' });
            }
            endpoint = 'fal-ai/bytedance/seededit/v3/edit-image';
            payload = {
                prompt: style ? `${style}: ${prompt}` : prompt,
                image_url: req.body.image_url // Required for SeedEdit editing
            };
            // Only add seed if it's provided and not null
            if (seed) {
                payload.seed = seed;
            }
        } else if (model === 'imagen4') {
            endpoint = 'fal-ai/imagen4/preview/fast';
            payload = {
                prompt: prompt,
                negative_prompt: negative_prompt || '',
                num_images: num_images,
                aspect_ratio: aspect_ratio,
                seed: seed || null
            };
        } else if (model === 'imagen4-preview') {
            endpoint = 'fal-ai/imagen4/preview';
            payload = {
                prompt: prompt,
                negative_prompt: negative_prompt || '',
                num_images: num_images,
                aspect_ratio: aspect_ratio,
                seed: seed || null
            };
        } else if (model === 'juggernaut-pro') {
            // Use Juggernaut Flux Pro for image-to-image generation
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for Juggernaut Pro' });
            }
            endpoint = 'rundiffusion-fal/juggernaut-flux/pro/image-to-image';
            payload = {
                image_url: req.body.image_url,
                prompt: prompt,
                strength: req.body.strength || 0.95,
                num_inference_steps: req.body.num_inference_steps || 40,
                guidance_scale: req.body.guidance_scale || 3.5,
                num_images: num_images,
                enable_safety_checker: false  // Disabled as requested
            };
            // Add seed if provided
            if (seed) {
                payload.seed = seed;
            }
        } else if (model === 'clarity-upscaler') {
            // Use Clarity Upscaler for image enhancement
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for Clarity Upscaler' });
            }
            endpoint = 'fal-ai/clarity-upscaler';
            payload = {
                image_url: req.body.image_url,
                prompt: prompt || 'masterpiece, best quality, highres',
                upscale_factor: req.body.upscale_factor || 2,
                creativity: req.body.creativity || 0.35,
                resemblance: req.body.resemblance || 0.6,
                guidance_scale: req.body.guidance_scale || 4,
                num_inference_steps: req.body.num_inference_steps || 18,
                negative_prompt: req.body.negative_prompt || '(worst quality, low quality, normal quality:2)',
                enable_safety_checker: false
            };
            // Add seed if provided
            if (seed) {
                payload.seed = seed;
            }
        } else if (model === 'scene-composition') {
            // Use Scene Composition for placing subjects in new scenes
            if (!req.body.image_url) {
                return res.status(400).json({ error: 'image_url is required for Scene Composition' });
            }
            endpoint = 'fal-ai/image-editing/scene-composition';
            payload = {
                image_url: req.body.image_url,
                prompt: prompt || 'enchanted forest',
                guidance_scale: req.body.guidance_scale || 3.5,
                num_inference_steps: req.body.num_inference_steps || 30,
                safety_tolerance: req.body.safety_tolerance || "2",
                output_format: req.body.output_format || "jpeg"
            };
            // Add aspect_ratio if provided
            if (aspect_ratio) {
                payload.aspect_ratio = aspect_ratio;
            }
            // Add seed if provided
            if (seed) {
                payload.seed = seed;
            }
        } else {
            console.log('Invalid model received:', model);
            return res.status(400).json({ error: 'Invalid model selected' });
        }

        console.log('Making API call to:', endpoint);
        console.log('Payload:', payload);
        
        // API key is configured via fal.config() at the top of the file
        // No need to check for environment variable since we're using hardcoded credentials

        try {
            const result = await fal.subscribe(endpoint, {
                input: payload
            });

            // Map the response to a consistent structure for the frontend
            console.log('FAL API response:', result.data);
            
            // Handle different response structures from different models
            let images = [];
            if (model === 'seededit') {
                // SeedEdit returns a single image object, not an array
                images = [result.data.image];
            } else if (model === 'clarity-upscaler') {
                // Clarity Upscaler returns a single image object, not an array
                images = [result.data.image];
            } else if (model === 'scene-composition') {
                // Scene Composition returns an array of images
                images = result.data.images;
            } else {
                // Juggernaut Pro and other models return an array of images
                images = result.data.images;
            }
            
            // Save images to history and get local URLs
            const savedImages = [];
            for (const img of images) {
                try {
                    const metadata = {
                        prompt: prompt,
                        model: model,
                        num_images: num_images,
                        aspect_ratio: aspect_ratio,
                        seed: seed,
                        style: style,
                        negative_prompt: negative_prompt,
                        image_url: req.body.image_url || null
                    };
                    
                    // Add juggernaut-specific metadata
                    if (model === 'juggernaut-pro') {
                        metadata.strength = req.body.strength;
                        metadata.guidance_scale = req.body.guidance_scale;
                        metadata.num_inference_steps = req.body.num_inference_steps;
                    }
                    
                    // Add upscaler-specific metadata
                    if (model === 'clarity-upscaler') {
                        metadata.upscale_factor = req.body.upscale_factor;
                        metadata.creativity = req.body.creativity;
                        metadata.resemblance = req.body.resemblance;
                        metadata.guidance_scale = req.body.guidance_scale;
                        metadata.num_inference_steps = req.body.num_inference_steps;
                    }
                    
                    // Add scene composition-specific metadata
                    if (model === 'scene-composition') {
                        metadata.guidance_scale = req.body.guidance_scale;
                        metadata.num_inference_steps = req.body.num_inference_steps;
                        metadata.safety_tolerance = req.body.safety_tolerance;
                        metadata.output_format = req.body.output_format;
                    }
                    
                    // Add hidream-specific metadata
                    if (model === 'hidream-i1-full') {
                        metadata.guidance_scale = req.body.hidream_guidance_scale || req.body.guidance_scale;
                        metadata.num_inference_steps = req.body.hidream_inference_steps || req.body.num_inference_steps;
                        metadata.enable_safety_checker = req.body.hidream_safety_checker !== undefined ? req.body.hidream_safety_checker : req.body.enable_safety_checker;
                        metadata.output_format = req.body.hidream_output_format || req.body.output_format;
                    }
                    
                    // Add kontext-max-text-to-image specific metadata
                    if (model === 'kontext-max-text-to-image') {
                        metadata.guidance_scale = req.body.kontext_max_guidance_scale;
                        metadata.safety_tolerance = req.body.kontext_max_safety_tolerance;
                        metadata.output_format = req.body.kontext_max_output_format;
                        metadata.aspect_ratio_override = req.body.kontext_max_aspect_ratio;
                        metadata.sync_mode = req.body.kontext_max_sync_mode;
                    }
                    
                    const savedImage = await saveImageToHistory(img.url, metadata);
                    savedImages.push({
                        id: savedImage.id,
                        url: savedImage.url,
                        prompt: prompt,
                        timestamp: savedImage.timestamp,
                        model: model
                    });
                } catch (saveError) {
                    console.error('Error saving image to history:', saveError);
                    // Fallback to original URL if saving fails
                    savedImages.push({
                        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        url: img.url,
                        prompt: prompt,
                        timestamp: Date.now(),
                        model: model
                    });
                }
            }

            console.log('Sending images to frontend:', savedImages);
            res.json({ images: savedImages });
        } catch (err) {
            console.error('Fal SDK error:', err);
            // Log more detailed error information for debugging
            if (err.body && err.body.detail) {
                console.error('Detailed error:', JSON.stringify(err.body.detail, null, 2));
            }
            res.status(500).json({ 
                error: 'Failed to generate images via Fal SDK', 
                details: err.message || err,
                validationErrors: err.body?.detail || null
            });
        }
    } catch (error) {
        console.error('Error generating images:', error);
        res.status(500).json({ error: 'Failed to generate images' });
    }
});

// Route to upload voice file for voice cloning
app.post('/upload-voice', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Use Fal SDK for file upload
        const file = new File([req.file.buffer], req.file.originalname, {
            type: req.file.mimetype
        });
        
        const url = await fal.storage.upload(file);
        
        res.json({ url: url });
    } catch (error) {
        console.error('Error uploading voice file:', error);
        res.status(500).json({ error: 'Failed to upload voice file' });
    }
});

// Route for text-to-speech using MiniMax Speech-02 Turbo
app.post('/tts', async (req, res) => {
    try {
        const {
            text,
            voice,
            voice_setting,
            exaggeration = 0.5,
            cfg = 0.5,
            temperature = 0.8,
            high_quality_audio = false
        } = req.body;

        if (!text) return res.status(400).json({ error: 'No text provided' });

        const input = {
            text,
            exaggeration: parseFloat(exaggeration),
            cfg: parseFloat(cfg),
            temperature: parseFloat(temperature),
            high_quality_audio
        };

        // Use voice_setting.voice_id if present (for custom voices), otherwise use voice (for built-in voices)
        if (voice_setting && voice_setting.voice_id) {
            input.voice_setting = voice_setting;
        } else if (voice) {
            input.voice = voice;
        }

        console.log('TTS request payload:', input);

        const result = await fal.subscribe("fal-ai/minimax/speech-02-turbo", { input });
        const audioUrl = result.data.audio.url;
        
        console.log('TTS response:', result.data);
        res.json({ audioUrl });
    } catch (err) {
        console.error('TTS error:', err);
        res.status(500).json({ error: 'Failed to generate audio', details: err.message || err });
    }
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    
    // Check if response was already sent
    if (res.headersSent) {
        return next(err);
    }
    
    // Determine error status and message
    let status = err.status || err.statusCode || 500;
    let message = 'Something went wrong!';
    let details = null;
    
    // Handle different types of errors
    if (err.name === 'ValidationError') {
        status = 400;
        message = 'Invalid request data';
        details = err.message;
    } else if (err.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized access';
    } else if (err.code === 'ENOENT') {
        status = 404;
        message = 'File not found';
    } else if (err.code === 'EACCES') {
        status = 403;
        message = 'Access denied';
    } else if (status >= 400 && status < 500) {
        message = err.message || 'Bad request';
    } else if (status >= 500) {
        message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
        details = process.env.NODE_ENV === 'production' ? null : err.stack;
    }
    
    // Send error response
    res.status(status).json({
        error: message,
        ...(details && { details }),
        ...(err.validationErrors && { validationErrors: err.validationErrors })
    });
});

// Handle 404 for undefined routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
}); 