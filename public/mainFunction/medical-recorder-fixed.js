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
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeUI();
    }

    initializeUI() {
        // Disable recording section initially
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.add('disabled-section');
        }
        
        // Disable all recording buttons initially
        this.disableRecordingControls();
    }

    disableRecordingControls() {
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = true;
        if (this.elements.pauseBtn) this.elements.pauseBtn.disabled = true;
        if (this.elements.stopBtn) this.elements.stopBtn.disabled = true;
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
            stopBtn: document.getElementById('stopBtn'),
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
        this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
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

        // Store confirmed speaker data
        this.confirmedSpeakerData = {
            speakerId: document.getElementById('speakerId').value,
            speakerCode: document.getElementById('speakerCode').value,
            speakerName: document.getElementById('speakerName').value,
            speakerGender: document.getElementById('speakerGender').value,
            speakerAge: document.getElementById('speakerAge').value,
            ageGroup: document.getElementById('ageGroup').value,
            locale: document.getElementById('locale').value,
            deviceType: document.getElementById('deviceType').value,
            targetFrequency: document.getElementById('targetFrequency').value
        };

        this.speakerInfoConfirmed = true;

        // Disable all form inputs except code field
        this.disableFormInputs();

        // Change button to Edit mode
        this.switchToEditMode();

        // Enable recording section
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.remove('disabled-section');
        }
        this.enableRecordingControls();

        console.log('Speaker information confirmed:', this.confirmedSpeakerData);
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
        console.log('Edit button clicked - enabling form inputs');
        
        // Re-enable all form inputs
        this.enableFormInputs();
        
        // Switch button back to confirm mode
        this.switchToConfirmMode();
        
        // Reset speaker info confirmation status
        this.speakerInfoConfirmed = false;
        
        // Disable recording section again
        if (this.elements.recordingSection) {
            this.elements.recordingSection.classList.add('disabled-section');
        }
        this.disableRecordingControls();
        
        console.log('Form inputs re-enabled, switched back to confirm mode');
    }

    disableFormInputs() {
        // Disable all inputs except the code field (keep code field enabled for next recording)
        const inputsToDisable = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 'ageGroup', 'locale', 'deviceType', 'targetFrequency'];
        inputsToDisable.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = true;
                console.log(`Disabled input: ${id}`);
            }
        });
        console.log('Form inputs disabled (except speakerCode)');
    }

    enableFormInputs() {
        // Enable all inputs
        const inputs = ['speakerId', 'speakerCode', 'speakerName', 'speakerGender', 'speakerAge', 'ageGroup', 'locale', 'deviceType', 'targetFrequency'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
                console.log(`Enabled input: ${id}`);
            }
        });
        console.log('All form inputs enabled');
    }

    validateSpeakerForm() {
        const requiredFields = [
            'speakerId', 'speakerCode', 'speakerName', 'speakerGender', 
            'speakerAge', 'ageGroup', 'locale', 'deviceType', 'targetFrequency'
        ];
        
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
        
        // Enable listen and re-record buttons
        this.elements.listenBtn.disabled = false;
        this.elements.rerecordBtn.disabled = false;
        
        // Show seek controls
        this.elements.seekControls.classList.remove('hidden');
        
        this.updateStatus('Ready to listen. Please listen to the full audio before submitting.', 'ready');
    }

    listenAudio() {
        if (!this.currentBlob) return;
        
        this.hasListenedFully = false;
        this.elements.submitBtn.disabled = true;
        this.elements.audioPlayback.currentTime = 0;
        this.elements.audioPlayback.play();
        
        this.updateStatus('Playing audio... Please listen to the complete recording.', 'processing');
    }

    onAudioEnded() {
        this.hasListenedFully = true;
        this.elements.submitBtn.disabled = false;
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

        this.updateStatus('Submitting audio...', 'processing');
        
        try {
            const formData = new FormData();
            
            // Convert webm to wav for better compatibility
            const wavBlob = await this.convertToWav(this.currentBlob);
            
            // Prepare form data using confirmed speaker data
            formData.append('audio', wavBlob, 'recording.wav');
            formData.append('speakerId', this.confirmedSpeakerData.speakerId);
            formData.append('speakerCode', this.confirmedSpeakerData.speakerCode);
            formData.append('speakerName', this.confirmedSpeakerData.speakerName);
            formData.append('speakerGender', this.confirmedSpeakerData.speakerGender);
            formData.append('speakerAge', this.confirmedSpeakerData.speakerAge);
            formData.append('ageGroup', this.confirmedSpeakerData.ageGroup);
            formData.append('locale', this.confirmedSpeakerData.locale);
            formData.append('deviceType', this.confirmedSpeakerData.deviceType);
            formData.append('targetFrequency', this.confirmedSpeakerData.targetFrequency);
            formData.append('timestamp', new Date().toISOString());

            const response = await fetch('/api/submit-medical-audio', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (response.ok) {
                this.updateStatus('Audio submitted successfully! Ready for next recording.', 'ready');
                this.resetForNextRecording();
            } else {
                throw new Error(result.message || 'Submission failed');
            }

        } catch (error) {
            console.error('Submission error:', error);
            this.updateStatus('Error submitting audio: ' + error.message, 'error');
        }
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
        // Reset recording-specific data
        this.rerecord();
        
        // Only clear the code field
        const codeElement = document.getElementById('speakerCode');
        if (codeElement) {
            codeElement.value = '';
        }
        
        // Update confirmed speaker data to remove code
        this.confirmedSpeakerData.speakerCode = '';
    }

    updateUI(state) {
        switch (state) {
            case 'recording':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-stop"></i> Stop Recording';
                this.elements.recordBtn.classList.add('recording');
                this.elements.pauseBtn.disabled = false;
                this.elements.stopBtn.disabled = false;
                this.elements.listenBtn.disabled = true;
                this.elements.rerecordBtn.disabled = true;
                this.elements.submitBtn.disabled = true;
                break;
                
            case 'stopped':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-microphone"></i> Start Recording';
                this.elements.recordBtn.classList.remove('recording');
                this.elements.pauseBtn.disabled = true;
                this.elements.stopBtn.disabled = true;
                this.elements.pauseBtn.innerHTML = '<i class="fa fa-pause"></i> Pause';
                break;
                
            case 'ready':
                this.elements.recordBtn.innerHTML = '<i class="fa fa-microphone"></i> Start Recording';
                this.elements.recordBtn.classList.remove('recording');
                this.elements.recordBtn.disabled = false;
                this.elements.pauseBtn.disabled = true;
                this.elements.stopBtn.disabled = true;
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
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            
            this.elements.timerDisplay.textContent = 
                `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
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
        this.elements.timerDisplay.textContent = '00:00';
        this.elements.progressBar.style.width = '0%';
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
