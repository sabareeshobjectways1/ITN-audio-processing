/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

// var audioContext = new AudioContext();
// var audioInput = null,
//     realAudioInput = null,
//     inputPoint = null,
//     audioRecorder = null;
// var rafID = null;
// var analyserContext = null;
// var canvasWidth, canvasHeight;
// var recIndex = 0;

/* TODO:

- offer mono option
- "Monitor input" switch
*/
let timerInterval;
let seconds = 0;
let minutes = 0;

function startTimer() {
    seconds = 0;
    minutes = 0;
    updateTimerDisplay();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function updateTimer() {
    seconds++;
    if (seconds >= 60) {
        seconds = 0;
        minutes++;
    }
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = `${padZero(minutes)}:${padZero(seconds)}`;
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

function showAudioControls() {
    // document.getElementById('audioPlayback').classList.remove('hidden');
    document.getElementById('timer').classList.remove('hidden');
}

function hideAudioControls() {
    // document.getElementById('audioPlayback').classList.add('hidden');
    document.getElementById('timer').classList.add('hidden');
}

function saveAudio() {
    audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    // audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    var canvas = document.getElementById( "wavedisplay" );

    drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

    // the ONLY time gotBuffers is called is right after a new recording is completed -
    // so here's where we should set up the download.
    audioRecorder.exportWAV( doneEncoding );
    // audioRecorder.exportMonoWAV( doneEncoding );
}

function doneEncoding( blob ) {
    Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav", function(durl){
        window.dataURI = durl;
        fetch(durl)
        .then(res => res.blob())
        .then(blob => {
            window.testBlob = blob;
            $('.audio').remove();
            var aurl = (window.URL || window.webkitURL).createObjectURL(testBlob);
            var audio = $('<AUDIO controls>').prop('src',aurl).prop('type',"audio/wav").addClass('audio');

            $('#media').html();
            $('#media').append(audio);
        })

    } );

    recIndex++;
}


// var globalSequence = 1;
// var currentAudio = 0;
// var currentDifficulty = 'none';
// var audioContext, audioInput, audioRecorder;
// var nameSequenceMap = {};
// var globalNameSequence = parseInt(localStorage.getItem('globalNameSequence') || '1', 10);
// var globalSpeakerSequence = parseInt(localStorage.getItem('globalSpeakerSequence') || '1', 10);
var OurSequenceId = getSequence();
function updateLocalStorage() {
    localStorage.setItem('globalNameSequence', OurSequenceId);
    localStorage.setItem('globalSpeakerSequence', OurSequenceId);
}
function generateSpeakerId(gender, sequence, difficulty) {
    let genderCode = 'S'; 
    let sequenceNumber = sequence.toString().padStart(4, '0');  // Pads sequence with leading zeros, e.g., '0001'
   return genderCode + sequenceNumber;
}
try {
    console.log('nameSequenceMap before processing:', nameSequenceMap);

    if (nameSequenceMap && typeof nameSequenceMap === 'object') {
        Object.keys(nameSequenceMap).forEach(function(name) {
            var sequence = localStorage.getItem('nameSequence_' + name);
            console.log(`Checking name: ${name}, Sequence from localStorage: ${sequence}`);
            if (sequence) {
                nameSequenceMap[name] = sequence;
            }
        });
    } else {
        console.error('nameSequenceMap is not initialized or not an object');
    }
} catch (e) {
    console.error('Error retrieving sequences from localStorage:', e);
}

function getSequence() {
    var Final = $('#Speed').val(); 
    var Finaled = $('#WakeWord').val();
    console.log("speed="+Final);
    console.log("speedword="+Finaled);
    return OurSequence(Finaled,Final)
}
function OurSequence(Final, Finaled) {
    Final = Number(Final);     // Ensure it's a number
    Finaled = Number(Finaled); // Ensure it's a number

    console.log("jjjjj " + Final);
    console.log("llll " + Finaled);
    if(Finaled==1){
        var result = Final;
        return result
    }
    else{
        var result = Final + Finaled-1;
        return result
    }
}

