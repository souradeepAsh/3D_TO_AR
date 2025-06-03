// Global Variables
let currentModelUrl = null;
let models = new Map(); // Store uploaded models

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
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!isValidModelFile(file)) {
        showNotification('Please upload a .GLB or .GLTF file', 'error');
        return;
    }

    showLoading(true);
    
    // Create object URL for the file
    const objectUrl = URL.createObjectURL(file);
    currentModelUrl = objectUrl;
    
    // Generate unique ID for this model
    const modelId = generateModelId();
    
    // Store model data
    models.set(modelId, {
        url: objectUrl,
        filename: file.name,
        uploadTime: new Date().toISOString(),
        fileSize: formatFileSize(file.size)
    });

    // Load the model
    loadModel(objectUrl, file.name, modelId);
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
    return 'model_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// QR Code Generation
function generateQRCode(modelId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?model=${modelId}`;
    
    // Clear previous QR code
    const qrContainer = document.getElementById('qrContainer');
    qrContainer.innerHTML = '';
try {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;
    
    qrContainer.innerHTML = `<img src="${qrImageUrl}" alt="QR Code" style="max-width: 100%; height: auto; border-radius: 8px;" />`;
    
    document.getElementById('shareUrl').value = shareUrl;
} catch (error) {
    console.error('QR Code generation error:', error);
    qrContainer.innerHTML = '<div class="qr-placeholder">QR Code generation failed</div>';
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

function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelId = urlParams.get('model');
    
    if (modelId && models.has(modelId)) {
        const modelData = models.get(modelId);
        currentModelUrl = modelData.url;
        loadModel(modelData.url, modelData.filename, modelId);
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