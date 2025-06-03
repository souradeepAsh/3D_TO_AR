// Global Variables
let currentModelUrl = null;
let models = new Map(); // Store uploaded models

const CLOUDINARY_CLOUD_NAME = 'dwocdg3m9'; // Replace with your Cloudinary cloud name
const CLOUDINARY_UPLOAD_PRESET = '3D_TO_AR'; // Replace with your upload preset name
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Application Initialization
function initializeApp() {
    setupEventListeners();
    handleViewportChanges();
    checkUrlParameters();
    setupARSupport();
    preventDoubleTapZoom();
}

// Event Listeners Setup
function setupEventListeners() {
    // File upload handler
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    
    // Window events
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    
    // Model viewer events
    const modelViewer = document.getElementById('modelViewer');
    modelViewer.addEventListener('load', onModelLoad);
    modelViewer.addEventListener('error', onModelError);
}

// File Upload Handler
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!isValidModelFile(file)) {
        showNotification('Please upload a .GLB or .GLTF file', 'error');
        return;
    }

    // Check file size (optional warning for very large files)
    if (file.size > 100 * 1024 * 1024) { // 100MB
        showNotification('Large file detected. Upload may take a while...', 'warning');
    }

    showLoading(true);
    
    try {
        // Create FormData for Cloudinary upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'raw'); // Important: tells Cloudinary it's not an image
        formData.append('public_id', `3d_models/${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`); // Custom filename
        
        // Upload to Cloudinary
        const response = await fetch(CLOUDINARY_UPLOAD_URL, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.secure_url) {
            // Generate unique model ID
            const modelId = generateModelId();
            
            // Store model data with Cloudinary URL
            const modelData = {
                url: result.secure_url,
                cloudinaryId: result.public_id,
                filename: file.name,
                uploadTime: new Date().toISOString(),
                fileSize: formatFileSize(file.size),
                originalSize: file.size
            };
            
            // Store reference in localStorage (just the metadata, not the file)
            try {
                localStorage.setItem(`model_${modelId}`, JSON.stringify(modelData));
            } catch (storageError) {
                console.warn('Could not save to localStorage:', storageError);
                // Continue anyway, the model will still work in current session
            }
            
            // Store in memory for current session
            models.set(modelId, modelData);
            currentModelUrl = result.secure_url;
            
            // Load the model
            loadModel(result.secure_url, file.name, modelId);
            
            showNotification(`${file.name} uploaded successfully! (${formatFileSize(file.size)})`);
        } else {
            throw new Error('No secure URL returned from Cloudinary');
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showLoading(false);
        
        // Provide helpful error messages
        if (error.message.includes('413')) {
            showNotification('File too large. Try a smaller model.', 'error');
        } else if (error.message.includes('network')) {
            showNotification('Network error. Check your connection and try again.', 'error');
        } else {
            showNotification('Upload failed. Please try again.', 'error');
        }
    }
}

// File Validation
function isValidModelFile(file) {
    const validExtensions = ['.glb', '.gltf'];
    const fileName = file.name.toLowerCase();
    return validExtensions.some(ext => fileName.endsWith(ext));
}

// Load 3D Model
function loadModel(url, filename, modelId) {
    const modelViewer = document.getElementById('modelViewer');
    
    // Clear any previous model
    modelViewer.src = '';
    
    // Set new model with proper attributes
    modelViewer.src = url;
    
    // Store current model info
    modelViewer.dataset.modelId = modelId;
    modelViewer.dataset.filename = filename;
    
    // Force texture reload and proper lighting
    setTimeout(() => {
        modelViewer.dismissPoster();
        modelViewer.jumpCameraToGoal();
    }, 100);
}

// Model Load Success Handler
function onModelLoad(event) {
    const modelViewer = event.target;
    const filename = modelViewer.dataset.filename;
    const modelId = modelViewer.dataset.modelId;
    
    showLoading(false);
    showModelInfo(true);
    enableAR(true);
    generateQRCode(modelId);
    updateUrlHistory(modelId);
    showNotification(`${filename} loaded successfully!`);
    
    // Force proper rendering and texture loading
    setTimeout(() => {
        modelViewer.dismissPoster();
        modelViewer.jumpCameraToGoal();
        
        // Check if textures are loaded
        checkTextureStatus(modelViewer);
    }, 500);
    
    // Log model statistics
    logModelStats(modelViewer);
}

