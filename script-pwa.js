// PWA-optimierte Version des Handball Soundboards
console.log('PWA Script loading...');

class PWAHandballSoundboard {
    constructor() {
        console.log('PWA Soundboard constructor called');
        this.customSounds = {};
        this.currentlyPlaying = [];
        this.volume = 0.7;
        this.currentSoundType = 'tor';
        this.buttonTextTimers = new Map();
        this.originalButtonTexts = new Map();

        this.initializeSounds();
        this.loadSavedSounds();
        this.setupEventListeners();
        this.updateVolumeDisplay();
        this.updateFileCountDisplays();
        this.updateStatusDisplay();
    }

    initializeSounds() {
        this.soundDefinitions = {
            'tor': [{ text: 'TOOOOOOR!', pitch: 1.2, duration: 2000 }],
            '7meter': [{ text: 'Sieben Meter!', pitch: 1.0, duration: 1500 }],
            'parade': [{ text: 'Parade!', pitch: 1.1, duration: 1000 }],
            'rote-karte': [{ text: 'Rote Karte!', pitch: 0.7, duration: 2000 }],
            '2-minuten': [{ text: 'Zwei Minuten!', pitch: 0.8, duration: 1800 }],
            'timeout': [{ text: 'Timeout!', pitch: 0.9, duration: 1200 }],
            'sieg': [{ text: 'SIEG!', pitch: 1.3, duration: 2500 }]
        };

        Object.keys(this.soundDefinitions).forEach(soundType => {
            this.customSounds[soundType] = [];
        });
    }

