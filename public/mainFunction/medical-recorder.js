// Medical ASR Audio Recorder with advanced features - COMPLETE FIXED VERSION
window.AudioContext = window.AudioContext || window.webkitAudioContext;

class MedicalAudioRecorder {
    constructor() {
        this.audioContext = null;
        this.mediaRecorder = null;
        this.stream = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = null;
        this.pausedTime = 0;
        this.totalPausedTime = 0;
        this.timerInterval = null;
        this.currentBlob = null;
        this.hasListenedFully = false;
        this.recordingSegments = [];
        this.currentPosition = 0;
        this.speakerInfoConfirmed = false;
        this.confirmedSpeakerData = {};
        
        // Content management
        this.currentSentenceIndex = 0;
        this.selectedLanguage = '';
        this.contentCompleted = false;
        
        // Predefined content for each language
        this.contentData = {
            french: {
                locales: [
                    { value: 'european-french', text: 'European French' },
                    { value: 'north-african-french', text: 'North African French' },
                    { value: 'canadian-french', text: 'Canadian French' }
                ],
                sentences: [
                    "Selon les dernières études, ABASAGLAR offre un excellent contrôle glycémique avec un risque réduit d'hypoglycémie.",
                    "Le traitement par ABASAGLAR a permis à mon père de mieux gérer son diabète de type 2 et d'éviter les complications associées.",
                    "Avez-vous déjà discuté avec votre médecin de l'utilisation d'ABASAGLAR pour traiter votre diabète, Madame Petit?",
                    "Les équipes de recherche d'AbbVie travaillent sans relâche pour trouver des solutions innovantes aux défis posés par les maladies auto-immunes complexes.",
                    "Selon les dernières études, les médicaments développés par AbbVie pour les maladies chroniques ont montré des résultats encourageants pour les patients comme Monsieur Blanchard.",
                    "Monsieur Delaunay, avez-vous déjà discuté avec votre médecin des traitements innovants proposés par AbbVie pour votre maladie chronique?"
                ]
            },
            spanish: {
                locales: [
                    { value: 'european-spanish', text: 'European Spanish' },
                    { value: 'us-spanish', text: 'US Spanish' },
                    { value: 'mexican-spanish', text: 'Mexican Spanish' },
                    { value: 'latin-spanish', text: 'Latin/South American Spanish' }
                ],
                sentences: [
                    "El médico me recetó Glicopirronio para tratar mi enfermedad pulmonar obstructiva crónica (EPOC).",
                    "Debido a los efectos secundarios del Glicopirronio, el Sr. Montoya decidió suspender su uso y buscar un tratamiento alternativo.",
                    "¿Ha considerado el uso de Glicopirronio en combinación con otros broncodilatadores para controlar mejor su asma?",
                    "Debido a la exposición prolongada a la Gliotoxina en su lugar de trabajo, el paciente Romero presenta síntomas neurológicos preocupantes.",
                    "Me preocupa que la Gliotoxina pueda afectar el desarrollo neuronal de mi bebé durante el embarazo, por lo que evito consumir alimentos mohosos.",
                    "Los investigadores están estudiando los efectos neurotóxicos de la Gliotoxina y su posible relación con enfermedades neurodegenerativas."
                ]
            }
        };
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeUI();
    }

    initializeUI() {
        // Disable recording section initially
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.add('disabled-section');
        }
        
        // Generate and set speaker code automatically
        this.generateSpeakerCode();
        
        // Disable all recording buttons initially
        this.disableRecordingControls();
        