// Check Texture Loading Status
function checkTextureStatus(modelViewer) {
    try {
        const scene = modelViewer.model;
        if (scene) {
            console.log('Model loaded with materials:', scene.materials?.length || 0);
            
            // Force material update
            if (scene.materials) {
                scene.materials.forEach((material, index) => {
                    console.log(`Material ${index}:`, {
                        name: material.name,
                        hasTexture: !!material.pbrMetallicRoughness?.baseColorTexture,
                        transparent: material.alphaMode !== 'OPAQUE'
                    });
                });
            }
        }
    } catch (error) {
        console.warn('Could not analyze model materials:', error);
    }
}

// Model Load Error Handler
function onModelError(error) {
    showLoading(false);
    showNotification('Error loading model. Please try another file.', 'error');
    console.error('Model loading error:', error);
    
    // Reset AR button state
    enableAR(false);
}

// Generate Unique Model ID
function generateModelId() {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    return `model_${timestamp}_${randomId}`;
}

// QR Code Generation
function generateQRCode(modelId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?model=${modelId}`;
    
    // Clear previous QR code
    const qrContainer = document.getElementById('qrContainer');
    qrContainer.innerHTML = '';
    
    try {
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;
        
        qrContainer.innerHTML = `
            <img src="${qrImageUrl}" alt="QR Code" style="max-width: 100%; height: auto; border-radius: 8px;" />
        `;
        
        document.getElementById('shareUrl').value = shareUrl;
        
        // Show helpful message
        showNotification('QR code generated! Share this link to view the model on any device.');
        
    } catch (error) {
        console.error('QR Code generation error:', error);
        qrContainer.innerHTML = '<div class="qr-placeholder">QR Code generation failed</div>';
    }
}

async function handleFileUploadImproved(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!isValidModelFile(file)) {
        showNotification('Please upload a .GLB or .GLTF file', 'error');
        return;
    }

    // Check file size (optional warning for very large files)
    if (file.size > 100 * 1024 * 1024) { // 100MB
        showNotification('Large file detected. Upload may take a while...', 'warning');
    }

    showLoading(true);
    
    try {
        // Generate model ID first
        const modelId = generateModelId();
        const timestamp = modelId.split('_')[1];
        
        // Get file extension
        const fileExtension = file.name.toLowerCase().endsWith('.glb') ? '.glb' : '.gltf';
        
        // Create FormData for Cloudinary upload with predictable naming
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'raw');
        formData.append('public_id', `3d_models/${timestamp}_model`); // Predictable naming without extension
        
        // Upload to Cloudinary
        const response = await fetch(CLOUDINARY_UPLOAD_URL, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.secure_url) {
            // Store model data with Cloudinary URL
            const modelData = {
                url: result.secure_url,
                cloudinaryId: result.public_id,
                filename: file.name,
                uploadTime: new Date().toISOString(),
                fileSize: formatFileSize(file.size),
                originalSize: file.size,
                fileExtension: fileExtension
            };
            
            // Store reference in localStorage
            try {
                localStorage.setItem(`model_${modelId}`, JSON.stringify(modelData));
            } catch (storageError) {
                console.warn('Could not save to localStorage:', storageError);
            }
            
            // Store in memory for current session
            models.set(modelId, modelData);
            currentModelUrl = result.secure_url;
            
            // Load the model
            loadModel(result.secure_url, file.name, modelId);
            
            showNotification(`${file.name} uploaded successfully! (${formatFileSize(file.size)})`);
        } else {
            throw new Error('No secure URL returned from Cloudinary');
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showLoading(false);
        
        // Provide helpful error messages
        if (error.message.includes('413')) {
            showNotification('File too large. Try a smaller model.', 'error');
        } else if (error.message.includes('network')) {
            showNotification('Network error. Check your connection and try again.', 'error');
        } else {
            showNotification('Upload failed. Please try again.', 'error');
        }
    }
}

// Copy to Clipboard Function
function copyToClipboard() {
    const shareUrl = document.getElementById('shareUrl');
    shareUrl.focus();
    
    if (!shareUrl.value) {
        showNotification('No URL to copy. Please upload a model first.', 'error');
        return;
    }
    
    // Modern clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(shareUrl.value).then(() => {
            showNotification('Link copied to clipboard!');
        }).catch(err => {
            fallbackCopyTextToClipboard(shareUrl.value);
        });
    } else {
        fallbackCopyTextToClipboard(shareUrl.value);
    }
}

// Fallback copy method
function fallbackCopyTextToClipboard(text) {
    const shareUrl = document.getElementById('shareUrl');
    shareUrl.select();
    shareUrl.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        showNotification('Link copied to clipboard!');
    } catch (err) {
        console.error('Copy failed:', err);
        showNotification('Copy failed. Please copy manually.', 'error');
    }
}

// AR Functionality
function openAR() {
    const modelViewer = document.getElementById('modelViewer');
    
    if (!modelViewer || !currentModelUrl) {
        showNotification('Please upload a model first', 'error');
        return;
    }
    
    if (modelViewer.canActivateAR) {
        try {
            modelViewer.activateAR();
            showNotification('Launching AR experience...');
        } catch (error) {
            console.error('AR activation error:', error);
            showNotification('Failed to launch AR. Please try again.', 'error');
        }
    } else {
        showNotification('AR not supported on this device/browser', 'error');
        console.log('AR Support Info:', {
            hasWebXR: 'xr' in navigator,
            isSecureContext: window.isSecureContext,
            userAgent: navigator.userAgent
        });
    }
}

// UI State Management
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

function showModelInfo(show) {
    const info = document.getElementById('modelInfo');
    if (show) {
        info.classList.add('show');
    } else {
        info.classList.remove('show');
    }
}

function enableAR(enable) {
    const arBtn = document.getElementById('arBtn');
    if (enable) {
        arBtn.classList.add('active');
    } else {
        arBtn.classList.remove('active');
    }
}

// Notification System
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    
    // Set notification color based on type
    const colors = {
        success: 'linear-gradient(45deg, #4ecdc4, #44a08d)',
        error: 'linear-gradient(45deg, #ff6b6b, #ff8e8e)',
        warning: 'linear-gradient(45deg, #ffd93d, #ff6b6b)',
        info: 'linear-gradient(45deg, #667eea, #764ba2)'
    };
    
    notification.style.background = colors[type] || colors.success;
    notification.classList.add('show');
    
    // Auto-hide notification
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// URL Management
function updateUrlHistory(modelId) {
    const newUrl = `${window.location.origin}${window.location.pathname}?model=${modelId}`;
    window.history.pushState({modelId}, '', newUrl);
}

// Replace the existing checkUrlParameters function
async function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelId = urlParams.get('model');
    
    if (modelId) {
        showLoading(true);
        
        // Try to load from localStorage first (for same device)
        const storedData = localStorage.getItem(`model_${modelId}`);
        
        if (storedData) {
            try {
                const modelData = JSON.parse(storedData);
                
                // Validate the stored data has a valid Cloudinary URL
                if (modelData.url && modelData.url.includes('cloudinary.com')) {
                    // Test if the Cloudinary URL is still accessible
                    const urlTest = await testModelUrl(modelData.url);
                    
                    if (urlTest.success) {
                        models.set(modelId, modelData);
                        currentModelUrl = modelData.url;
                        
                        showNotification(`Loading shared model: ${modelData.filename}...`);
                        loadModel(modelData.url, modelData.filename, modelId);
                        return;
                    } else {
                        console.warn('Stored model URL is no longer accessible:', urlTest.error);
                        // Remove invalid data from localStorage
                        localStorage.removeItem(`model_${modelId}`);
                    }
                } else {
                    console.warn('Invalid model data in localStorage');
                    localStorage.removeItem(`model_${modelId}`);
                }
            } catch (error) {
                console.error('Error parsing stored model data:', error);
                localStorage.removeItem(`model_${modelId}`);
            }
        }
        
        // If localStorage failed or URL is from different device, try alternative methods
        
        // Method 1: Try to construct Cloudinary URL from modelId if it contains timestamp
        if (modelId.includes('model_')) {
            const timestamp = modelId.split('_')[1];
            if (timestamp && !isNaN(timestamp)) {
                const possibleUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/v1/3d_models/${timestamp}_model`;
                
                // Test both .glb and .gltf extensions
                for (const ext of ['.glb', '.gltf']) {
                    const testUrl = possibleUrl + ext;
                    const urlTest = await testModelUrl(testUrl);
                    
                    if (urlTest.success) {
                        const modelData = {
                            url: testUrl,
                            filename: `shared_model${ext}`,
                            uploadTime: new Date(parseInt(timestamp)).toISOString(),
                            fileSize: 'Unknown',
                            originalSize: 0
                        };
                        
                        models.set(modelId, modelData);
                        currentModelUrl = testUrl;
                        
                        showNotification(`Loading shared 3D model...`);
                        loadModel(testUrl, modelData.filename, modelId);
                        
                        // Store the working model data for future use
                        try {
                            localStorage.setItem(`model_${modelId}`, JSON.stringify(modelData));
                        } catch (storageError) {
                            console.warn('Could not save to localStorage:', storageError);
                        }
                        
                        return;
                    }
                }
            }
        }
        
        // Method 2: Check if there's a shared models API endpoint (you could implement this)
        // This would require a backend service to store model metadata
        
        // If all methods failed, show error message
        showLoading(false);
        showNotification('Model not found or no longer available. The link may have expired.', 'error');
        
        // Clean up the URL
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}
async function testModelUrl(url) {
    try {
        const response = await fetch(url, { 
            method: 'HEAD', // Only check headers, don't download the file
            mode: 'cors'
        });
        
        if (response.ok) {
            return { success: true };
        } else {
            return { 
                success: false, 
                error: `HTTP ${response.status}: ${response.statusText}` 
            };
        }
    } catch (error) {
        return { 
            success: false, 
            error: error.message || 'Network error' 
        };
    }
}

