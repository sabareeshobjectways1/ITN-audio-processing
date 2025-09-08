
window.AudioContext = window.AudioContext || window.webkitAudioContext;

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
    // audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    var canvas = document.getElementById( "wavedisplay" );

    drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

    // the ONLY time gotBuffers is called is right after a new recording is completed -
    // so here's where we should set up the download.
    // audioRecorder.exportWAV( doneEncoding );
    audioRecorder.exportMonoWAV( doneEncoding );
}
function parseWAVInfo(blob) {
    const reader = new FileReader();
    reader.onload = function() {
        const buffer = new DataView(reader.result);

        // Extract WAV header info
        const numChannels = buffer.getUint16(22, true);
        const sampleRate = buffer.getUint32(24, true);
        const bitsPerSample = buffer.getUint16(34, true);
        const dataSize = buffer.getUint32(40, true);
        const durationSec = dataSize / (sampleRate * numChannels * (bitsPerSample / 8));

        const duration = formatDuration(durationSec);
        const fileSizeKB = (blob.size / 1024).toFixed(1);
        const bitrate = ((sampleRate * bitsPerSample * numChannels) / 1000).toFixed(2); // in kbps
        const sampleEncoding = `${bitsPerSample}-bit Signed Integer PCM`;

        // Log in the format you want
        console.log(`Channels       : ${numChannels}`);
        console.log(`Sample Rate    : ${sampleRate}`);
        console.log(`Precision      : ${bitsPerSample}-bit`);
        console.log(`Duration       : ${duration} = ${dataSize} samples`);
        console.log(`File Size      : ${fileSizeKB}k`);
        console.log(`Bit Rate       : ${bitrate}k`);
        console.log(`Sample Encoding: ${sampleEncoding}`);
    };
    reader.readAsArrayBuffer(blob);
}
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 100);
    return `${padZero(mins)}:${padZero(secs)}.${padZero(millis)}`;
}