function setupEventListeners() {
    // Save form state when input changes
    $('#userId, #userSId, #userName, #userGender, #userCountry, #userAge',"#WakeWord","#Speed").on('change input', function() {
        saveFormState();
        saveState();
        getSelectedOptionId1()
        
    });

    // Save state before page unload
    $(window).on('beforeunload', function() {
        saveFormState();
        saveState();
        

    });
}

function saveFormState() {
    try {
        const formData = {
            userId: $('#userId').val(),
            userSId: $('#userSId').val(),
            userName: $('#userName').val(),
            userGender: $('#userGender').val(),
            userCountry: $('#userCountry').val(),
            userAge: $('#userAge').val(),
            Speed: $('#Speed').val(),
            WakeWord: $('#WakeWord').val()
        };
        localStorage.setItem('formData', JSON.stringify(formData));
        console.log('Form data saved:', formData);
    } catch (error) {
        console.error('Error saving form data:', error);
    }
}
function initializeApp() {
    // First load any saved state
    loadSavedState();
    
    // Then set up event listeners
    setupEventListeners();
    
    // Finally update the display
    updateDisplay();

    getSequence();
}
function loadFormState() {
    try {
        const formDataString = localStorage.getItem('formData');
        if (formDataString) {
            const formData = JSON.parse(formDataString);
            $('#userId').val(formData.userId || '');
            $('#userSId').val(formData.userSId || '');
            $('#userName').val(formData.userName || '');
            $('#userGender').val(formData.userGender || '');
            $('#userCountry').val(formData.userCountry || '');
            $('#userAge').val(formData.userAge || '');
            $('#Speed').val(formData.Speed || '');
            $('#WakeWord').val(formData.WakeWord || '');
        }
    } catch (error) {
        console.error('Error loading form data:', error);
    }
}
function loadSavedState() {
    try {
        // Load form data first
        loadFormState();
        
        // Load other state variables
        currentAudio = parseInt(localStorage.getItem('currentAudio')) || 0;
        currentDifficulty = localStorage.getItem('currentDifficulty') || 'comfortable_slow';
        globalSequence = parseInt(localStorage.getItem('globalSequence')) || 1;
        globalNameSequence = parseInt(localStorage.getItem('globalNameSequence')) || 1;
        globalSpeakerSequence = parseInt(localStorage.getItem('globalSpeakerSequence')) || 1;
        Speed = localStorage.getItem('Speed') || '';
        WakeWord = localStorage.getItem('WakeWord') || '';
        const savedNameSequenceMap = localStorage.getItem('nameSequenceMap');
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};
        
        console.log('Loaded state:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence,
            Speed,
            WakeWord
        });
    } catch (error) {
        console.error('Error loading saved state:', error);
        initializeDefaultState();
    }
}

// Add this JavaScript function
function clearAllData() {
    try {
        // Clear localStorage
        localStorage.clear();
        
        // Clear all cookies
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        // Reset all form fields
        $('#userId,#userSId, #userName, #userGender, #userCountry, #userAge',"#WakeWord option:selected","#Speed option:selected").val('');
        
        // Reset all global variables
    currentAudio = 0;
    currentDifficulty = 'comfortable_slow';
    globalSequence = 1;
    globalNameSequence = 1;
    globalSpeakerSequence = 1;
    nameSequenceMap = {};
    $('#Speed').val('');
    $('#WakeWord').val('');
    
    
        
        // Hide all audio-related elements
        $('#record').hide();
        $('#save').hide();
        $('#analyser').hide();
        $('#wavedisplay').hide();
        $('.audio').remove();
        
        // Update the display
        updateDisplay();
        
        // Show success message
        alert('All data has been cleared successfully!');
        
        // Optional: Reload the page to ensure a fresh start
        window.location.reload();
        
    } catch (error) {
        console.error('Error clearing data:', error);
        alert('Error occurred while clearing data');
    }
}
$(document).ready(function() {
    initializeApp();
    $('#clearAllData').on('click', function() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            clearAllData();
        }
    });
});