        // Initialize content display
        this.updateContentDisplay();
    }

    generateSpeakerCode() {
        // Code will be auto-generated based on content selection
        const codeElement = document.getElementById('speakerCode');
        if (codeElement) {
            codeElement.value = '';
            codeElement.disabled = true; // Permanently disabled
            codeElement.placeholder = 'Will auto-update based on content';
            codeElement.style.backgroundColor = '#f8f9fa';
        }
        
        console.log('Speaker code input disabled - will auto-update based on content');
    }

    // Update speaker code based on language and sentence index
    updateSpeakerCode() {
        const codeElement = document.getElementById('speakerCode');
        if (!codeElement || !this.selectedLanguage) return;

        let prefix = '';
        if (this.selectedLanguage === 'french') {
            prefix = 'FN';
        } else if (this.selectedLanguage === 'spanish') {
            prefix = 'SP';
        }

        if (prefix) {
            const sentenceNumber = String(this.currentSentenceIndex + 1).padStart(3, '0');
            const newCode = `${prefix}${sentenceNumber}`;
            codeElement.value = newCode;
            console.log(`Auto-updated speaker code to: ${newCode}`);
        }
    }

    updateContentDisplay() {
        const contentDisplay = document.getElementById('currentContent');
        if (!contentDisplay) return;

        if (this.contentCompleted) {
            this.showCompletionScreen();
            return;
        }

        if (this.selectedLanguage && this.contentData[this.selectedLanguage]) {
            const sentences = this.contentData[this.selectedLanguage].sentences;
            const currentSentence = sentences[this.currentSentenceIndex];
            const progress = `${this.currentSentenceIndex + 1}/${sentences.length}`;
            
            // Update speaker code based on current content
            this.updateSpeakerCode();
            
            contentDisplay.innerHTML = `
                <div class="content-header">
                    <h5>Content to Record (${progress}):</h5>
                </div>
                <div class="content-text">
                    ${currentSentence}
                </div>
            `;
        } else {
            contentDisplay.innerHTML = `
                <div class="content-placeholder">
                    <p>Please select a language to see the content to record.</p>
                </div>
            `;
        }
    }

    showCompletionScreen() {
        const contentDisplay = document.getElementById('currentContent');
        const recordingSection = this.elements.recordingSection;
        
        if (contentDisplay) {
            contentDisplay.innerHTML = `
                <div class="completion-screen">
                    <div class="text-center">
                        <i class="fa fa-check-circle" style="font-size: 64px; color: #28a745; margin-bottom: 20px;"></i>
                        <h2 style="color: #28a745; margin-bottom: 20px;">Thank You!</h2>
                        <h4 style="margin-bottom: 20px;">Thank You for Your Participation!</h4>
                        <p style="font-size: 18px; margin-bottom: 30px;">
                            You have successfully completed all recordings for the selected language.
                        </p>
                    </div>
                </div>
            `;
        }
        
        // Disable recording section
        if (recordingSection) {
            recordingSection.classList.add('disabled-section');
        }
        this.disableRecordingControls();
    }

    startNewSession() {
        // Reset everything for a new session
        this.currentSentenceIndex = 0;
        this.selectedLanguage = '';
        this.contentCompleted = false;
        this.speakerInfoConfirmed = false;
        this.confirmedSpeakerData = {};
        
        // Generate new speaker code
        this.generateSpeakerCode();
        
        // Clear form
        this.clearForm();
        
        // Update UI
        this.updateContentDisplay();
        this.enableFormInputs();
        this.disableRecordingControls();
        
        // Reset recording section
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.add('disabled-section');
        }
        
        console.log('Started new session');
    }

    clearForm() {
        const fieldsToReset = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 'ageGroup', 'language', 'locale', 'deviceType'];
        fieldsToReset.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.value = '';
            }
        });
    }

    onLanguageChange() {
        const languageSelect = document.getElementById('language');
        const localeSelect = document.getElementById('locale');
        
        if (!languageSelect || !localeSelect) return;
        
        this.selectedLanguage = languageSelect.value;
        this.currentSentenceIndex = 0; // Reset to first sentence
        
        // Clear and populate locale options
        localeSelect.innerHTML = '<option value="">Select Locale</option>';
        
        if (this.selectedLanguage && this.contentData[this.selectedLanguage]) {
            const locales = this.contentData[this.selectedLanguage].locales;
            locales.forEach(locale => {
                const option = document.createElement('option');
                option.value = locale.value;
                option.textContent = locale.text;
                localeSelect.appendChild(option);
            });
        }
        
        // Update content display
        this.updateContentDisplay();
        
        console.log('Language changed to:', this.selectedLanguage);
    }

    disableRecordingControls() {
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = true;
        if (this.elements.pauseBtn) this.elements.pauseBtn.disabled = true;
        if (this.elements.listenBtn) this.elements.listenBtn.disabled = true;
        if (this.elements.rerecordBtn) this.elements.rerecordBtn.disabled = true;
        if (this.elements.submitBtn) this.elements.submitBtn.disabled = true;
    }

    enableRecordingControls() {
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = false;
        // Other buttons will be enabled/disabled based on recording state
    }

    initializeElements() {
        this.elements = {
            recordBtn: document.getElementById('recordBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            listenBtn: document.getElementById('listenBtn'),
            rerecordBtn: document.getElementById('rerecordBtn'),
            submitBtn: document.getElementById('submitBtn'),
            audioPlayback: document.getElementById('audioPlayback'),
            timerDisplay: document.getElementById('timerDisplay'),
            progressBar: document.getElementById('progressBar'),
            waveformCanvas: document.getElementById('waveformCanvas'),
            seekControls: document.getElementById('seekControls'),
            confirmSpeakerBtn: document.getElementById('confirmSpeakerBtn'),
            speakerFormContainer: document.getElementById('speakerFormContainer'),
            recordingSection: document.getElementById('recordingSection')
        };
    }

    setupEventListeners() {
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.pauseBtn.addEventListener('click', () => {
            if (this.isPaused) {
                this.resumeRecording();
            } else {
                this.pauseRecording();
            }
        });
        this.elements.listenBtn.addEventListener('click', () => this.listenAudio());
        this.elements.rerecordBtn.addEventListener('click', () => this.rerecord());
        this.elements.submitBtn.addEventListener('click', () => this.submitAudio());
        this.elements.confirmSpeakerBtn.addEventListener('click', () => this.confirmSpeakerInfo());
        
        // Audio playback events
        this.elements.audioPlayback.addEventListener('ended', () => this.onAudioEnded());
        this.elements.audioPlayback.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.elements.audioPlayback.addEventListener('loadedmetadata', () => this.onAudioLoaded());
        
        // Age input change event to auto-update age group
        document.getElementById('speakerAge').addEventListener('input', (e) => {
            this.updateAgeGroup(parseInt(e.target.value));
        });
        
        // Language change event
        document.getElementById('language').addEventListener('change', () => {
            this.onLanguageChange();
        });
    }

    updateAgeGroup(age) {
        const ageGroupSelect = document.getElementById('ageGroup');
        if (age >= 18 && age < 30) {
            ageGroupSelect.value = '18-30';
        } else if (age >= 30 && age < 45) {
            ageGroupSelect.value = '30-45';
        } else if (age >= 45 && age < 60) {
            ageGroupSelect.value = '45-60';
        } else if (age >= 60) {
            ageGroupSelect.value = '60+';
        } else {
            ageGroupSelect.value = '';
        }
    }

    confirmSpeakerInfo() {
        if (!this.validateSpeakerForm()) {
            return;
        }

        // Store confirmed speaker data (with default frequency)
        this.confirmedSpeakerData = {
            speakerId: document.getElementById('speakerId').value,
            speakerCode: document.getElementById('speakerCode').value,
            speakerName: document.getElementById('speakerName').value,
            speakerGender: document.getElementById('speakerGender').value,
            speakerAge: document.getElementById('speakerAge').value,
            ageGroup: document.getElementById('ageGroup').value,
            language: document.getElementById('language').value,
            locale: document.getElementById('locale').value,
            deviceType: document.getElementById('deviceType').value,
            targetFrequency: '44100' // Default frequency
        };

        this.speakerInfoConfirmed = true;

        // Disable all form inputs except code field (which is already disabled)
        this.disableFormInputs();

        // Change button to Edit mode
        this.switchToEditMode();

        // Enable recording section - ensure it's properly enabled
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.remove('disabled-section');
        }
        this.enableRecordingControls();
        
        // Ensure record button is specifically enabled for next recording
        if (this.elements.recordBtn) {
            this.elements.recordBtn.disabled = false;
        }

        console.log('Speaker information confirmed:', this.confirmedSpeakerData);
        console.log('Recording controls enabled for sentence:', this.currentSentenceIndex + 1);
    }

    switchToEditMode() {
        const confirmBtn = this.elements.confirmSpeakerBtn;
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fa fa-edit"></i> Edit Speaker Information';
            confirmBtn.className = 'btn btn-warning confirm-btn';
            
            // Remove all existing event listeners and add new one
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            // Get the new button reference
            this.elements.confirmSpeakerBtn = document.getElementById('confirmSpeakerBtn');
            this.elements.confirmSpeakerBtn.addEventListener('click', () => this.editSpeakerInfo());
        }
    }

    switchToConfirmMode() {
        const confirmBtn = this.elements.confirmSpeakerBtn;
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fa fa-check"></i> Confirm Speaker Information';
            confirmBtn.className = 'btn btn-success confirm-btn';
            
            // Remove all existing event listeners and add new one
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            // Get the new button reference
            this.elements.confirmSpeakerBtn = document.getElementById('confirmSpeakerBtn');
            this.elements.confirmSpeakerBtn.addEventListener('click', () => this.confirmSpeakerInfo());
        }
    }

    editSpeakerInfo() {
        console.log('Edit button clicked - enabling form inputs for sentence:', this.currentSentenceIndex + 1);
        
        // Re-enable all form inputs
        this.enableFormInputs();
        
        // Switch button back to confirm mode
        this.switchToConfirmMode();
        
        // Reset speaker info confirmation status
        this.speakerInfoConfirmed = false;
        
        // Disable recording section again until re-confirmed
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.add('disabled-section');
        }
        this.disableRecordingControls();
        
        console.log('Form inputs re-enabled, switched back to confirm mode. Recording disabled until re-confirmation.');
    }

    disableFormInputs() {
        // Disable all inputs except the code field and ageGroup (which are permanently disabled)
        const inputsToDisable = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 'language', 'locale', 'deviceType'];
        inputsToDisable.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = true;
                console.log(`Disabled input: ${id}`);
            }
        });
        console.log('Form inputs disabled (speakerCode and ageGroup remain permanently disabled)');
    }

    enableFormInputs() {
        // Enable all inputs except speakerCode and ageGroup (which remain permanently disabled)
        const inputs = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 'language', 'locale', 'deviceType'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element && id !== 'ageGroup') { // Keep ageGroup permanently disabled
                element.disabled = false;
                console.log(`Enabled input: ${id}`);
            }
        });
        console.log('All form inputs enabled (except speakerCode and ageGroup which remain disabled)');
    }

    validateSpeakerForm() {
        const requiredFields = [
            'speakerId', 'speakerName', 'speakerGender', 
            'speakerAge', 'ageGroup', 'language', 'locale', 'deviceType'
        ];
        
        for (const fieldId of requiredFields) {
            const field = document.getElementById(fieldId);
            if (!field.value.trim()) {
                alert(`Please fill in the ${field.previousElementSibling.textContent}`);
                field.focus();
                return false;
            }
        }
        
        // Check if language is selected and content is available
        if (!this.selectedLanguage || !this.contentData[this.selectedLanguage]) {
            alert('Please select a valid language');
            document.getElementById('language').focus();
            return false;
        }
        
        return true;
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new AudioContext();
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 44100,
                    channelCount: 1,
                    volume: 1.0,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.setupAudioVisualization();
            return true;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.updateStatus('Error: Microphone access denied', 'error');
            return false;
        }
    }

    setupAudioVisualization() {
        const source = this.audioContext.createMediaStreamSource(this.stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        source.connect(analyser);
        
        const canvas = this.elements.waveformCanvas;
        const ctx = canvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);
            
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#007bff';
            ctx.beginPath();
            
            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        };
        
        if (this.isRecording) {
            draw();
        }
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        if (!this.speakerInfoConfirmed) {
            alert('Please confirm speaker information first.');
            return;
        }

        const initialized = await this.initializeAudioContext();
        if (!initialized) return;

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];
            this.isRecording = true;
            this.isPaused = false;
            this.startTime = Date.now();
            this.totalPausedTime = 0;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.currentBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.onRecordingComplete();
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.startTimer();
            this.setupAudioVisualization();
            this.updateUI('recording');
            this.updateStatus('Recording in progress...', 'recording');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('Error starting recording', 'error');
        }
    }

    pauseRecording() {
        if (!this.isRecording || this.isPaused) return;

        this.isPaused = true;
        this.pausedTime = Date.now();
        this.mediaRecorder.pause();
        this.stopTimer();
        
        this.elements.pauseBtn.innerHTML = '<i class="fa fa-play"></i> Resume';
        this.elements.recordBtn.disabled = true;
        this.updateStatus('Recording paused', 'processing');
    }

    resumeRecording() {
        if (!this.isPaused) return;

        this.isPaused = false;
        this.totalPausedTime += Date.now() - this.pausedTime;
        this.mediaRecorder.resume();
        this.startTimer();
        
        this.elements.pauseBtn.innerHTML = '<i class="fa fa-pause"></i> Pause';
        this.elements.recordBtn.disabled = false;
        this.updateStatus('Recording resumed...', 'recording');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.isPaused = false;
        this.mediaRecorder.stop();
        this.stopTimer();
        
        // Stop all tracks to release microphone
        this.stream.getTracks().forEach(track => track.stop());
        
        this.updateUI('stopped');
        this.updateStatus('Recording completed', 'ready');
    }

    onRecordingComplete() {
        // Convert blob to URL and set up audio playback
        const audioUrl = URL.createObjectURL(this.currentBlob);
        this.elements.audioPlayback.src = audioUrl;
        this.elements.audioPlayback.classList.remove('hidden');
        
        // Enable listen button but keep re-record disabled until listen is complete
        this.elements.listenBtn.disabled = false;
        this.elements.rerecordBtn.disabled = true; // Keep disabled until listen is complete
        
        // Show seek controls
        this.elements.seekControls.classList.remove('hidden');
        
        this.updateStatus('Ready to listen. Please listen to the full audio before submitting.', 'ready');
    }

    listenAudio() {
        if (!this.currentBlob) return;
        
        this.hasListenedFully = false;
        this.elements.submitBtn.disabled = true;
        this.elements.rerecordBtn.disabled = true; // Keep disabled during playback
        this.elements.audioPlayback.currentTime = 0;
        this.elements.audioPlayback.play();
        
        this.updateStatus('Playing audio... Please listen to the complete recording.', 'processing');
    }

    onAudioEnded() {
        this.hasListenedFully = true;
        this.elements.submitBtn.disabled = false;
        this.elements.rerecordBtn.disabled = false; // Enable only after listening is complete
        this.updateStatus('Audio playback complete. You can now submit or re-record.', 'ready');
    }

    onTimeUpdate() {
        const audio = this.elements.audioPlayback;
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            this.elements.progressBar.style.width = progress + '%';
        }
    }

    onAudioLoaded() {
        // Audio metadata loaded
        console.log('Audio loaded, duration:', this.elements.audioPlayback.duration);
    }

    rerecord() {
        // Reset everything for new recording
        this.currentBlob = null;
        this.hasListenedFully = false;
        this.audioChunks = [];
        
        // Hide audio playback and seek controls
        this.elements.audioPlayback.classList.add('hidden');
        this.elements.seekControls.classList.add('hidden');
        
        // Reset UI
        this.updateUI('ready');
        this.resetTimer();
        this.updateStatus('Ready to record', 'ready');
        
        // Clear waveform canvas
        const canvas = this.elements.waveformCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    async submitAudio() {
        if (!this.hasListenedFully) {
            alert('Please listen to the complete audio before submitting.');
            return;
        }

        if (!this.speakerInfoConfirmed) {
            alert('Please confirm speaker information first.');
            return;
        }

        // Validate audio duration (8-18 seconds)
        if (this.elements.audioPlayback && this.elements.audioPlayback.duration) {
            const duration = this.elements.audioPlayback.duration;
            if (duration <= 8) {
                alert(`Audio recording is too short (${duration.toFixed(1)}s). Please record for at least 8 seconds.`);
                this.updateStatus('Recording too short - please re-record', 'error');
                return;
            }
            if (duration >= 18) {
                alert(`Audio recording is too long (${duration.toFixed(1)}s). Please keep recordings under 18 seconds.`);
                this.updateStatus('Recording too long - please re-record', 'error');
                return;
            }
            console.log(`✅ Audio duration valid: ${duration.toFixed(1)}s`);
        }

        // Set loading state
        this.setSubmitButtonLoading(true);
        this.updateStatus('Submitting audio...', 'processing');
        
        try {
            const formData = new FormData();
            
            // Convert webm to wav for better compatibility
            const wavBlob = await this.convertToWav(this.currentBlob);
            
            // Get current sentence for metadata
            const currentSentence = this.contentData[this.selectedLanguage].sentences[this.currentSentenceIndex];
            
            // Prepare form data using confirmed speaker data
            formData.append('audio', wavBlob, `recording_${this.currentSentenceIndex + 1}.wav`);
            formData.append('speakerId', this.confirmedSpeakerData.speakerId);
            formData.append('speakerCode', this.confirmedSpeakerData.speakerCode);
            formData.append('speakerName', this.confirmedSpeakerData.speakerName);
            formData.append('speakerGender', this.confirmedSpeakerData.speakerGender);
            formData.append('speakerAge', this.confirmedSpeakerData.speakerAge);
            formData.append('ageGroup', this.confirmedSpeakerData.ageGroup);
            formData.append('language', this.confirmedSpeakerData.language);
            formData.append('locale', this.confirmedSpeakerData.locale);
            formData.append('deviceType', this.confirmedSpeakerData.deviceType);
            formData.append('targetFrequency', this.confirmedSpeakerData.targetFrequency);
            formData.append('sentenceIndex', this.currentSentenceIndex);
            formData.append('sentenceText', currentSentence);
            formData.append('timestamp', new Date().toISOString());

            const response = await fetch('/api/submit-medical-audio', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (response.ok) {
                this.updateStatus('Audio submitted successfully!', 'ready');
                // Keep loading state for a moment to show success
                setTimeout(() => {
                    this.setSubmitButtonLoading(false);
                    this.progressToNextSentence();
                }, 1000);
            } else {
                throw new Error(result.message || 'Submission failed');
            }

        } catch (error) {
            console.error('Submission error:', error);
            this.updateStatus('Error submitting audio: ' + error.message, 'error');
            this.setSubmitButtonLoading(false);
        }
    }

    progressToNextSentence() {
        const totalSentences = this.contentData[this.selectedLanguage].sentences.length;
        
        console.log(`Current sentence completed: ${this.currentSentenceIndex + 1}/${totalSentences}`);
        
        // Move to next sentence
        this.currentSentenceIndex++;
        
        // Check if all sentences are completed
        if (this.currentSentenceIndex >= totalSentences) {
            this.contentCompleted = true;
            this.updateContentDisplay(); // This will show the completion screen
            console.log('All sentences completed - showing completion screen');
            return;
        }
        
        // Reset for next recording
        this.resetForNextRecording();
        
        // Update content display to show next sentence
        this.updateContentDisplay();
        
        console.log(`Progressed to sentence ${this.currentSentenceIndex + 1}/${totalSentences}`);
        console.log('Speaker info confirmed:', this.speakerInfoConfirmed);
        console.log('Recording controls enabled:', !this.elements.recordBtn.disabled);
    }

    async convertToWav(webmBlob) {
        // Create audio context for conversion
        const arrayBuffer = await webmBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to WAV format
        const wavBuffer = this.audioBufferToWav(audioBuffer);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    audioBufferToWav(buffer) {
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);

        // Convert float32 to int16
        const channelData = buffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }

        return arrayBuffer;
    }

    validateForm() {
        const requiredFields = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 'locale', 'deviceType'];
        
        for (const fieldId of requiredFields) {
            const field = document.getElementById(fieldId);
            if (!field.value.trim()) {
                alert(`Please fill in the ${field.previousElementSibling.textContent}`);
                field.focus();
                return false;
            }
        }
        
        return true;
    }

    resetForNextRecording() {
        // Reset recording-specific data only (keep speaker info and sentence progression)
        this.rerecord();
        
        // Reset submit button loading state
        this.setSubmitButtonLoading(false);
        
        // Ensure recording controls are properly enabled if speaker info is confirmed
        if (this.speakerInfoConfirmed) {
            this.enableRecordingControls();
            if (this.elements.recordingSection) {
                this.elements.recordingSection.classList.remove('disabled-section');
            }
        }
        
        // Don't clear speaker info or regenerate code - just reset recording state
        // The speaker info remains confirmed and the code stays the same
        
        console.log('Reset for next recording - sentence progression continues');
    }

    updateUI(state) {
        switch (state) {
            case 'recording':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-stop"></i> Stop Recording';
                this.elements.recordBtn.classList.add('recording');
                this.elements.pauseBtn.disabled = false;
                this.elements.listenBtn.disabled = true;
                this.elements.rerecordBtn.disabled = true;
                this.elements.submitBtn.disabled = true;
                break;
                
            case 'stopped':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-microphone"></i> Start Recording';
                this.elements.recordBtn.classList.remove('recording');
                this.elements.pauseBtn.disabled = true;
                this.elements.pauseBtn.innerHTML = '<i class="fa fa-pause"></i> Pause';
                break;
                
            case 'ready':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-microphone"></i> Start Recording';
                this.elements.recordBtn.classList.remove('recording');
                this.elements.recordBtn.disabled = false;
                this.elements.pauseBtn.disabled = true;
                break;
        }
    }

    updateStatus(message, type) {
        // Status messages removed - just use console for debugging
        console.log(`Status: ${message} (${type})`);
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime - this.totalPausedTime;
            const totalSeconds = Math.floor(elapsed / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            // Add visual feedback for recording duration (8-18 seconds valid range)
            let timerColor = '#000000'; // Default black
            if (totalSeconds < 8) {
                timerColor = '#dc3545'; // Red - too short
            } else if (totalSeconds >= 8 && totalSeconds < 18) {
                timerColor = '#28a745'; // Green - valid range
            } else {
                timerColor = '#fd7e14'; // Orange - getting too long
            }
            
            this.elements.timerDisplay.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.elements.timerDisplay.style.color = timerColor;
            
            // Add warning text for duration guidance
            if (totalSeconds < 8) {
                this.elements.timerDisplay.title = 'Recording too short - minimum 8 seconds required';
            } else if (totalSeconds >= 8 && totalSeconds < 18) {
                this.elements.timerDisplay.title = 'Recording duration is good (8-18 seconds)';
            } else {
                this.elements.timerDisplay.title = 'Recording getting too long - maximum 18 seconds';
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    resetTimer() {
        this.stopTimer();
        this.elements.timerDisplay.textContent = '00:00:00';
        this.elements.progressBar.style.width = '0%';
    }

    setSubmitButtonLoading(isLoading) {
        const submitBtn = this.elements.submitBtn;
        if (!submitBtn) return;

        if (isLoading) {
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa fa-spinner"></i> Submitting...';
        } else {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa fa-upload"></i> Submit';
        }
    }
}

// Seek functionality
function seekBackward(seconds) {
    const audio = document.getElementById('audioPlayback');
    audio.currentTime = Math.max(0, audio.currentTime - seconds);
}

function seekForward(seconds) {
    const audio = document.getElementById('audioPlayback');
    audio.currentTime = Math.min(audio.duration, audio.currentTime + seconds);
}

// Global variables
let medicalRecorder = null;

// Initialize the recorder when the page loads
document.addEventListener('DOMContentLoaded', function() {
    medicalRecorder = new MedicalAudioRecorder();
});