    // PWA-optimierte Speicherung mit localStorage
    loadSavedSounds() {
        console.log('Loading sounds from localStorage...');
        try {
            const savedData = localStorage.getItem('OMOSoundboard_PWA');
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                
                for (const [soundType, sounds] of Object.entries(parsedData)) {
                    if (this.customSounds[soundType]) {
                        this.customSounds[soundType] = sounds.map(sound => ({
                            name: sound.name,
                            base64Data: sound.base64Data
                        }));
                    }
                }
                
                console.log('Sounds loaded from localStorage successfully');
                this.updateFileCountDisplays();
                this.updateStatusDisplay();
            }
        } catch (error) {
            console.error('Error loading sounds:', error);
        }
    }

    saveSounds() {
        console.log('Saving sounds to localStorage...');
        try {
            const dataToSave = {};
            for (const [soundType, sounds] of Object.entries(this.customSounds)) {
                if (sounds.length > 0) {
                    dataToSave[soundType] = sounds.map(sound => ({
                        name: sound.name,
                        base64Data: sound.base64Data
                    }));
                }
            }
            
            localStorage.setItem('OMOSoundboard_PWA', JSON.stringify(dataToSave));
            console.log('Sounds saved successfully');
        } catch (error) {
            console.error('Error saving sounds:', error);
            alert('Fehler beim Speichern der Sounds');
        }
    }

    // Vereinfachte Audio-Wiedergabe
    async playCustomSound(soundType, buttonElement) {
        console.log('Playing custom sound:', soundType);
        
        const sounds = this.customSounds[soundType];
        if (!sounds || sounds.length === 0) {
            console.log('No custom sounds, playing generated sound');
            this.playGeneratedSound(soundType, buttonElement);
            return;
        }

        const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
        
        try {
            const audio = new Audio(randomSound.base64Data);
            audio.volume = this.volume;
            
            this.addVisualFeedback(buttonElement, { text: randomSound.name });
            
            const soundEntry = { audio, button: buttonElement, soundType };
            this.currentlyPlaying.push(soundEntry);
            
            audio.addEventListener('ended', () => {
                this.cleanupSound(audio, buttonElement);
            });
            
            audio.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                this.cleanupSound(audio, buttonElement);
                alert('Fehler beim Abspielen von: ' + randomSound.name);
            });
            
            await audio.play();
            console.log('Audio playing successfully');
            
        } catch (error) {
            console.error('Error playing sound:', error);
            alert('Fehler beim Abspielen');
        }
    }

    playGeneratedSound(soundType, buttonElement) {
        console.log('Playing generated sound:', soundType);
        
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const config = this.soundDefinitions[soundType][0];
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(440 * config.pitch, this.audioContext.currentTime);
            oscillator.type = 'sine';

            const effectiveVolume = this.volume * 0.3;
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(effectiveVolume, this.audioContext.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + config.duration / 1000);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + config.duration / 1000);

            this.addVisualFeedback(buttonElement, config);

            const soundEntry = { oscillator, gainNode, button: buttonElement, soundType };
            this.currentlyPlaying.push(soundEntry);

            oscillator.onended = () => {
                this.cleanupGeneratedSound(oscillator, buttonElement);
            };

        } catch (error) {
            console.error('Error playing generated sound:', error);
        }
    }

    cleanupSound(audio, buttonElement) {
        this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.audio !== audio);
        buttonElement.classList.remove('playing');
        this.restoreButtonText(buttonElement);
        this.updateStatusDisplay();
    }

    cleanupGeneratedSound(oscillator, buttonElement) {
        this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.oscillator !== oscillator);
        buttonElement.classList.remove('playing');
        this.restoreButtonText(buttonElement);
        this.updateStatusDisplay();
    }

    // Vereinfachte Datei-Upload-Behandlung
    async handleFileUpload(files) {
        console.log('Handling file upload:', files.length, 'files');
        
        const validFiles = Array.from(files).filter(file =>
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        if (validFiles.length === 0) {
            alert('Bitte wählen Sie nur MP3-Dateien aus.');
            return;
        }

        for (const file of validFiles) {
            try {
                const base64Data = await this.fileToBase64(file);
                const soundData = {
                    name: file.name.replace('.mp3', ''),
                    base64Data: base64Data
                };

                if (!this.customSounds[this.currentSoundType]) {
                    this.customSounds[this.currentSoundType] = [];
                }

                this.customSounds[this.currentSoundType].push(soundData);
                console.log('Added sound:', soundData.name);
                
            } catch (error) {
                console.error('Error processing file:', file.name, error);
                alert('Fehler beim Verarbeiten von: ' + file.name);
            }
        }

        this.updateFileList();
        this.updateFileCountDisplays();
        this.updateStatusDisplay();
        this.saveSounds();

        document.getElementById('file-input').value = '';
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Vereinfachte Event-Listener (nur die wichtigsten)
    setupEventListeners() {
        console.log('Setting up event listeners');

        // Volume control
        const volumeSlider = document.getElementById('volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.volume = e.target.value / 100;
                this.updateVolumeDisplay();
            });
        }

        // Stop button
        const stopBtn = document.getElementById('stop-all');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopAllSounds();
            });
        }

        // Sound buttons
        document.querySelectorAll('.sound-btn').forEach(button => {
            button.addEventListener('click', () => {
                const soundType = button.dataset.sound;
                this.playSound(soundType, button);
            });
        });

        // Store original button texts
        setTimeout(() => {
            this.storeOriginalButtonTexts();
        }, 100);
    }

    playSound(soundType, buttonElement) {
        // Stop current sounds
        this.stopAllSounds();
        
        if (this.customSounds[soundType] && this.customSounds[soundType].length > 0) {
            this.playCustomSound(soundType, buttonElement);
        } else {
            this.playGeneratedSound(soundType, buttonElement);
        }
    }

    stopAllSounds() {
        this.currentlyPlaying.forEach(sound => {
            if (sound.audio) {
                sound.audio.pause();
                sound.audio.currentTime = 0;
            } else if (sound.oscillator) {
                try {
                    sound.oscillator.stop();
                } catch (e) {
                    // Already stopped
                }
            }
        });
        
        this.currentlyPlaying = [];
        this.restoreAllButtonTexts();
        this.updateStatusDisplay();
    }

    // UI Helper Methods (vereinfacht)
    storeOriginalButtonTexts() {
        document.querySelectorAll('.sound-btn').forEach(button => {
            const textElement = button.querySelector('.text');
            if (textElement) {
                this.originalButtonTexts.set(button, textElement.textContent);
            }
        });
    }

    addVisualFeedback(buttonElement, soundConfig) {
        buttonElement.classList.add('playing');
        const textElement = buttonElement.querySelector('.text');
        
        if (this.buttonTextTimers.has(buttonElement)) {
            clearTimeout(this.buttonTextTimers.get(buttonElement));
        }
        
        const newText = soundConfig.text || soundConfig.name || this.originalButtonTexts.get(buttonElement);
        textElement.textContent = newText;
        
        const timer = setTimeout(() => {
            this.restoreButtonText(buttonElement);
            this.buttonTextTimers.delete(buttonElement);
        }, 600);
        
        this.buttonTextTimers.set(buttonElement, timer);
    }

    restoreButtonText(buttonElement) {
        const textElement = buttonElement.querySelector('.text');
        const originalText = this.originalButtonTexts.get(buttonElement);
        
        if (textElement && originalText) {
            textElement.textContent = originalText;
        }
    }

    restoreAllButtonTexts() {
        this.originalButtonTexts.forEach((originalText, buttonElement) => {
            if (this.buttonTextTimers.has(buttonElement)) {
                clearTimeout(this.buttonTextTimers.get(buttonElement));
                this.buttonTextTimers.delete(buttonElement);
            }
            
            const textElement = buttonElement.querySelector('.text');
            if (textElement) {
                textElement.textContent = originalText;
            }
            buttonElement.classList.remove('playing');
        });
    }

    updateVolumeDisplay() {
        const display = document.getElementById('volume-display');
        if (display) {
            display.textContent = Math.round(this.volume * 100) + '%';
        }
    }

    updateFileCountDisplays() {
        document.querySelectorAll('.sound-btn').forEach(button => {
            const soundType = button.dataset.sound;
            const fileCount = this.customSounds[soundType] ? this.customSounds[soundType].length : 0;
            const countElement = button.querySelector('.file-count');
            if (countElement) {
                countElement.textContent = fileCount === 1 ? '1 Datei' : `${fileCount} Dateien`;
                countElement.style.color = fileCount > 0 ? '#2ecc71' : 'rgba(255,255,255,0.7)';
            }
        });
    }

    updateStatusDisplay() {
        const playbackStatus = document.getElementById('playback-status');
        const currentSound = document.getElementById('current-sound');

        if (playbackStatus && currentSound) {
            if (this.currentlyPlaying.length > 0) {
                playbackStatus.textContent = 'Spielt ab';
                playbackStatus.className = 'status-value playing';
                
                const playing = this.currentlyPlaying[0];
                if (playing.button) {
                    const soundType = playing.button.dataset.sound;
                    currentSound.textContent = this.getSoundDisplayName(soundType);
                }
            } else {
                playbackStatus.textContent = 'Bereit';
                playbackStatus.className = 'status-value';
                currentSound.textContent = '-';
            }
        }
    }

    getSoundDisplayName(soundType) {
        const displayNames = {
            'tor': 'TOR!',
            '7meter': '7-METER',
            'parade': 'PARADE',
            'rote-karte': 'ROTE KARTE',
            '2-minuten': '2 MINUTEN',
            'timeout': 'TIMEOUT',
            'sieg': 'SIEG!'
        };
        return displayNames[soundType] || soundType.toUpperCase();
    }

    // Placeholder für Modal-Funktionen (vereinfacht)
    updateFileList() {
        // Vereinfachte Version - wird bei Bedarf erweitert
        console.log('File list updated');
    }
}

// PWA-optimierte Initialisierung
let soundboard;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing PWA soundboard...');
    soundboard = new PWAHandballSoundboard();
    window.soundboard = soundboard;
    
    console.log('🎵 PWA Soundboard loaded successfully!');
});

console.log('PWA Script loaded completely');