function sendAudio() {
    
    var speakerId = $('#userId').val().trim();
    var speakerSId = $('#userSId').val().trim();
    var name = $('#userName').val().trim();
    var gender = $('#userGender').val().trim();
    var country = $('#userCountry').val().trim();
    var age = $('#userAge').val().trim() * 1;
    var WakeWorde = $('#WakeWord option:selected').text();
    var Speede = $("#Speed option:selected").text();

    var audioId = 1;
    var speed = Speede;
    var textToSend = WakeWorde;  
    var data = dataURI;
    var ageRange;

    if (age < 18) {
        ageRange = 'A';
    } else if (age >= 18 && age <= 24) {
        ageRange = 'B';
    } else if (age >= 25 && age <= 29) {
        ageRange = 'C';
    } else if (age >= 30 && age <= 35) {
        ageRange = 'D';
    } else {
        ageRange = 'E'; // Handle cases where age is not within specified ranges
    }
    if (speakerId === '') {
        alert('Please fill in your Speaker Id');
        return $('#userId').focus();
    }
    if (name === '') {
        alert('Please fill in your name');
        return $('#userName').focus();
    }
    if (gender === '') {
        alert('Please select your gender');
        return $('#userGender').focus();
    }
    if (!age) {
        alert('Please fill in your age');
        return $('#userAge').focus();
    }
    if (age > 200) {
        alert('Please check your age,Once again !');
        return $('#userAge').focus();
    }
    if (country === '') {
        alert('Please select your country');
        return $('#userCountry').focus();
    }
    if (WakeWorde === '') {
        alert('Please select your country');
        return $('#userCountry').focus();
    }
    if (Speede === '') {
        alert('Please select your country');
        return $('#userCountry').focus();
    }

    // if (!nameSequenceMap[name]) {
    //     nameSequenceMap[name] = 'G' + globalNameSequence.toString().padStart(4, '0');
    //     globalNameSequence++;
    //     updateLocalStorage();  // Update localStorage whenever a new name sequence is created
    // }

// var nameSequence = nameSequenceMap[name];
// var speakerId = nameSequence + '_' + generateSpeakerId(gender, globalSpeakerSequence, currentDifficulty);
let genderFormat = gender.toLowerCase();
// var globalSpeakerSequence = texts.find(item => item[Speede] === WakeWorde)?.id || "Not found";
var sequencef=getSequence();
var speakerId_sequence = speakerId + '_' + speakerSId;
// globalSpeakerSequence++;
updateLocalStorage();
const countryLanguageMap = {
    "India": "en-in",
    "UK": "en-uk",
    "US": "en-us",
    "Canada": "en-ca",
    "Australia": "en-au"
    // Add more country-language mappings as needed
};

const languageCode = countryLanguageMap[country]
    $('#mymodal').modal({ backdrop: 'static' }).find('.modal-footer').hide();
    $('#mymodal').find('.modal-header').hide();
    $('#mymodal').find('.modal-body').html('<div class="spinner-border text-secondary spinner-border-sm" role="status"><span class="sr-only">Loading...</span></div> Sending Audio File...');
    // $.post( 'http://localhost:8088/audio_upload', {
    // $.post( 'https://adlservice.objectways.com/audio_upload', {
    // $.post('http://54.87.91.147:8088/audio_upload', {
        
        console.log("JSONNNNNNN",{speakerId: speakerId,
            speakerId: speakerId_sequence,//G0001_S0001
            format_Id:speakerId,//G0001
            name: name,//Loganathan
            gender: genderFormat,//Male
            age: ageRange,//C
            jsonCountry:languageCode,
            country: country,//India
            id: audioId,
            idk: sequencef,
            speakerId_sequence:speakerId_sequence,
            speed: Speede,//Cofrtable_slow
            text: WakeWorde,//Wake_word
            dataURI: data,
        });
        $.ajax({
            url: "/audio_upload",
            type: "POST",
            data: JSON.stringify({
              speakerId: speakerId_sequence,
              format_Id: speakerId,
              name: name,
              gender: genderFormat,
              age: ageRange,
              jsonCountry: languageCode,
              country: country,
              id: audioId,
              speakerId_sequence: speakerId_sequence,
              speed: speed,
              text: textToSend,
              audioData: data, // Base64 Audio Data - Make sure this is uncommented and correct
            }),
            contentType: "application/json",
            processData: false,
            success: function (res) {
                console.log("Data uploaded successfully:", res);
                console.log("Inside success condition check:", res === "Audio data uploaded successfully!");
                if (res === "Audio data uploaded successfully!") {
                // Proceed to next audio
                $("#loadingIndicator").hide();
                $("#mymodal").modal("hide");
                globalSequence++;
                globalSpeakerSequence++;
                saveState();
                nextAudio(); // Move to the next audio
              } else {
                alert("Some error occurred while saving the audio. Please try again.");
              }
            },
            error: function (xhr, status, error) {
              console.error("Error uploading data:", error);
              alert("Error uploading data. Please try again.");
            },
          });
}