function doneEncoding( blob ) {
    parseWAVInfo(blob);
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

function updateLocalStorage() {
    localStorage.setItem('globalNameSequence', globalNameSequence);
    localStorage.setItem('globalSpeakerSequence', globalSpeakerSequence);
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
function setupEventListeners() {
    // Save form state when input changes
    $('#userId, #userName, #userGender, #userCountry, #userAge').on('change input', function() {
        saveFormState();
        saveState();
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
            userName: $('#userName').val(),
            userGender: $('#userGender').val(),
            userCountry: $('#userCountry').val(),
            userAge: $('#userAge').val()
        };
        localStorage.setItem('formData', JSON.stringify(formData));
        var Main=formData.userId;
        var MainNew=formData.userCountry;
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
}
function loadFormState() {
    try {
        const formDataString = localStorage.getItem('formData');
        if (formDataString) {
            const formData = JSON.parse(formDataString);
            $('#userId').val(formData.userId || '');
            $('#userName').val(formData.userName || '');
            $('#userGender').val(formData.userGender || '');
            $('#userCountry').val(formData.userCountry || '');
            $('#userAge').val(formData.userAge || '');
        }
    } catch (error) {
        console.error('Error loading form data:', error);
    }
}
let isFailuresTableVisible = false; // Add this line to track table visibility
let failedValidationsData = null; // Add this line to store table data

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
        
        const savedNameSequenceMap = localStorage.getItem('nameSequenceMap');
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};
        
        // Load table visibility state
        isFailuresTableVisible = localStorage.getItem('isFailuresTableVisible') === 'true';
        const savedFailedValidationsData = localStorage.getItem('failedValidationsData');
        failedValidationsData = savedFailedValidationsData ? JSON.parse(savedFailedValidationsData) : null;
        console.log('Loaded state:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence,
            isFailuresTableVisible,
            failedValidationsData
        });
        if (isFailuresTableVisible && failedValidationsData) {
            displayFailuresTable(failedValidationsData); // Call function to display table if it was visible
        }

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
        $('#userId, #userName, #userGender, #userCountry, #userAge').val('');
        
        // Reset all global variables
        currentAudio = 0;
    currentDifficulty = 'comfortable_slow';
    globalSequence = 1;
    globalNameSequence = 1;
    globalSpeakerSequence = 1;
    nameSequenceMap = {};
    isFailuresTableVisible = false; // Reset table visibility state
    failedValidationsData = null;
        // Hide all audio-related elements
        $('#record').hide();
        $('#save').hide();
        $('#analyser').hide();
        $('#wavedisplay').hide();
        $('.audio').remove();
        $('#failuresContainer').addClass('d-none'); // Hide failures table
        $('#done').hide(); // Hide "Done" message
        $('#doneMove').hide(); // Hide "Move to re-record" button
        $('#title').show(); // Show title
        $('#alert').show(); // Show alert
        $('#texttorec').show(); // Show text to record
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
function doneMove() {
        const format_Id = $('#userId').val().trim(); // Get format_Id from input field
        const jsonCountry = $('#userCountry').val().trim(); // Get jsonCountry from select
            currentAudio = 0;
        if (format_Id && jsonCountry) {
            window.location.href = `/re-record/${format_Id}/${jsonCountry}`; // Redirect to /index with path params
        } else {
            alert("Please enter Speaker ID and Country before proceeding."); // Or handle as needed
        }
    }

function sendAudio() {

    var speakerId = $('#userId').val().trim();
    var name = $('#userName').val().trim();
    var gender = $('#userGender').val().trim();
    var country = $('#userCountry').val().trim();
    var age = $('#userAge').val().trim() * 1;
    if (!texts || currentAudio < 0 || currentAudio >= texts.length) {
        console.error("Error: currentAudio is out of range or texts is not initialized.");
        return; // Or handle this case appropriately
    }
    var speed = currentDifficulty;
    var textToSend = texts[currentAudio][currentDifficulty];  
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

let genderFormat = gender.toLowerCase();
var speakerId_sequence = speakerId + '_' + generateSpeakerId(gender, globalSpeakerSequence, currentDifficulty);

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

        console.log("JSONNNNNNN",{speakerId: speakerId,
            name: name,
            gender: gender,
            age: ageRange,
            country: country,
            speakerId_sequence:speakerId_sequence,
            speed: speed,
            text: textToSend,
            dataURI: data,
        });

        var data_send = {
            speakerId: speakerId,
            name: name,
            gender: gender,
            age: ageRange,
            country: country,
            speakerId_sequence:speakerId_sequence,
            speed: speed,
            text: textToSend,
            dataURI: data,
        };

        $.get('/env', function (env) {
            const API_URL = `${env.API_URL}`;
        //dhinesh python send data
        fetch(`${API_URL}/save_audio`, {  // Update with your backend URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data_send)
        })
        .then(response => response.json())
        .then(result => {
            console.log('Success:', result);
        })
        .catch(error => {
            console.error('Error:', error);
        });
    })
    
    uploadAudio({
        speakerId: speakerId,
        format_Id: speakerId,
        name: name,
        gender: genderFormat,
        age: ageRange,
        jsonCountry: languageCode,
        country: country,
        speakerId_sequence: speakerId_sequence,
        speed: speed,
        text: textToSend,
        audioData: data
      });
}
    let isUploading = false;

    function uploadAudio({
        speakerId,
        format_Id,
        name,
        gender,
        age,
        jsonCountry,
        country,
        speakerId_sequence,
        speed,
        text,
        audioData,
      }) {
        if (isUploading) return;
        isUploading = true;
      
        $.ajax({
          url: "/audio_upload",
          type: "POST",
          data: JSON.stringify({
            speakerId:speakerId_sequence,
            format_Id,
            name,
            gender,
            age,
            jsonCountry,
            country,
            speakerId_sequence,
            speed,
            text,
            audioData,
          }),
          contentType: "application/json",
          processData: false,
          success: function (res) {
            isUploading = false;
            console.log("Data uploaded successfully:", res);
            if (res === "Audio data uploaded successfully!") {
              $("#loadingIndicator").hide();
              $("#mymodal").modal("hide");
              globalSequence++;
              globalSpeakerSequence++;
              saveState();
              nextAudio();
            } else {
              alert("Some error occurred while saving the audio.");
            }
          },
          error: function (xhr, status, error) {
            isUploading = false;
            console.error("Error uploading data:", error);
            alert("Error uploading data. Please try again.");
          },
        });
      }
      

// Function to move to the next audio
async function nextAudio() {
    console.log("Moving to the next audio...");
  // Add your logic to fetch or load the next audio
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('#alert').show();
    $('.audio').remove();
    $('#record').text('Start Recording');
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
    if (texts[currentAudio] && texts[currentAudio][currentDifficulty]) {
        updateDisplay();
        // loadNextAudioData();
    } else {
        console.error('Text not found for current audio and difficulty level');
        await fetchFailedValidations()
    }
}

function saveState() {
    try {
        localStorage.setItem('currentAudio', currentAudio);
        localStorage.setItem('currentDifficulty', currentDifficulty);
        localStorage.setItem('globalSequence', globalSequence);
        localStorage.setItem('globalNameSequence', globalNameSequence);
        localStorage.setItem('globalSpeakerSequence', globalSpeakerSequence);
        localStorage.setItem('nameSequenceMap', JSON.stringify(nameSequenceMap));
        localStorage.setItem('isFailuresTableVisible', isFailuresTableVisible); // Save table visibility state
        localStorage.setItem('failedValidationsData', JSON.stringify(failedValidationsData)); // Save table data
        // Also save form state
        saveFormState();
        
        console.log('State saved:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence,
            isFailuresTableVisible,
            failedValidationsData
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
        const savedIsFailuresTableVisible = localStorage.getItem('isFailuresTableVisible'); // Load table visibility
        const savedFailedValidationsData = localStorage.getItem('failedValidationsData'); // Load table data

        currentAudio = savedAudio !== null ? parseInt(savedAudio) : 0;
        currentDifficulty = savedDifficulty || 'comfortable_slow';
        globalSequence = savedGlobalSequence !== null ? parseInt(savedGlobalSequence) : 1;
        globalNameSequence = savedGlobalNameSequence !== null ? parseInt(savedGlobalNameSequence) : 1;
        globalSpeakerSequence = savedGlobalSpeakerSequence !== null ? parseInt(savedGlobalSpeakerSequence) : 1;
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};
        isFailuresTableVisible = savedIsFailuresTableVisible === 'true'; // Restore table visibility state from localStorage
        failedValidationsData = savedFailedValidationsData ? JSON.parse(savedFailedValidationsData) : null; // Restore table data

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
        if (isFailuresTableVisible && failedValidationsData) {
            displayFailuresTable(failedValidationsData); // If table should be visible, display it
        }
        else if (texts[currentAudio] && texts[currentAudio][currentDifficulty]) {
            const formattedDifficulty = currentDifficulty.replace(/_/g, ' ');
            $('#title').html(['Text', currentAudio + 1, 'of', texts.length, '-', 'Please Read the sentence', formattedDifficulty, ' and record the following sentence'].join(' '));
            $('#texttorec').html(texts[currentAudio][currentDifficulty] + ' <em style="color: gray;">-' + formattedDifficulty + '</em>');
            $('#failuresContainer').addClass('d-none'); // Ensure table is hidden if not supposed to be visible
            $('#done').hide(); // Ensure "Done" message is hidden
            $('#doneMove').hide(); // Ensure "Move to re-record" button is hidden
            $('#title').show(); // Show title
            $('#alert').show(); // Show alert
            $('#texttorec').show(); // Show text to record
        } else {
            console.warn('No text found for current position:', currentAudio, currentDifficulty);
            audioDone()

        }
    } catch (error) {
        console.error('Error updating display:', error);
    }
}
function initializeDefaultState() {
    currentAudio = 0;
    currentDifficulty = 'comfortable_slow';
    globalSequence = 1;
    globalNameSequence = 1;
    globalSpeakerSequence = 1;
    nameSequenceMap = {};
    isFailuresTableVisible = false; // Initialize table visibility to false
    failedValidationsData = null; // Initialize table data to null
    updateDisplay();
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

//dhinesh python send data
$.get('/env', function (env) {
    API_URL = `${env.API_URL}`;
})
async function fetchFailedValidations() {
    try {
        var speakerId = $('#userId').val().trim(); 
        const country = $('#userCountry').val().trim(); 
        const url = `${API_URL}/checkfails/${encodeURIComponent(speakerId)}/${encodeURIComponent(country)}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('checkfails--->',data);
        if (data.length === 0) {
            audioDone();
            isFailuresTableVisible = false; // Set table visibility to false when audioDone is called
            failedValidationsData = null;
        } 
        else {
            isFailuresTableVisible = true; // Set table visibility to true when failures are fetched
            failedValidationsData = data; // Store the fetched data
            displayFailuresTable(data);
            saveState(); // Save state immediately after displaying table
        }
    } catch (error) {
        console.error('Error fetching failed validations:', error);
    }
}
async function displayFailuresTable(data) {
    $('#record').hide();
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('#timer').hide();
    $('.audio').remove();
    $('#title').hide();
    $('#alert').hide();
    $('#texttorec').hide();
    $('#doneMove').show()
    console.log('Failed validations:', data);
    document.getElementById('failuresContainer').classList.remove('d-none');

    const tbody = document.querySelector('#failuresTable tbody');
    tbody.innerHTML = ''; // clear previous rows if any

    await data.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.name || ''}</td>
            <td>${item.speakerid || ''}</td>
            <td>${item.speakerId_sequence || ''}</td>
            <td>${item.text || ''}</td>
            <td>${item.speed || ''}</td>
        `;
        tbody.appendChild(row);
    });
}

function audioDone()
{
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
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

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

$(document).ready(function () {
    // Get environment variables from the server
    $.get('/env', function (env) {
      API_URL = env.API_URL; // Use the value from the response
    });
  });