// AR Support Detection
function setupARSupport() {
    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                console.log('WebXR AR is supported');
            } else {
                console.log('WebXR AR not supported, checking for other AR methods');
                checkAlternativeARSupport();
            }
        }).catch((error) => {
            console.log('WebXR not available:', error);
            checkAlternativeARSupport();
        });
    } else {
        checkAlternativeARSupport();
    }
}

function checkAlternativeARSupport() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isAndroid) {
        console.log('Android device detected - Scene Viewer should be available');
    } else if (isIOS) {
        console.log('iOS device detected - Quick Look should be available');
    } else {
        console.log('Desktop device - AR might have limited support');
    }
}

// Mobile Optimizations
function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

function handleViewportChange() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function handleViewportChanges() {
    handleViewportChange();
    
    // Debounce resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(handleViewportChange, 100);
    });
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function logModelStats(modelViewer) {
    // Log basic model information
    console.log('Model loaded successfully:', {
        src: modelViewer.src,
        cameraOrbit: modelViewer.cameraOrbit,
        fieldOfView: modelViewer.fieldOfView,
        hasAR: modelViewer.canActivateAR,
        timestamp: new Date().toISOString()
    });
}

// Cleanup function for memory management
function cleanup() {
    // Revoke object URLs to prevent memory leaks
    models.forEach((model) => {
        if (model.url.startsWith('blob:')) {
            URL.revokeObjectURL(model.url);
        }
    });
    models.clear();
}

// Page Unload Cleanup
window.addEventListener('beforeunload', cleanup);

// Error Handling
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('An unexpected error occurred', 'error');
});

// Service Worker Registration (Optional - for PWA capabilities)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Uncomment if you want to add PWA capabilities
        // navigator.serviceWorker.register('/sw.js').then(function(registration) {
        //     console.log('ServiceWorker registration successful');
        // }).catch(function(err) {
        //     console.log('ServiceWorker registration failed');
        // });
    });
}

// Performance Monitoring (Optional)
if (window.performance && window.performance.mark) {
    window.performance.mark('app-initialized');
}

// Debug Mode (for development)
const DEBUG_MODE = window.location.search.includes('debug=true');

if (DEBUG_MODE) {
    window.appDebug = {
        models,
        currentModelUrl,
        showNotification,
        loadModel,
        generateQRCode
    };
    console.log('Debug mode enabled. Access debug functions via window.appDebug');
}