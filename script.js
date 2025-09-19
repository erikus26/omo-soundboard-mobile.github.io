// Handball Soundboard JavaScript
console.log('Script.js is loading...');

class HandballSoundboard {
    constructor() {
        console.log('HandballSoundboard constructor called');
        this.customSounds = {};
        this.currentlyPlaying = [];
        this.volume = 0.7;
        this.currentSoundType = 'tor';
        this.buttonTextTimers = new Map(); // Track text restoration timers
        this.originalButtonTexts = new Map(); // Store original button texts

        this.initializeSounds();
        this.loadSavedSounds();
        this.setupEventListeners();
        this.updateVolumeDisplay();
        this.updateFileCountDisplays();
        this.updateStatusDisplay();
        
        // Cleanup alte URLs beim Schließen der App
        window.addEventListener('beforeunload', () => {
            this.cleanupBlobUrls();
        });
    }

    cleanupBlobUrls() {
        // Räume alle Blob-URLs auf, um Memory-Leaks zu vermeiden
        for (const [soundType, sounds] of Object.entries(this.customSounds)) {
            sounds.forEach(sound => {
                if (sound.url && sound.url.startsWith('blob:')) {
                    URL.revokeObjectURL(sound.url);
                }
            });
        }
        console.log('Cleaned up blob URLs');
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

    storeOriginalButtonTexts() {
        // Store original button texts for restoration
        document.querySelectorAll('.sound-btn').forEach(button => {
            const textElement = button.querySelector('.text');
            if (textElement) {
                this.originalButtonTexts.set(button, textElement.textContent);
                console.log('Stored original text for button:', textElement.textContent);
            }
        });
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('OMOSoundboard', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('sounds')) {
                    const store = db.createObjectStore('sounds', { keyPath: 'id' });
                    store.createIndex('soundType', 'soundType', { unique: false });
                }
            };
        });
    }

    async loadSavedSounds() {
        console.log('Loading saved sounds from IndexedDB...');
        try {
            const db = await this.initIndexedDB();
            const transaction = db.transaction(['sounds'], 'readonly');
            const store = transaction.objectStore('sounds');
            const request = store.getAll();

            request.onsuccess = () => {
                const savedSounds = request.result;
                console.log('Found saved sounds:', savedSounds.length, 'files');

                savedSounds.forEach(soundData => {
                    try {
                        // Speichere die rohen Daten statt Blob-URLs
                        if (this.customSounds[soundData.soundType]) {
                            this.customSounds[soundData.soundType].push({
                                name: soundData.name,
                                fileData: soundData.fileData, // Speichere ArrayBuffer direkt
                                url: null // URL wird bei Bedarf erstellt
                            });

                            console.log(`Restored sound: ${soundData.name} for ${soundData.soundType}`);
                        }
                    } catch (error) {
                        console.error('Error restoring sound:', soundData.name, error);
                    }
                });

                // Update UI after loading
                this.updateFileCountDisplays();
                this.updateStatusDisplay();
                console.log('All sounds loaded successfully');
            };

            request.onerror = () => {
                console.error('Error loading sounds from IndexedDB:', request.error);
            };

        } catch (error) {
            console.error('Error initializing IndexedDB:', error);
        }
    }

    async saveSounds() {
        console.log('Saving sounds to IndexedDB...');
        try {
            const db = await this.initIndexedDB();

            // First, clear existing sounds
            await new Promise((resolve, reject) => {
                const clearTransaction = db.transaction(['sounds'], 'readwrite');
                const clearStore = clearTransaction.objectStore('sounds');
                const clearRequest = clearStore.clear();

                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => reject(clearRequest.error);
            });

            // Prepare all sound data first (outside of transaction)
            const allSoundData = [];
            for (const [soundType, sounds] of Object.entries(this.customSounds)) {
                for (let i = 0; i < sounds.length; i++) {
                    const sound = sounds[i];
                    try {
                        let arrayBuffer;
                        
                        if (sound.fileData) {
                            // Bereits gespeicherte Daten verwenden
                            arrayBuffer = sound.fileData;
                        } else if (sound.file) {
                            // Neue Datei verarbeiten
                            arrayBuffer = await sound.file.arrayBuffer();
                        } else {
                            console.warn('Sound has neither fileData nor file:', sound.name);
                            continue;
                        }

                        allSoundData.push({
                            id: `${soundType}_${i}_${Date.now()}_${Math.random()}`,
                            soundType: soundType,
                            name: sound.name,
                            fileData: arrayBuffer
                        });
                    } catch (error) {
                        console.error('Error preparing sound data:', sound.name, error);
                    }
                }
            }

            // Now save all sounds in a single transaction
            await new Promise((resolve, reject) => {
                const saveTransaction = db.transaction(['sounds'], 'readwrite');
                const saveStore = saveTransaction.objectStore('sounds');
                let completed = 0;
                let hasError = false;

                saveTransaction.oncomplete = () => {
                    if (!hasError) {
                        console.log('All sounds saved successfully to IndexedDB');
                        resolve();
                    }
                };

                saveTransaction.onerror = () => {
                    hasError = true;
                    reject(saveTransaction.error);
                };

                if (allSoundData.length === 0) {
                    console.log('No sounds to save');
                    resolve();
                    return;
                }

                allSoundData.forEach(soundData => {
                    const addRequest = saveStore.add(soundData);

                    addRequest.onsuccess = () => {
                        completed++;
                        console.log(`Saved sound: ${soundData.name} for ${soundData.soundType} (${completed}/${allSoundData.length})`);
                    };

                    addRequest.onerror = () => {
                        hasError = true;
                        console.error('Error saving sound:', soundData.name, addRequest.error);
                    };
                });
            });

        } catch (error) {
            console.error('Error saving sounds to IndexedDB:', error);
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners');

        // Volume control
        const volumeSlider = document.getElementById('volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.volume = e.target.value / 100;
                console.log('Volume changed to:', this.volume);
                this.updateVolumeDisplay();
                this.updateCurrentlyPlayingVolume();
            });
        }

        // Stop all button with double-click for immediate stop
        const stopBtn = document.getElementById('stop-all');
        if (stopBtn) {
            let clickCount = 0;
            let clickTimer = null;

            stopBtn.addEventListener('click', () => {
                clickCount++;

                if (clickCount === 1) {
                    // First click - normal fade-out stop
                    clickTimer = setTimeout(() => {
                        this.stopAllSounds();
                        clickCount = 0;
                    }, 300); // Wait 300ms for potential second click
                } else if (clickCount === 2) {
                    // Double click - immediate force stop
                    clearTimeout(clickTimer);
                    console.log('Double-click detected - forcing immediate stop');
                    this.forceStopAllSounds();
                    clickCount = 0;

                    // Visual feedback for force stop
                    stopBtn.style.background = 'linear-gradient(135deg, #c0392b, #a93226)';
                    stopBtn.style.transform = 'scale(0.9)';
                    setTimeout(() => {
                        stopBtn.style.background = '';
                        stopBtn.style.transform = '';
                    }, 200);
                }
            });
        }

        // Manage sounds button
        const manageBtn = document.getElementById('manage-sounds');
        console.log('Manage button found:', manageBtn);
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                console.log('Manage button clicked!');
                this.openSoundModal();
            });
        }

        // Help button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.openHelpModal();
            });
        }

        // Sound buttons
        document.querySelectorAll('.sound-btn').forEach(button => {
            button.addEventListener('click', () => {
                const soundType = button.dataset.sound;
                this.playSound(soundType, button);
            });
        });
        
        // Store original button texts after all event listeners are set up
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(() => {
            this.storeOriginalButtonTexts();
        }, 100);
    }
    updateVolumeDisplay() {
        const display = document.getElementById('volume-display');
        if (display) {
            display.textContent = Math.round(this.volume * 100) + '%';
        }
    }

    updateCurrentlyPlayingVolume() {
        // Update volume for currently playing audio files
        this.currentlyPlaying.forEach(sound => {
            if (sound.audio) {
                sound.audio.volume = this.volume;
                console.log('Updated playing audio volume to:', this.volume);
            }
            if (sound.gainNode) {
                // For generated sounds, we can't change volume mid-play easily
                // but we log it for debugging
                console.log('Generated sound playing, volume will apply to next play');
            }
        });
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

    playSound(soundType, buttonElement) {
        // Stop any currently playing sounds before starting new one
        if (this.currentlyPlaying.length > 0) {
            console.log('Stopping current sounds to play new sound:', soundType);
            this.stopAllSoundsImmediately(); // Use immediate stop, not fade-out
        }

        if (this.customSounds[soundType] && this.customSounds[soundType].length > 0) {
            this.playCustomSound(soundType, buttonElement);
        } else if (this.soundDefinitions[soundType]) {
            this.playGeneratedSound(soundType, buttonElement);
        }
    }

    playCustomSound(soundType, buttonElement) {
        const customSounds = this.customSounds[soundType];
        const randomSound = customSounds[Math.floor(Math.random() * customSounds.length)];

        // Erstelle URL bei Bedarf aus gespeicherten Daten
        let audioUrl = randomSound.url;
        if (!audioUrl && randomSound.fileData) {
            // Erstelle neue Blob-URL aus gespeicherten ArrayBuffer-Daten
            const blob = new Blob([randomSound.fileData], { type: 'audio/mpeg' });
            audioUrl = URL.createObjectURL(blob);
            randomSound.url = audioUrl; // Cache die URL für weitere Verwendung
            console.log('Created new blob URL for:', randomSound.name);
        } else if (!audioUrl && randomSound.file) {
            // Fallback für direkt hochgeladene Dateien
            audioUrl = URL.createObjectURL(randomSound.file);
            randomSound.url = audioUrl;
            console.log('Created blob URL from file for:', randomSound.name);
        }

        if (!audioUrl) {
            console.error('No audio URL available for sound:', randomSound.name);
            return;
        }

        const audio = new Audio(audioUrl);
        console.log('Playing custom sound:', soundType, 'file:', randomSound.name);
        console.log('Setting audio volume to:', this.volume);
        audio.volume = this.volume;

        this.addVisualFeedback(buttonElement, { text: randomSound.name });

        // Add to currently playing BEFORE starting playback
        const soundEntry = { audio, button: buttonElement, soundType };
        this.currentlyPlaying.push(soundEntry);
        console.log('Added to currentlyPlaying, total sounds:', this.currentlyPlaying.length);

        // Ensure volume is set after audio loads
        audio.addEventListener('loadeddata', () => {
            audio.volume = this.volume;
            console.log('Audio loaded, volume set to:', audio.volume);
        });

        audio.play().catch(e => {
            console.error('Audio play failed:', e);
            // Entferne aus currentlyPlaying wenn Playback fehlschlägt
            this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.audio !== audio);
            buttonElement.classList.remove('playing');
            this.restoreButtonText(buttonElement);
            this.updateStatusDisplay();
        });

        audio.onended = () => {
            console.log('Audio ended naturally:', randomSound.name);
            this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.audio !== audio);
            buttonElement.classList.remove('playing');
            
            // Restore button text when sound ends naturally
            this.restoreButtonText(buttonElement);
            
            this.updateStatusDisplay();
        };

        this.updateStatusDisplay();
    }

    playGeneratedSound(soundType, buttonElement) {
        const variations = this.soundDefinitions[soundType];
        const randomSound = variations[Math.floor(Math.random() * variations.length)];
        this.createAndPlayAudio(randomSound, buttonElement);
    }

    createAndPlayAudio(soundConfig, buttonElement) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(440 * soundConfig.pitch, this.audioContext.currentTime);
        oscillator.type = 'sine';

        console.log('Playing generated sound, setting volume to:', this.volume);

        // Apply volume more effectively for generated sounds
        const effectiveVolume = this.volume * 0.5; // Scale down a bit for generated sounds
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(effectiveVolume, this.audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + soundConfig.duration / 1000);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + soundConfig.duration / 1000);

        this.addVisualFeedback(buttonElement, soundConfig);

        // Add to currently playing with sound type info
        const soundType = buttonElement.dataset.sound;
        const soundEntry = { oscillator, gainNode, button: buttonElement, soundType };
        this.currentlyPlaying.push(soundEntry);
        console.log('Added generated sound to currentlyPlaying, total sounds:', this.currentlyPlaying.length);

        oscillator.onended = () => {
            console.log('Generated sound ended naturally:', soundType);
            this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.oscillator !== oscillator);
            buttonElement.classList.remove('playing');
            
            // Restore button text when sound ends naturally
            this.restoreButtonText(buttonElement);
            
            this.updateStatusDisplay();
        };

        this.updateStatusDisplay();
    }
    addVisualFeedback(buttonElement, soundConfig) {
        buttonElement.classList.add('playing');

        const textElement = buttonElement.querySelector('.text');
        
        // Clear any existing timer for this button
        if (this.buttonTextTimers.has(buttonElement)) {
            clearTimeout(this.buttonTextTimers.get(buttonElement));
        }
        
        // Set the new text
        const newText = soundConfig.text || soundConfig.name || this.originalButtonTexts.get(buttonElement);
        textElement.textContent = newText;
        
        // Set a timer to restore original text (but don't rely on it exclusively)
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
            console.log('Restored button text to:', originalText);
        }
    }

    restoreAllButtonTexts() {
        // Restore all button texts to their original state
        this.originalButtonTexts.forEach((originalText, buttonElement) => {
            // Clear any pending timers
            if (this.buttonTextTimers.has(buttonElement)) {
                clearTimeout(this.buttonTextTimers.get(buttonElement));
                this.buttonTextTimers.delete(buttonElement);
            }
            
            // Restore text and remove playing class
            const textElement = buttonElement.querySelector('.text');
            if (textElement) {
                textElement.textContent = originalText;
            }
            buttonElement.classList.remove('playing');
        });
        
        console.log('All button texts restored to original state');
    }

    stopAllSounds() {
        console.log('Stopping all sounds with fade out...');
        console.log('Currently playing sounds:', this.currentlyPlaying.length);

        // Create a copy of the array to avoid issues with concurrent modifications
        const soundsToStop = [...this.currentlyPlaying];

        // Clear the playing sounds array and update status IMMEDIATELY
        // This ensures the UI shows "stopped" state right away
        this.currentlyPlaying = [];
        this.updateStatusDisplay();
        
        // Restore all button texts immediately
        this.restoreAllButtonTexts();

        soundsToStop.forEach((sound, index) => {
            console.log(`Stopping sound ${index + 1}:`, sound);

            if (sound.oscillator && sound.gainNode) {
                // Fade out generated sounds using Web Audio API
                const currentTime = sound.gainNode.context.currentTime;
                const currentGain = sound.gainNode.gain.value;

                // Fade out over 0.5 seconds (shorter for more responsive feel)
                sound.gainNode.gain.cancelScheduledValues(currentTime);
                sound.gainNode.gain.setValueAtTime(currentGain, currentTime);
                sound.gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.5);

                // Stop the oscillator after fade out
                setTimeout(() => {
                    try {
                        sound.oscillator.stop();
                    } catch (e) {
                        console.log('Oscillator already stopped:', e);
                    }
                }, 500);

            } else if (sound.audio) {
                // For audio files, use immediate stop with shorter fade
                console.log('Stopping audio file:', sound.audio.src);
                this.fadeOutAudioFast(sound.audio);
            }
        });

        // Visual feedback for stop button
        const stopBtn = document.getElementById('stop-all');
        if (stopBtn) {
            stopBtn.style.transform = 'scale(0.95)';
            setTimeout(() => {
                stopBtn.style.transform = '';
            }, 150);
        }
    }

    stopAllSoundsImmediately() {
        // Immediate stop without fade-out for sound switching
        this.currentlyPlaying.forEach(sound => {
            if (sound.oscillator) {
                try {
                    sound.oscillator.stop();
                } catch (e) {
                    // Oscillator might already be stopped
                }
            } else if (sound.audio) {
                sound.audio.pause();
                sound.audio.currentTime = 0;
            }
        });
        this.currentlyPlaying = [];
        this.updateStatusDisplay();
        
        // Restore all button texts immediately
        this.restoreAllButtonTexts();
    }

    forceStopAllSounds() {
        // Force stop all sounds immediately without any fade-out
        console.log('Force stopping all sounds immediately...');
        console.log('Currently playing sounds:', this.currentlyPlaying.length);

        this.currentlyPlaying.forEach(sound => {
            if (sound.oscillator && sound.gainNode) {
                try {
                    // Immediately set volume to 0 and stop
                    sound.gainNode.gain.cancelScheduledValues(sound.gainNode.context.currentTime);
                    sound.gainNode.gain.setValueAtTime(0, sound.gainNode.context.currentTime);
                    sound.oscillator.stop();
                } catch (e) {
                    console.log('Error force stopping oscillator:', e);
                }
            } else if (sound.audio) {
                // Immediately pause and reset audio
                sound.audio.pause();
                sound.audio.currentTime = 0;
                sound.audio.volume = this.volume; // Restore volume for next play
            }
        });

        // Clear array and update status immediately
        this.currentlyPlaying = [];
        this.updateStatusDisplay();
        
        // Restore all button texts immediately
        this.restoreAllButtonTexts();

        console.log('All sounds force stopped');
    }

    updateStatusDisplay() {
        const playbackStatus = document.getElementById('playback-status');
        const currentSound = document.getElementById('current-sound');
        const setupStatus = document.getElementById('setup-status');
        const filesLoaded = document.getElementById('files-loaded');

        if (playbackStatus && currentSound) {
            // Update playback status
            if (this.currentlyPlaying.length > 0) {
                playbackStatus.textContent = 'Spielt ab';
                playbackStatus.className = 'status-value playing';
            } else {
                playbackStatus.textContent = 'Bereit';
                playbackStatus.className = 'status-value';
            }

            // Update current sound
            if (this.currentlyPlaying.length > 0) {
                const playing = this.currentlyPlaying[0];
                if (playing.isPreview) {
                    currentSound.textContent = 'Vorschau';
                } else if (playing.button) {
                    const soundType = playing.button.dataset.sound;
                    const soundName = this.getSoundDisplayName(soundType);
                    currentSound.textContent = soundName;
                } else {
                    currentSound.textContent = 'Test Sound';
                }
            } else {
                currentSound.textContent = '-';
            }
        }

        if (setupStatus && filesLoaded) {
            // Count total files and buttons with files
            let totalFiles = 0;
            let buttonsWithFiles = 0;
            const totalButtons = Object.keys(this.soundDefinitions).length;

            Object.entries(this.customSounds).forEach(([soundType, sounds]) => {
                totalFiles += sounds.length;
                if (sounds.length > 0) {
                    buttonsWithFiles++;
                }
            });

            // Update files loaded count
            filesLoaded.textContent = `${totalFiles}/${totalButtons}`;

            // Update setup status
            if (buttonsWithFiles === totalButtons) {
                setupStatus.textContent = 'Vollständig';
                setupStatus.className = 'status-value complete';
            } else if (buttonsWithFiles > 0) {
                setupStatus.textContent = 'Teilweise';
                setupStatus.className = 'status-value incomplete';
            } else {
                setupStatus.textContent = 'Unvollständig';
                setupStatus.className = 'status-value incomplete';
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
            'einlaufen': 'EINLAUFEN'
        };
        return displayNames[soundType] || soundType.toUpperCase();
    }

    fadeOutAudio(audio) {
        const fadeOutDuration = 1200; // 1.2 seconds
        const fadeOutSteps = 30;
        const stepDuration = fadeOutDuration / fadeOutSteps;
        const initialVolume = audio.volume;
        const volumeStep = initialVolume / fadeOutSteps;

        let currentStep = 0;

        console.log('Starting fade out for audio, initial volume:', initialVolume);

        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = Math.max(0, initialVolume - (volumeStep * currentStep));
            audio.volume = newVolume;

            console.log(`Fade step ${currentStep}/${fadeOutSteps}, volume: ${newVolume}`);

            if (currentStep >= fadeOutSteps || newVolume <= 0) {
                clearInterval(fadeInterval);
                console.log('Fade complete, pausing audio');
                audio.pause();
                audio.currentTime = 0;
                // Restore original volume for next play
                audio.volume = this.volume;

                // Remove from currentlyPlaying array
                this.currentlyPlaying = this.currentlyPlaying.filter(sound => sound.audio !== audio);
            }
        }, stepDuration);
    }

    fadeOutAudioFast(audio) {
        const fadeOutDuration = 500; // 0.5 seconds for faster response
        const fadeOutSteps = 20;
        const stepDuration = fadeOutDuration / fadeOutSteps;
        const initialVolume = audio.volume;
        const volumeStep = initialVolume / fadeOutSteps;

        let currentStep = 0;

        console.log('Starting fast fade out for audio, initial volume:', initialVolume);

        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = Math.max(0, initialVolume - (volumeStep * currentStep));
            audio.volume = newVolume;

            if (currentStep >= fadeOutSteps || newVolume <= 0) {
                clearInterval(fadeInterval);
                console.log('Fast fade complete, pausing audio');
                audio.pause();
                audio.currentTime = 0;
                // Restore original volume for next play
                audio.volume = this.volume;
            }
        }, stepDuration);
    }

    openSoundModal() {
        console.log('openSoundModal called');
        const modal = document.getElementById('sound-modal');
        if (modal) {
            modal.classList.add('show');
            this.updateFileList();
            this.setupModalEventListeners();
        }
    }

    closeSoundModal() {
        const modal = document.getElementById('sound-modal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    openHelpModal() {
        console.log('openHelpModal called');
        const modal = document.getElementById('help-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
            this.setupHelpModalEventListeners();
        }
    }

    closeHelpModal() {
        const modal = document.getElementById('help-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    }

    setupHelpModalEventListeners() {
        const modal = document.getElementById('help-modal');
        const closeBtn = document.getElementById('close-help');

        // Close button
        if (closeBtn) {
            closeBtn.onclick = () => this.closeHelpModal();
        }

        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeHelpModal();
            }
        };

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                this.closeHelpModal();
            }
        });
    }

    setupModalEventListeners() {
        console.log('Setting up modal event listeners');
        const modal = document.getElementById('sound-modal');

        const closeBtn = modal.querySelector('.close-btn');
        const soundTypeSelect = document.getElementById('sound-type-select');
        const fileInput = document.getElementById('file-input');
        const uploadZone = document.getElementById('upload-zone');
        const testBtn = document.getElementById('test-sound');
        const stopModalBtn = document.getElementById('stop-modal-sound');
        const clearBtn = document.getElementById('clear-files');

        console.log('Modal elements found:', { closeBtn, soundTypeSelect, fileInput, uploadZone, testBtn, clearBtn });

        // Close modal
        if (closeBtn) {
            closeBtn.onclick = () => this.closeSoundModal();
        }

        // Modal background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeSoundModal();
            }
        };

        // Sound type selection
        if (soundTypeSelect) {
            soundTypeSelect.onchange = (e) => {
                this.currentSoundType = e.target.value;
                this.updateFileList();
            };
        }

        // File upload
        if (uploadZone && fileInput) {
            uploadZone.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Upload zone clicked, triggering file input');
                fileInput.click();
            };

            fileInput.onchange = (e) => {
                console.log('File input changed:', e.target.files);
                this.handleFileUpload(e.target.files);
            };
        }

        // Drag and drop
        if (uploadZone) {
            uploadZone.ondragover = (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.add('dragover');
            };

            uploadZone.ondragenter = (e) => {
                e.preventDefault();
                e.stopPropagation();
            };

            uploadZone.ondragleave = (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.remove('dragover');
            };

            uploadZone.ondrop = (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.remove('dragover');
                console.log('Files dropped:', e.dataTransfer.files);
                this.handleFileUpload(e.dataTransfer.files);
            };
        }

        // Test, stop and clear buttons
        if (testBtn) {
            testBtn.onclick = () => this.testCurrentSound();
        }

        if (stopModalBtn) {
            stopModalBtn.onclick = () => this.stopAllSounds();
        }

        if (clearBtn) {
            clearBtn.onclick = () => this.clearCurrentSounds();
        }
    }
    handleFileUpload(files) {
        console.log('handleFileUpload called with files:', files);

        const validFiles = Array.from(files).filter(file =>
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        console.log('Valid MP3 files:', validFiles);

        if (validFiles.length === 0) {
            alert('Bitte wählen Sie nur MP3-Dateien aus.');
            return;
        }

        validFiles.forEach(file => {
            const url = URL.createObjectURL(file);
            const soundData = {
                name: file.name.replace('.mp3', ''),
                url: url,
                file: file
            };

            console.log('Adding sound data:', soundData);

            if (!this.customSounds[this.currentSoundType]) {
                this.customSounds[this.currentSoundType] = [];
            }

            this.customSounds[this.currentSoundType].push(soundData);
        });

        console.log('Current custom sounds:', this.customSounds);

        this.updateFileList();
        this.updateFileCountDisplays();
        this.updateStatusDisplay();
        this.saveSounds(); // Save to localStorage after adding files

        document.getElementById('file-input').value = '';
    }

    updateFileList() {
        console.log('updateFileList called for:', this.currentSoundType);

        const fileList = document.getElementById('file-list');
        const currentFiles = this.customSounds[this.currentSoundType] || [];

        console.log('Current files for', this.currentSoundType, ':', currentFiles);

        if (currentFiles.length === 0) {
            fileList.innerHTML = '<p class="no-files">Keine Dateien zugewiesen</p>';
            return;
        }

        fileList.innerHTML = currentFiles.map((sound, index) => `
            <div class="file-item">
                <span class="file-name">${sound.name}</span>
                <div class="file-actions">
                    <button class="play-file-btn" onclick="soundboard.playFilePreview(${index})" title="Abspielen">▶️</button>
                    <button class="remove-file-btn" onclick="soundboard.removeFile(${index})" title="Entfernen">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    playFilePreview(index) {
        const sound = this.customSounds[this.currentSoundType][index];
        if (sound) {
            const audio = new Audio(sound.url);
            console.log('Setting preview volume to:', this.volume);
            audio.volume = this.volume;

            // Ensure volume is set after audio loads
            audio.addEventListener('loadeddata', () => {
                audio.volume = this.volume;
            });

            // Track this preview sound so it can be stopped
            this.currentlyPlaying.push({ audio, button: null, isPreview: true });

            audio.play().catch(e => console.log('Preview play failed:', e));

            // Remove from tracking when it ends
            audio.onended = () => {
                this.currentlyPlaying = this.currentlyPlaying.filter(playingSound => playingSound.audio !== audio);
                this.updateStatusDisplay();
            };
        }
    }

    removeFile(index) {
        const sound = this.customSounds[this.currentSoundType][index];
        if (sound) {
            URL.revokeObjectURL(sound.url);
            this.customSounds[this.currentSoundType].splice(index, 1);
            this.updateFileList();
            this.updateFileCountDisplays();
            this.saveSounds(); // Save to localStorage after removing files
        }
    }

    testCurrentSound() {
        const button = document.querySelector(`[data-sound="${this.currentSoundType}"]`);
        if (button) {
            this.playSound(this.currentSoundType, button);
        }
    }

    clearCurrentSounds() {
        if (confirm('Alle Dateien für diesen Sound-Typ löschen?')) {
            const currentFiles = this.customSounds[this.currentSoundType] || [];
            currentFiles.forEach(sound => {
                URL.revokeObjectURL(sound.url);
            });
            this.customSounds[this.currentSoundType] = [];
            this.updateFileList();
            this.updateFileCountDisplays();
            this.saveSounds(); // Save to localStorage after clearing files
        }
    }
}

// Prevent default drag behavior on the entire document
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
});

// Global reference
let soundboard;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing soundboard...');
    soundboard = new HandballSoundboard();
});

console.log('Script.js loaded completely');