// Function to move to the next audio
function nextAudio() {
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('#alert').show();
    $('.audio').remove();
    $('#record').text('Start Recording');

    // if (currentDifficulty === 'fast') {
    //     currentAudio++;
    //     currentDifficulty = 'slow';
    // } else if (currentDifficulty === 'normal') {
    //     currentDifficulty = 'fast';
    // } else if (currentDifficulty === 'none') {
    //     currentDifficulty = 'slow';
    // } else {
    //     currentDifficulty = 'normal';
    // }
    const prevDifficulty = currentDifficulty;
    const prevAudio = currentAudio;
    if (currentDifficulty === 'comfortable_slow') {
        currentDifficulty = 'comfortable_normal'; // After 'comfortable-slow', go to 'comfortable-normal'
    } else if (currentDifficulty === 'comfortable_normal') {
        currentDifficulty = 'comfortable_fast'; // After 'comfortable-normal', go to 'comfortable-fast'
    } else if (currentDifficulty === 'comfortable_fast') {
        currentDifficulty = 'soft_slow'; // After 'comfortable-fast', go to 'soft-slow'
    }else if (currentDifficulty === 'none') {
            currentDifficulty = 'comfortable_slow';
        } 
    else if (currentDifficulty === 'soft_slow') {
        currentDifficulty = 'soft_normal'; // After 'soft-slow', go to 'soft-normal'
    } else if (currentDifficulty === 'soft_normal') {
        currentDifficulty = 'soft_fast'; // After 'soft-normal', go to 'soft-fast'
    } else if (currentDifficulty === 'soft_fast') {
        currentAudio++; // Increment the audio or perform any related action
        currentDifficulty = 'comfortable_slow'; // Restart the cycle at 'comfortable-slow'
    }
    saveState(); 
    let correction = false;
    if (correction) {
        updateDisplay();
    } else {
        console.error('Text not found for current audio and difficulty level');
        audioDone();
    }
}

function saveState() {
    try {
        localStorage.setItem('currentAudio', currentAudio);
        localStorage.setItem('currentDifficulty', currentDifficulty);
        localStorage.setItem('globalSequence', globalSequence);
        localStorage.setItem('globalNameSequence', globalNameSequence);
        localStorage.setItem('globalSpeakerSequence', OurSequenceId);
        localStorage.setItem('nameSequenceMap', JSON.stringify(nameSequenceMap));
        localStorage.setItem('Speed',Speed );
        localStorage.setItem('WakeWord',WakeWord);
        
        // Also save form state
        saveFormState();
        
        console.log('State saved:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence,
            Speed,
            WakeWord
        });
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

// Modified loadState function to handle missing data
function loadState() {
    try {
        const savedAudio = localStorage.getItem('currentAudio');
        const savedDifficulty = localStorage.getItem('currentDifficulty');
        const savedGlobalSequence = localStorage.getItem('globalSequence');
        const savedGlobalNameSequence = localStorage.getItem('globalNameSequence');
        const savedGlobalSpeakerSequence = localStorage.getItem('globalSpeakerSequence');
        const savedNameSequenceMap = localStorage.getItem('nameSequenceMap');
        const savedSpeeed = localStorage.getItem('Speed');
        const savedNameword = localStorage.getItem('WakeWord');
        
        currentAudio = savedAudio !== null ? parseInt(savedAudio) : 0;
        currentDifficulty = savedDifficulty !== null ? parseInt(savedDifficulty) : 'comfortable_slow';
        Speed = savedSpeeed || '';
        WakeWord = savedNameword || '';
        globalSequence = savedGlobalSequence !== null ? parseInt(savedGlobalSequence) : 1;
        globalNameSequence = savedGlobalNameSequence !== null ? parseInt(savedGlobalNameSequence) : 1;
        globalSpeakerSequence = savedGlobalSpeakerSequence !== null ? parseInt(savedGlobalSpeakerSequence) : 1;
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};
        
        // Update display after loading state
        updateDisplay();
    } catch (error) {
        console.error('Error loading state:', error);
        // Initialize with default values if there's an error
        initializeDefaultState();
    }
}
function updateDisplay() {
    try {
        let correction = true;
        var selectedValue = $("#WakeWord").val();
        var selectedValue1 = $("#Speed").val();

        let WakeWord=$('#WakeWord option:selected').text();
        let Speed=$('#Speed option:selected').text();
        if (WakeWord && Speed) {
            const formattedDifficulty = Speed.replace(/_/g, ' ');
            $('#title').html(['Text', 1, 'of', 1, '-', 'Please Read the sentence', formattedDifficulty, ' and record the following sentence'].join(' '));
            $('#texttorec').html(WakeWord + ' <em style="color: gray;">-' + formattedDifficulty + '</em>');
        } 
        else if(WakeWord=='' || Speed==''){
            $('#title').html(['Text', 1, 'of', 1, '-', 'Please Read the sentence', 'comfortable slow', ' and record the following sentence'].join(' '));
            $('#texttorec').html('Enter you Wake word ' + ' <em style="color: gray;">-' + 'Speed' + '</em>');
        }
        else {
            console.warn('No text found for current position:', currentAudio, currentDifficulty);
            audioDone()

        }
        $('#WakeWord, #Speed').change(updateDisplay);
    } catch (error) {
        console.error('Error updating display:', error);
    }
}
function initializeDefaultState() {
    currentAudio = 0;
    currentDifficulty = 'comfortable_slow';
    globalSequence = 1;
    globalNameSequence = 1;
    globalSpeakerSequence = OurSequenceId;
    nameSequenceMap = {};
    // var WakeWord=$('#WakeWord').val();
    // var Speed=$('#Speed').val();
    // updateDisplay();
    $('#WakeWord, #Speed').change(updateDisplay);
}
function clearAllSavedState() {
    try {
        localStorage.clear(); // Clear all localStorage data
        initializeDefaultState();
        $('#userId, #userName, #userGender, #userCountry, #userAge').val(''); // Clear form fields
    } catch (error) {
        console.error('Error clearing state:', error);
    }
}

function Audioed(){
    $('#record').hide();
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('.audio').remove();
    $('#title').hide();
    $('#alert').hide();
    $('#texttorec').hide();
    $('#done').show();
    clearAllSavedState();
}
function audioDone()
{
    $('#record').show();
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('.audio').remove();
    $('#title').hide();
    $('#alert').show();
    // $('#texttorec').hide();
    // $('#done').show();
    $('#title').html(['Text', 1, 'of', 1, '-', 'Please Read the sentence', 'comfortable slow', ' and record the following sentence'].join(' '));
    $('#texttorec').html('Enter you Wake word ' + ' <em style="color: gray;">-' + 'Speed' + '</em>');
    // clearAllSavedState();
}

// function toggleRecording( e ) {
//     if( !window.audioInit ) initAudio();
//     console.log( 'audioRecorder', audioRecorder )
//     if( !audioRecorder )
//     {
//         return setTimeout( function(){ toggleRecording(e)}, 100 );
//     }
//     console.log( 'tEXT', $('#record').text() );
//     if ($('#record').text().match(/Stop/)) {
//         // stop recording
//         console.log( 'stop' )
//         audioRecorder.stop();
//         $('#record').removeClass("btn-danger");
//         $('#record').text('Record Again');
//         $('#save').show();
//         $('#analyser').hide();
//         $('#wavedisplay').show();
//         audioRecorder.getBuffers( gotBuffers );
//     } else {
//         // start recording
//         if (!audioRecorder)
//             return;
//         console.log( 'record')
//         $('#save').hide();
//         $('#analyser').show();
//         $('#wavedisplay').hide();
//         $('.audio').remove();
//         $('#record').addClass("btn-danger");
//         $('#record').text('Stop Recording');
//         audioRecorder.clear();
//         audioRecorder.record();
//     }
// }
function toggleRecording(e) {
    if (!window.audioInit) initAudio();
    console.log('audioRecorder', audioRecorder);
    if (!audioRecorder) {
        return setTimeout(function() { toggleRecording(e) }, 100);
    }
    console.log('tEXT', $('#record').text());
    if ($('#record').text().match(/Stop/)) {
        // stop recording
        console.log('stop');
        audioRecorder.stop();
        $('#record').removeClass("btn-danger");
        $('#record').text('Record Again');
        $('#save').show();
        $('#analyser').hide();
        $('#wavedisplay').show();
        stopTimer();
        hideTimer(); // Add this line to hide the timer
        audioRecorder.getBuffers(gotBuffers);
    } else {
        // start recording
        if (!audioRecorder)
            return;
        console.log('record');
        $('#save').hide();
        $('#analyser').show();
        $('#wavedisplay').hide();
        $('.audio').remove();
        $('#record').addClass("btn-danger");
        $('#alert').hide();
        $('#record').text('Stop Recording');
        audioRecorder.clear();
        audioRecorder.record();
        showAudioControls();
        startTimer();
    }
}

// Add this new function to hide the timer
function hideTimer() {
    document.getElementById('timer').classList.add('hidden');
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers(time) {
    if (!analyserContext) {
        var canvas = document.getElementById("analyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analyserContext = canvas.getContext('2d');
    }

    // analyzer draw code here
    {
        var SPACING = 3;
        var BAR_WIDTH = 1;
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData);

        analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext.fillStyle = '#F6D565';
        analyserContext.lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier;
            var magnitude2 = freqByteData[i * multiplier];
            analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
    }

    rafID = window.requestAnimationFrame( updateAnalysers );
}

function toggleMono() {
    if (audioInput != realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    audioInput.connect(inputPoint);
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    updateAnalysers();
    return true;
}

function initAudio() {
    window.audioContext = new AudioContext();
    window.audioInput = null;
    window.realAudioInput = null;
    window.inputPoint = null;
    window.audioRecorder = null;
    window.rafID = null;
    window.analyserContext = null;
    window.canvasWidth;
    window.canvasHeight;
    window.recIndex = 0;
    window.audioInit = true;

        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestFAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}

// window.addEventListener('load', initAudio );
// $(document).ready(function () {
//     loadState();
//     nextAudio();
// });